require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;

// Проверка env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL или SUPABASE_ANON_KEY не заданы в .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());

// --- ФУНКЦИЯ ПРОВЕРКИ АВТОРИЗАЦИИ (ОХРАННИК) ---
const authenticateToken = async (req, res, next) => {
    // Ищем токен (билет) в заголовках запроса
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Доступ запрещен. Вы не авторизованы.' });

    // Проверяем билет через Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) return res.status(403).json({ error: 'Неверный или просроченный токен.' });

    // Если всё ок, пропускаем пользователя дальше
    req.user = user;
    next();
};

// ---------------- ROUTES ---------------- //

// Проверка сервера
app.get('/', (req, res) => {
  res.send('Сервер аукциона работает! 🚀');
});

// 1. Получить все активные лоты (Публично) + СОРТИРОВКА + ИМЯ ПРОДАВЦА
app.get('/api/lots', async (req, res) => {
  const { category, search, sort } = req.query; 

  // Базовый запрос: только активные лоты 
  // <-- ОБНОВЛЕНО: Добавили profiles:seller_id(username) для получения имени продавца
  let query = supabase
    .from('lots')
    .select(`*, lot_images(image_url), profiles:seller_id(username)`) 
    .gt('end_time', new Date().toISOString());

  // Фильтры
  if (category && category !== 'all') {
    query = query.eq('category', category);
  }
  if (search) {
    query = query.ilike('title', `%${search}%`);
  }

  // --- ЛОГИКА СОРТИРОВКИ ---
  if (sort === 'price_asc') {
      query = query.order('current_price', { ascending: true }); // Дешевые сверху
  } else if (sort === 'price_desc') {
      query = query.order('current_price', { ascending: false }); // Дорогие сверху
  } else if (sort === 'ending_soon') {
      query = query.order('end_time', { ascending: true }); // Те, что скоро закончатся
  } else {
      // По умолчанию ('newest')
      query = query.order('created_at', { ascending: false }); // Самые свежие
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});


// Создать лот
app.post('/api/lots', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Вы не авторизованы!' });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Неверный токен' });
    }

    const seller_id = user.id; // <-- Ты молодец, что сохранил ID сюда
    const { title, description, category, starting_price, end_time, images, buy_now_price } = req.body;

    if (!title || starting_price == null || !end_time) {
      return res.status(400).json({ error: 'Заполни обязательные поля' });
    }
  
    // 1. Создаем сам лот
    const { data, error } = await supabase
      .from('lots')
      .insert([{ 
          title, 
          description, 
          category, 
          starting_price, 
          current_price: starting_price, 
          end_time, 
          seller_id: seller_id, // <--- ИСПРАВИЛИ ЗДЕСЬ! Берем переменную из 12 строки
          buy_now_price: buy_now_price || null // <-- А ЭТО СТРОЧКА ИДЕАЛЬНА!
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // 2. Если с фронтенда пришли картинки - сохраняем их
    if (images && Array.isArray(images) && images.length > 0) {
      const imageRecords = images.map(url => ({
        lot_id: data.id,
        image_url: url
      }));
      
      const { error: imagesError } = await supabase
        .from('lot_images')
        .insert(imageRecords);
        
      if (imagesError) {
        console.error("❌ Ошибка при сохранении картинок в БД:", imagesError);
      }
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ==========================================
// НОВЫЙ РОУТ: Мгновенная покупка "Купить сейчас"
// ==========================================
app.post('/api/lots/:id/buy-now', async (req, res) => {
    // --- БЛОК АВТОРИЗАЦИИ (как в остальных твоих роутах) ---
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Вы не авторизованы!' });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Неверный токен' });
    // -------------------------------------------------------

    const lotId = req.params.id;
    const userId = user.id; // <-- Берем id из user

    try {
        // 1. Ищем лот
        const { data: lot, error: fetchError } = await supabase.from('lots').select('*').eq('id', lotId).single();
        if (fetchError || !lot) return res.status(404).json({ error: 'Лот не найден' });
        
        // 2. Проверяем, можно ли его купить
        if (new Date() > new Date(lot.end_time)) return res.status(400).json({ error: 'Аукцион уже завершен' });
        if (!lot.buy_now_price) return res.status(400).json({ error: 'Для этого лота нет опции "Купить сейчас"' });

        // 3. Делаем победную ставку от лица покупателя
        const { error: bidError } = await supabase.from('bids').insert([{
            lot_id: lotId,
            bidder_id: userId,
            amount: lot.buy_now_price
        }]);
        if (bidError) throw bidError;

        // 4. Обновляем цену и СРАЗУ ЗАВЕРШАЕМ аукцион (меняем время на текущее)
        const { error: updateError } = await supabase.from('lots').update({
            current_price: lot.buy_now_price,
            end_time: new Date().toISOString()
        }).eq('id', lotId);
        if (updateError) throw updateError;

        res.json({ message: 'Поздравляем с покупкой!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Сделать ставку на лот
app.post('/api/lots/:id/bids', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Вы не авторизованы!' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Неверный токен' });

  const bidder_id = user.id;
  const lotId = req.params.id;
  const { amount } = req.body;

  console.log(`\n--- ПОПЫТКА СТАВКИ ---`);
  console.log(`Лот ID: ${lotId}`);
  console.log(`Сумма ставки: ${amount}`);

  // 1. Ищем лот
  const { data: lot, error: lotError } = await supabase
    .from('lots')
    .select('current_price, end_time')
    .eq('id', lotId)
    .single();

  if (lotError) {
    console.error("❌ Ошибка базы данных (Поиск лота):", lotError);
    return res.status(404).json({ error: `Ошибка БД: ${lotError.message}` });
  }

  // 2. Проверка времени
  if (new Date() > new Date(lot.end_time)) {
    return res.status(400).json({ error: 'Аукцион уже завершен' });
  }

  // 3. Проверка суммы
  if (amount <= lot.current_price) {
    return res.status(400).json({ error: 'Ставка должна быть больше текущей цены' });
  }

  // 4. Записываем ставку
  const { error: bidError } = await supabase
    .from('bids')
    .insert([{ lot_id: lotId, bidder_id, amount }]);

  if (bidError) {
    console.error("❌ Ошибка базы данных (Запись ставки):", bidError);
    return res.status(500).json({ error: `Ошибка записи ставки: ${bidError.message}` });
  }

  // 5. Обновляем цену лота
  const { error: updateError } = await supabase
    .from('lots')
    .update({ current_price: amount })
    .eq('id', lotId);

  if (updateError) {
     console.error("❌ Ошибка базы данных (Обновление цены):", updateError);
     return res.status(500).json({ error: `Ошибка обновления цены: ${updateError.message}` });
  }

  console.log("✅ Ставка успешно принята!");
  res.json({ message: 'Ставка успешно принята!' });
});

// 5. Получить лоты, созданные текущим пользователем
app.get('/api/users/me/lots', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Вы не авторизованы!' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Неверный токен' });

  const { data, error } = await supabase
    .from('lots')
    .select('*, lot_images(image_url)') 
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 6. Получить историю ставок текущего пользователя
app.get('/api/users/me/bids', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Вы не авторизованы!' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Неверный токен' });

  const { data, error } = await supabase
    .from('bids')
    .select(`
      id,
      amount,
      created_at,
      lots ( id, title, current_price, end_time, lot_images(image_url) ) 
    `)
    .eq('bidder_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 7. Удалить лот 
app.delete('/api/lots/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Вы не авторизованы!' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Неверный токен' });

  const lotId = req.params.id;

  try {
    const { data: lot, error: lotError } = await supabase
      .from('lots')
      .select('seller_id')
      .eq('id', lotId)
      .single();

    if (lotError) return res.status(404).json({ error: 'Лот не найден' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile && profile.role === 'admin';

    if (lot.seller_id !== user.id && !isAdmin) {
      return res.status(403).json({ error: 'У вас нет прав на удаление этого лота!' });
    }

    const { error: deleteError } = await supabase
      .from('lots')
      .delete()
      .eq('id', lotId);

    if (deleteError) throw deleteError;

    res.json({ message: 'Лот успешно удален 🗑️' });
  } catch (error) {
    console.error('Ошибка при удалении:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// 8. Поставить или убрать лайк (Добавить в избранное)
app.post('/api/lots/:id/favorite', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Вы не авторизованы!' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Неверный токен' });

  const lotId = req.params.id;
  const userId = user.id;

  const { data: existingFavorite } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', userId)
    .eq('lot_id', lotId)
    .single();

  if (existingFavorite) {
    await supabase.from('favorites').delete().eq('id', existingFavorite.id);
    return res.json({ status: 'removed', message: 'Лот удален из избранного' });
  } else {
    await supabase.from('favorites').insert([{ user_id: userId, lot_id: lotId }]);
    return res.json({ status: 'added', message: 'Лот добавлен в избранное ❤️' });
  }
});

// 9. Получить избранные лоты пользователя
app.get('/api/users/me/favorites', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Вы не авторизованы!' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Неверный токен' });

  const { data, error } = await supabase
    .from('favorites')
    .select(`
      id,
      lots ( *, lot_images(image_url) )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 10. Получить историю ставок для конкретного лота (Публично)
app.get('/api/lots/:id/bids', async (req, res) => {
  const lotId = req.params.id;
  
  const { data, error } = await supabase
    .from('bids')
    .select('amount, created_at, bidder_id')
    .eq('lot_id', lotId)
    .order('amount', { ascending: false }); 

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// <-- ДОБАВЛЕНО: 11. Получить публичный профиль продавца и его лоты -->
app.get('/api/users/:id/public', async (req, res) => {
  const sellerId = req.params.id;

  // Получаем имя продавца
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', sellerId)
    .single();

  // Получаем его активные лоты
  const { data: lots, error } = await supabase
    .from('lots')
    .select('*, lot_images(image_url)')   
    .eq('seller_id', sellerId)
    .gt('end_time', new Date().toISOString());

  if (error) return res.status(500).json({ error: error.message });
  res.json({ username: profile?.username || 'Аноним', lots });
});

// 12. СЕКРЕТНАЯ ПАНЕЛЬ: Получить ВСЕ лоты (только для Админа)
app.get('/api/admin/lots', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет токена' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Неверный токен' });

  // Проверка на админа
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещен. Вы не администратор.' });
  }

  // Запрашиваем ВСЕ лоты без фильтра по времени
  const { data, error } = await supabase
    .from('lots')
    .select('*, profiles:seller_id(username)')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ==========================================
// ОТЗЫВЫ О ПРОДАВЦАХ
// ==========================================

// 1. Оставить отзыв
app.post('/api/users/:id/reviews', authenticateToken, async (req, res) => {
    const sellerId = req.params.id;
    const buyerId = req.user.id;
    const { rating, comment } = req.body;

    if (sellerId === buyerId) return res.status(400).json({ error: 'Нельзя оставить отзыв самому себе!' });

    try {
        const { error } = await supabase.from('reviews').insert([{
            seller_id: sellerId,
            buyer_id: buyerId,
            rating,
            comment
        }]);

        if (error) throw error;
        res.json({ message: 'Отзыв успешно добавлен!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Получить список отзывов продавца
app.get('/api/users/:id/reviews', async (req, res) => {
    try {
        // Достаем все отзывы
        const { data: reviews, error } = await supabase
            .from('reviews')
            .select('*')
            .eq('seller_id', req.params.id)
            .order('created_at', { ascending: false });
            
        if (error) throw error;

        // Аккуратно подтягиваем имена и аватарки тех, кто оставил отзыв
        for (let review of reviews) {
            const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', review.buyer_id).single();
            review.buyer = profile || { username: 'Аноним' };
        }

        res.json(reviews);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// ОПЛАТА (STRIPE)
// ==========================================

// 1. Создание сессии оплаты
app.post('/api/lots/:id/checkout', authenticateToken, async (req, res) => {
    const lotId = req.params.id;
    const userId = req.user.id;

    try {
        // Получаем лот и победную ставку
        const { data: lot } = await supabase.from('lots').select('*').eq('id', lotId).single();
        const { data: bids } = await supabase.from('bids').select('*').eq('lot_id', lotId).order('amount', { ascending: false }).limit(1);
        const winningBid = bids && bids.length > 0 ? bids[0] : null;

        // Проверяем, завершен ли аукцион и является ли юзер победителем
        if (new Date() < new Date(lot.end_time)) return res.status(400).json({ error: 'Аукцион еще не завершен' });
        if (!winningBid || winningBid.bidder_id !== userId) return res.status(403).json({ error: 'Вы не победитель этого лота' });
        if (lot.is_paid) return res.status(400).json({ error: 'Лот уже оплачен' });

        // Создаем чек в Stripe
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: lot.title },
                    unit_amount: Math.round(winningBid.amount * 100), // Stripe работает в центах
                },
                quantity: 1,
            }],
            mode: 'payment',
            // ВАЖНО: Stripe вернет пользователя по этим ссылкам
            success_url: `https://build-auction-1.onrender.com/?payment_success=true&lot_id=${lotId}`,
            cancel_url: `https://build-auction-1.onrender.com/`,
        });

        res.json({ url: session.url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Отметка об успешной оплате
app.post('/api/lots/:id/mark-paid', authenticateToken, async (req, res) => {
    try {
        await supabase.from('lots').update({ is_paid: true }).eq('id', req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ---------------- START ---------------- //
app.listen(port, () => {
  console.log(`Сервер запущен: http://localhost:${port}`);
});