const API_URL = 'https://build-auction.onrender.com/api';
const supabaseUrl = 'https://vphyopvpxoruhyqwrlos.supabase.co'; 
const supabaseKey = 'sb_publishable_NMVwPdeJU_NFDHPCmES5WQ_NgqzNe0S'; 

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
let currentSession = null;
const myBidLotIds = new Set();  

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); 
    }, 3000);
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    const guestInfo = document.getElementById('guest-info');
    const userInfo = document.getElementById('user-info');
    const mainNav = document.getElementById('main-nav');
    const authModal = document.getElementById('auth-modal');
    
    const protectedSections = document.querySelectorAll('.protected-content');

    if (session) {
        if(guestInfo) guestInfo.style.display = 'none';
        if(userInfo) userInfo.style.display = 'block';
        if(mainNav) mainNav.style.display = 'flex'; 
        if(authModal) closeAuthModal(); // Закрываем окно, если успешно вошли
        
        protectedSections.forEach(el => el.style.display = 'block');

// Найди место, где получаешь username и замени запрос на этот:
supabaseClient.from('profiles').select('username, avatar_url').eq('id', session.user.id).single()
    .then(({data}) => {
        if (data) {
            if (document.getElementById('current-username')) {
                document.getElementById('current-username').innerText = data.username;
            }
            // Если ссылка на аватар есть — ставим её в кружочек
            if (data.avatar_url && document.getElementById('user-avatar')) {
                document.getElementById('user-avatar').src = data.avatar_url;
            }
        }
    });

            supabaseClient.from('bids').select('lot_id').eq('bidder_id', session.user.id)
            .then(({data}) => {
                if (data) data.forEach(bid => myBidLotIds.add(bid.lot_id));
            });

        if (document.getElementById('my-lots-container')) {
            loadMyProfile(); 
        }

        if (document.getElementById('admin-lots-tbody')) {
            loadAdminPanel();
        }

    } else {
        if(guestInfo) guestInfo.style.display = 'block';
        if(userInfo) userInfo.style.display = 'none';
        if(mainNav) mainNav.style.display = 'none';
        
        protectedSections.forEach(el => el.style.display = 'none');
    }
});

// Функции открытия/закрытия окна авторизации
function showAuthModal() {
    const modal = document.getElementById('auth-modal');
    if(modal) modal.style.display = 'block';
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if(modal) modal.style.display = 'none';
}

async function register() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const username = document.getElementById('username').value;
    if (!username) return showToast('Введите имя!', 'error');

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) showToast('Ошибка: ' + error.message, 'error');
    else if (data.user) {
        await supabaseClient.from('profiles').insert([{ id: data.user.id, username }]);
        showToast('Регистрация успешна!', 'success');
        closeAuthModal();
    }
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) showToast('Ошибка: ' + error.message, 'error');
    else {
        showToast('Успешный вход!', 'success');
        closeAuthModal();
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    showToast('Вы вышли из аккаунта', 'info');
    window.location.href = 'index.html'; 
}

// --- ОПРЕДЕЛЯЕМ, НА КАКОЙ МЫ СТРАНИЦЕ ПРИ ЗАГРУЗКЕ ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Загружаем сохраненную тему
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        updateThemeIcon(true);
    }

    if (document.getElementById('lots-container')) loadLots();
});

// --- СТАВКИ, ЛАЙКИ И УДАЛЕНИЕ ---
async function placeBid(lotId) {
    // ВЫЗЫВАЕМ ОКНО, ЕСЛИ НЕТ СЕССИИ
    if (!currentSession) {
        showAuthModal();
        return;
    }
    const amount = Number(document.getElementById(`bid-input-${lotId}`).value);
    if (!amount) return showToast('Введите сумму', 'error');

    const response = await fetch(`${API_URL}/lots/${lotId}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
        body: JSON.stringify({ amount })
    });
if (response.ok) { 
        showToast('Ставка принята!', 'success'); 
        myBidLotIds.add(lotId); // <-- ДОБАВИЛИ: Запоминаем, что мы только что сделали ставку тут
        loadLots(); 
    } else { 
        const err = await response.json(); 
        showToast(`Ошибка: ${err.error}`, 'error'); 
    }
}

async function toggleFavorite(lotId) {
    // ВЫЗЫВАЕМ ОКНО, ЕСЛИ НЕТ СЕССИИ
    if (!currentSession) {
        showAuthModal();
        return;
    }
    const response = await fetch(`${API_URL}/lots/${lotId}/favorite`, { method: 'POST', headers: { 'Authorization': `Bearer ${currentSession.access_token}` }});
    if (response.ok) {
        const res = await response.json(); showToast(res.message, 'success');
        const hBtn = document.getElementById(`heart-${lotId}`);
        if (hBtn) hBtn.innerText = res.status === 'added' ? '❤️' : '🤍';
        if (document.getElementById('my-favorites-container')) loadMyProfile();
    }
}

// Закрываем модалки при клике мимо них
window.addEventListener('click', (e) => { 
    const mBids = document.getElementById('bids-modal'); 
    if (e.target === mBids) mBids.style.display = 'none'; 
    const mAuth = document.getElementById('auth-modal');
    if (e.target === mAuth) mAuth.style.display = 'none';
});



// --- REALTIME ---
supabaseClient.channel('public:lots') 
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lots' }, (payload) => {
      const priceElement = document.querySelector(`#lot-price-${payload.new.id}`);
      if (priceElement) {
          priceElement.innerText = `Текущая цена: $${payload.new.current_price}`;
          priceElement.style.transition = 'color 0.3s';
          priceElement.style.color = '#27ae60'; 
          setTimeout(() => priceElement.style.color = '', 1000);
      }
  }).subscribe();


  // --- РЕАЛТАЙМ: УВЕДОМЛЕНИЯ О ПЕРЕБИТЫХ СТАВКАХ ---
supabaseClient.channel('public:bids')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids' }, async (payload) => {
      const newBid = payload.new;
      
      // Проверяем: авторизованы ли мы, делали ли мы ставку на этот лот ранее, и ЧУЖАЯ ли это ставка?
      if (currentSession && myBidLotIds.has(newBid.lot_id) && newBid.bidder_id !== currentSession.user.id) {
          
          // Узнаем название лота, чтобы уведомление было понятным
          const { data } = await supabaseClient.from('lots').select('title').eq('id', newBid.lot_id).single();
          const lotTitle = data ? data.title : 'один из лотов';
          
          // Выстреливаем красное уведомление!
          showToast(`⚠️ Вашу ставку на "${lotTitle}" перебили! Новая цена: $${newBid.amount}`, 'error');
          
          // Если мы сейчас сидим на странице профиля - незаметно обновляем её, чтобы рамка лота стала красной
          if (document.getElementById('my-bids-container') && document.getElementById('my-bids-container').innerHTML !== '') {
              loadMyProfile();
          }
      }
  })
  .subscribe();

// --- ОПРЕДЕЛЯЕМ, НА КАКОЙ МЫ СТРАНИЦЕ ПРИ ЗАГРУЗКЕ ---
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('lots-container')) loadLots();
    if (document.getElementById('my-lots-container')) loadMyProfile();
});

// --- СОЗДАНИЕ ЛОТА (Только для страницы create.html) ---
const addLotForm = document.getElementById('add-lot-form');
if (addLotForm) {
    addLotForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        if (!currentSession) return showToast('Авторизуйтесь!', 'error');

        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.innerText = 'Загрузка...';
        submitBtn.disabled = true;

        const title = document.getElementById('title').value;
        const description = document.getElementById('description').value;
        const category = document.getElementById('category').value; 
        const starting_price = document.getElementById('starting_price').value;
        const end_time = new Date(document.getElementById('end_time').value).toISOString(); 
        const fileInput = document.getElementById('images');
        const imageUrls = []; 

        try {
            if (fileInput.files.length > 0) {
                for (const file of fileInput.files) {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                    const filePath = `${currentSession.user.id}/${fileName}`;
                    const { error: uploadError } = await supabaseClient.storage.from('lots').upload(filePath, file);
                    if (!uploadError) {
                        const { data } = supabaseClient.storage.from('lots').getPublicUrl(filePath);
                        imageUrls.push(data.publicUrl);
                    }
                }
            }

            const response = await fetch(`${API_URL}/lots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
                body: JSON.stringify({ title, description, category, starting_price: Number(starting_price), end_time, images: imageUrls })
            });

            if (response.ok) {
                showToast('Лот создан!', 'success');
                setTimeout(() => window.location.href = 'index.html', 1500); // Кидаем на главную после создания
            } else {
                const error = await response.json();
                showToast(`Ошибка: ${error.error}`, 'error');
            }
        } catch (error) {
            showToast('Системная ошибка', 'error');
        } finally {
            submitBtn.innerText = 'Добавить лот';
            submitBtn.disabled = false;
        }
    });
}


// --- ЗАГРУЗКА ЛОТОВ ---
// Добавили третий параметр: sortFilter
async function loadLots(searchQuery = '', categoryFilter = 'all', sortFilter = 'newest') { 
    try {
        // Передаем сортировку на сервер в ссылке
        let url = `${API_URL}/lots?category=${categoryFilter}&sort=${sortFilter}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
        
        const response = await fetch(url);
        // ... дальше код функции остается без изменений ...
        const lots = await response.json();
        const container = document.getElementById('lots-container');
        if (!container) return;
        
        container.innerHTML = lots.length === 0 ? '<p>Нет активных лотов.</p>' : '';

        lots.forEach(lot => {
            const isEnded = new Date() > new Date(lot.end_time);
            let imagesHtml = lot.lot_images?.length > 0 ? `<img src="${lot.lot_images[0].image_url}" style="width:100%; height: 150px; object-fit: cover; border-radius:8px; margin-bottom:10px;">` : '';
            let deleteBtnHtml = (currentSession && currentSession.user.id === lot.seller_id) ? `<button onclick="deleteLot('${lot.id}')" style="background:#ff4d4d; margin-top:10px; width:100%;">🗑️ Удалить</button>` : '';
            
            const catNames = { 'electronics': 'Электроника', 'auto': 'Авто', 'home': 'Для дома', 'clothing': 'Одежда', 'other': 'Разное' };
            
            const card = document.createElement('div');
            card.className = 'lot-card';
            if (isEnded) card.style.opacity = '0.7';

            card.innerHTML = `
                ${imagesHtml}
                <span style="display:inline-block; background:#e1f5fe; color:#0288d1; padding:3px 8px; border-radius:12px; font-size:12px; font-weight:bold; margin-bottom:10px;">${catNames[lot.category] || 'Разное'}</span>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0;">${lot.title}</h3>
                    <button id="heart-${lot.id}" onclick="toggleFavorite('${lot.id}')" style="background:none; border:none; box-shadow:none; font-size:24px; padding:0;">🤍</button>
                </div>
                <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 5px;">
    Продавец: <a href="seller.html?id=${lot.seller_id}" style="color: var(--ebay-blue); text-decoration: none; font-weight: 600;">
        ${lot.profiles?.username || 'Аноним'}
    </a>
</div>
                <div class="price" id="lot-price-${lot.id}">Tг ${lot.current_price}</div>
                <button onclick="showBidsHistory('${lot.id}')" style="background:none; border:none; box-shadow:none; color:#2980b9; text-decoration:underline; padding:0; margin-top:5px; font-size:14px;">История ставок</button>
                <div class="timer" id="timer-${lot.id}" data-endtime="${lot.end_time}" style="margin:10px 0;color:#e67e22;font-weight:bold;">Загрузка...</div>
                <div class="bid-controls" id="bid-controls-${lot.id}" style="${isEnded ? 'display:none;' : ''}">
                    <input type="number" id="bid-input-${lot.id}" placeholder="Ставка" min="${lot.current_price + 1}">
                    <button onclick="placeBid('${lot.id}')">Ставка</button>
                </div>
                ${isEnded ? '<div style="color:red;font-weight:bold;">АУКЦИОН ЗАВЕРШЕН</div>' : ''}
                ${deleteBtnHtml}
            `;
            container.appendChild(card);
        });
        if (!window.timerInterval) window.timerInterval = setInterval(updateAllTimers, 1000);
    } catch (error) { console.error(error); }
}

// --- СТАВКИ, ЛАЙКИ И УДАЛЕНИЕ ---
async function placeBid(lotId) {
    if (!currentSession) return showToast('Авторизуйтесь!', 'error');
    const amount = Number(document.getElementById(`bid-input-${lotId}`).value);
    if (!amount) return showToast('Введите сумму', 'error');

    const response = await fetch(`${API_URL}/lots/${lotId}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
        body: JSON.stringify({ amount })
    });
    if (response.ok) { showToast('Ставка принята!', 'success'); loadLots(); } 
    else { const err = await response.json(); showToast(`Ошибка: ${err.error}`, 'error'); }
}

async function toggleFavorite(lotId) {
    if (!currentSession) return showToast('Авторизуйтесь!', 'error');
    const response = await fetch(`${API_URL}/lots/${lotId}/favorite`, { method: 'POST', headers: { 'Authorization': `Bearer ${currentSession.access_token}` }});
    if (response.ok) {
        const res = await response.json(); showToast(res.message, 'success');
        const hBtn = document.getElementById(`heart-${lotId}`);
        if (hBtn) hBtn.innerText = res.status === 'added' ? '❤️' : '🤍';
        if (document.getElementById('my-favorites-container')) loadMyProfile();
    }
}

async function deleteLot(lotId) {
    if (!confirm('Удалить лот?')) return; 
    const response = await fetch(`${API_URL}/lots/${lotId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${currentSession.access_token}` }});
    if (response.ok) {
        showToast('Удалено!', 'success');
        if (document.getElementById('lots-container')) loadLots();
        if (document.getElementById('my-lots-container')) loadMyProfile();
    }
}


// --- ПРОФИЛЬ ---
async function loadMyProfile() {
    if (!currentSession) return;
    try {
        // 1. Мои лоты
        const resLots = await fetch(`${API_URL}/users/me/lots`, { headers: { 'Authorization': `Bearer ${currentSession.access_token}` }});
        const myLots = await resLots.json();
        const cLots = document.getElementById('my-lots-container');
        cLots.innerHTML = myLots.length ? '' : '<p style="color: var(--text-muted);">Вы еще не создали ни одного лота.</p>';
        
        myLots.forEach(lot => {
            let img = lot.lot_images?.length > 0 ? `<img src="${lot.lot_images[0].image_url}" alt="Лот">` : '';
            cLots.innerHTML += `
                <div class="lot-card">
                    ${img}
                    <h3>${lot.title}</h3>
                    <div class="price">$${lot.current_price}</div>
                    <button onclick="deleteLot('${lot.id}')" style="margin-top: auto;">🗑️ Удалить</button>
                </div>`;
        });

        // 2. Мои ставки (Выделяем победные зеленым, а перебитые - красным)
        const resBids = await fetch(`${API_URL}/users/me/bids`, { headers: { 'Authorization': `Bearer ${currentSession.access_token}` }});
        const myBids = await resBids.json();
        const cBids = document.getElementById('my-bids-container');
        cBids.innerHTML = myBids.length ? '' : '<p style="color: var(--text-muted);">Вы еще не сделали ни одной ставки.</p>';
        
        myBids.forEach(bid => {
            if (!bid.lots) return;
            let img = bid.lots.lot_images?.length > 0 ? `<img src="${bid.lots.lot_images[0].image_url}" alt="Лот">` : '';
            let isWinning = bid.amount >= bid.lots.current_price;
            let statusColor = isWinning ? '#008a00' : '#e53238'; // Зеленый если побеждаем, красный если перебили
            
            cBids.innerHTML += `
                <div class="lot-card" style="border: 2px solid ${statusColor};">
                    ${img}
                    <h3>${bid.lots.title}</h3>
                    <p style="margin: 10px 0 0 0; color: var(--text-muted);">Ваша ставка:</p>
                    <div class="price" style="margin-top: 0 !important; color: ${statusColor} !important;">$${bid.amount}</div>
                    <p style="font-size: 13px; color: var(--text-muted); margin-top: auto;">Текущая цена лота: $${bid.lots.current_price}</p>
                </div>`;
        });

        // 3. Избранное
        const resFavs = await fetch(`${API_URL}/users/me/favorites`, { headers: { 'Authorization': `Bearer ${currentSession.access_token}` }});
        const myFavs = await resFavs.json();
        const cFavs = document.getElementById('my-favorites-container');
        cFavs.innerHTML = myFavs.length ? '' : '<p style="color: var(--text-muted);">Нет избранного.</p>';
        
        myFavs.forEach(fav => { 
            if(fav.lots) {
                let img = fav.lots.lot_images?.length > 0 ? `<img src="${fav.lots.lot_images[0].image_url}" alt="Лот">` : '';
                cFavs.innerHTML += `
                    <div class="lot-card">
                        ${img}
                        <h3>${fav.lots.title}</h3>
                        <div class="price">$${fav.lots.current_price}</div>
                        <button onclick="toggleFavorite('${fav.lots.id}')" style="margin-top: auto; border: 1px solid #e53238; color: #e53238; background: transparent; border-radius: 20px; height: 40px; cursor: pointer;">❌ Убрать из избранного</button>
                    </div>`; 
            }
        });
    } catch (e) { 
        console.error(e); 
    }
}


// --- ПОИСК И СОРТИРОВКА ---
const searchInput = document.getElementById('search-input');
const categoryFilter = document.getElementById('category-filter');
const sortFilter = document.getElementById('sort-filter'); // Нашли новый список
const searchBtn = document.getElementById('search-btn');

// Создали единую функцию, которая собирает все 3 параметра и отправляет запрос
function triggerSearch() {
    const text = searchInput ? searchInput.value : '';
    const cat = categoryFilter ? categoryFilter.value : 'all';
    const sort = sortFilter ? sortFilter.value : 'newest';
    loadLots(text, cat, sort);
}

let searchTimeout;

// 1. Поиск при вводе текста
if (searchInput) searchInput.addEventListener('input', () => { 
    clearTimeout(searchTimeout); 
    searchTimeout = setTimeout(triggerSearch, 300); 
});

// 2. Поиск при смене категории
if (categoryFilter) categoryFilter.addEventListener('change', triggerSearch);

// 3. Поиск при смене сортировки (НОВОЕ)
if (sortFilter) sortFilter.addEventListener('change', triggerSearch);

// 4. Поиск по клику на кнопку
if (searchBtn) searchBtn.addEventListener('click', triggerSearch);

// --- ТАЙМЕРЫ И МОДАЛКА ---

function updateAllTimers() {
    document.querySelectorAll('[id^="timer-"]').forEach(el => {
        const dist = new Date(el.getAttribute('data-endtime')).getTime() - new Date().getTime();
        if (dist < 0) { el.innerHTML = "Завершено"; el.style.color = "red"; const ctrl = document.getElementById(`bid-controls-${el.id.replace('timer-', '')}`); if(ctrl) ctrl.style.display = 'none'; return; }
        el.innerHTML = `Осталось: ${Math.floor(dist / 86400000)}д ${Math.floor((dist % 86400000) / 3600000)}ч ${Math.floor((dist % 3600000) / 60000)}м ${Math.floor((dist % 60000) / 1000)}с`;
    });
}

async function showBidsHistory(lotId) {
    const modal = document.getElementById('bids-modal');
    const bidsList = document.getElementById('bids-list');
    if (!modal) return;
    modal.style.display = 'block'; bidsList.innerHTML = '<p>Загрузка...</p>';
    const res = await fetch(`${API_URL}/lots/${lotId}/bids`);
    const bids = await res.json();
    if (!bids.length) return bidsList.innerHTML = '<p>Ставок нет.</p>';
    let html = `<table style="width:100%; border-collapse:collapse; margin-top:15px;"><tr style="background:#f2f2f2;"><th>Участник</th><th>Ставка</th></tr>`;
    bids.forEach(b => html += `<tr><td style="padding:10px; border-bottom:1px solid #ddd;">User_${b.bidder_id.substring(0,4)}</td><td style="padding:10px; border-bottom:1px solid #ddd; color:#27ae60;">$${b.amount}</td></tr>`);
    bidsList.innerHTML = html + '</table>';
}
function closeBidsModal() { document.getElementById('bids-modal').style.display = 'none'; }
window.addEventListener('click', (e) => { const m = document.getElementById('bids-modal'); if (e.target === m) m.style.display = 'none'; });
// --- ЛОГИКА ТЕМНОЙ ТЕМЫ ---
function toggleTheme() {
    // Переключаем класс на body
    document.body.classList.toggle('dark-mode');
    
    // Проверяем, включена ли тема сейчас
    const isDark = document.body.classList.contains('dark-mode');
    
    // Сохраняем выбор в память браузера (чтобы не сбрасывалось при обновлении)
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Меняем иконку
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
        // Если темно - показываем солнышко, если светло - луну
        themeBtn.innerText = isDark ? '🔆' : '⏾';
    }
}
// --- ЛОГИКА ЖИВОГО ПРЕДПРОСМОТРА (ДЛЯ CREATE.HTML) ---
const titleInput = document.getElementById('title');
const priceInput = document.getElementById('starting_price');
const categoryInput = document.getElementById('category');
const imagesInput = document.getElementById('images');

// Проверяем, находимся ли мы на странице создания лота
if (titleInput && priceInput && categoryInput) {
    const previewTitle = document.getElementById('preview-title');
    const previewPrice = document.getElementById('preview-price');
    const previewCategory = document.getElementById('preview-category');
    const previewImg = document.getElementById('preview-img');

    const catNames = { 
        'electronics': 'Электроника', 
        'auto': 'Авто и мото', 
        'home': 'Для дома', 
        'clothing': 'Одежда и обувь', 
        'other': 'Разное' 
    };

    // Обновляем название
    titleInput.addEventListener('input', (e) => {
        previewTitle.innerText = e.target.value || 'Название лота';
    });

    // Обновляем цену
    priceInput.addEventListener('input', (e) => {
        previewPrice.innerText = `$${e.target.value || '10'}`;
    });

    // Обновляем категорию
    categoryInput.addEventListener('change', (e) => {
        previewCategory.innerText = catNames[e.target.value] || 'Разное';
    });

    // Обновляем картинку (читаем файл с компьютера и показываем)
    imagesInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = function(event) {
                previewImg.src = event.target.result;
            }
            reader.readAsDataURL(e.target.files[0]); // Превращаем картинку в ссылку для предпросмотра
        } else {
            previewImg.src = 'https://via.placeholder.com/400x300?text=Загрузите+фото';
        }
    });
    
    // Автоматически ставим время окончания на завтрашний день (чтобы пользователю не кликать лишний раз)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Корректируем время с учетом часового пояса
    tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
    document.getElementById('end_time').value = tomorrow.toISOString().slice(0, 16);
}
// --- ПУБЛИЧНЫЙ ПРОФИЛЬ ПРОДАВЦА ---
async function loadSellerProfile() {
    const params = new URLSearchParams(window.location.search);
    const sellerId = params.get('id');
    const container = document.getElementById('seller-lots-container');
    const nameHeader = document.getElementById('seller-name');

    if (!sellerId || !container) return;

    try {
        // 1. СНАЧАЛА ЗАПРАШИВАЕМ ИМЯ И АВАТАРКУ ИЗ БАЗЫ СОВЕРШЕННО ТОЧНО
        const { data: profileData } = await supabaseClient
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', sellerId)
            .single();

        if (profileData) {
            nameHeader.innerText = profileData.username; // Ставим имя
            // Если есть фото - ставим фото
            if (profileData.avatar_url && document.getElementById('seller-avatar')) {
                document.getElementById('seller-avatar').src = profileData.avatar_url;
            }
        }

        // 2. ЗАТЕМ ПОЛУЧАЕМ ЛОТЫ ПРОДАВЦА ЧЕРЕЗ ТВОЙ СЕРВЕР
        const response = await fetch(`${API_URL}/users/${sellerId}/public`);
        const data = await response.json();

        // (Если профиль не загрузился на 1 шаге, подстраховочно ставим имя с сервера)
        if (!profileData && data.username) nameHeader.innerText = data.username;

        container.innerHTML = data.lots.length ? '' : '<p>У этого продавца пока нет активных лотов.</p>';

        data.lots.forEach(lot => {
            let img = lot.lot_images?.length > 0 ? `<img src="${lot.lot_images[0].image_url}" style="height:200px; object-fit:contain;">` : '';
            container.innerHTML += `
                <div class="lot-card">
                    ${img}
                    <h3>${lot.title}</h3>
                    <div class="price">$${lot.current_price}</div>
                    <button onclick="window.location.href='index.html'" style="background:var(--ebay-blue); margin-top:auto;">Посмотреть лот</button>
                </div>`;
        });
    } catch (e) { 
        console.error('Ошибка загрузки профиля продавца:', e); 
    }
}

// Добавь инициализацию в DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // ... твои старые проверки ...
    if (document.getElementById('seller-lots-container')) loadSellerProfile();
});
// --- ПАНЕЛЬ АДМИНИСТРАТОРА ---
async function loadAdminPanel() {
    const tbody = document.getElementById('admin-lots-tbody');
    if (!tbody || !currentSession) return;

    try {
        const response = await fetch(`${API_URL}/admin/lots`, {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });

        if (!response.ok) {
            showToast('У вас нет прав администратора!', 'error');
            setTimeout(() => window.location.href = 'index.html', 1500);
            return;
        }

        const lots = await response.json();
        tbody.innerHTML = '';

        lots.forEach(lot => {
            const isEnded = new Date() > new Date(lot.end_time);
            const statusColor = isEnded ? '#e74c3c' : '#27ae60';
            const statusText = isEnded ? 'Завершен' : 'Активен';

            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 15px; color: var(--text-muted); font-size: 12px;">${lot.id.substring(0,8)}</td>
                    <td style="padding: 15px; color: var(--text-heading); font-weight: 500;">${lot.title}</td>
                    <td style="padding: 15px; color: var(--ebay-blue);">${lot.profiles?.username || 'Аноним'}</td>
                    <td style="padding: 15px; font-weight: bold;">$${lot.current_price}</td>
                    <td style="padding: 15px; color: ${statusColor}; font-weight: 500;">${statusText}</td>
                    <td style="padding: 15px;">
                        <button onclick="deleteLot('${lot.id}')" style="background: #e53238; color: white; padding: 8px 15px; border-radius: 8px; font-size: 13px; height: auto;">Удалить</button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Ошибка загрузки админки:', error);
    }
}
// --- ЗАГРУЗКА АВАТАРКИ ---
async function uploadAvatar(input) {
    const file = input.files[0];
    if (!file || !currentSession) return;

    try {
        showToast('Загружаем фото...', 'success');

        // 1. Создаем уникальное имя файла (id_пользователя + время)
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentSession.user.id}_${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        // 2. Загружаем файл в бакет 'avatars'
        let { error: uploadError } = await supabaseClient.storage
            .from('avatars')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 3. Получаем публичную ссылку на файл
        const { data: { publicUrl } } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(filePath);

        // 4. Обновляем колонку avatar_url в таблице profiles
        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('id', currentSession.user.id);

        if (updateError) throw updateError;

        // 5. Обновляем картинку на странице
        document.getElementById('user-avatar').src = publicUrl;
        showToast('Аватар обновлен! ✨', 'success');

    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        showToast('Не удалось загрузить фото', 'error');
    }
}