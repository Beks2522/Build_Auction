const API_URL = 'https://build-auction.onrender.com/api';
const supabaseUrl = 'https://vphyopvpxoruhyqwrlos.supabase.co'; 
const supabaseKey = 'sb_publishable_NMVwPdeJU_NFDHPCmES5WQ_NgqzNe0S'; 

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
let currentSession = null;
const myBidLotIds = new Set();  

// --- УВЕДОМЛЕНИЯ ---
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

// --- АВТОРИЗАЦИЯ ---
supabaseClient.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    const guestInfo = document.getElementById('guest-info');
    const userInfo = document.getElementById('user-info');
    const mainNav = document.getElementById('main-nav');
    const authModal = document.getElementById('auth-modal');
    
    // 👉 1. Находим новую кнопку сообщений
    const messagesBtn = document.getElementById('nav-messages-btn'); 
    
    const protectedSections = document.querySelectorAll('.protected-content');

    if (session) {
        // Проверяем возврат со Stripe
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('payment_success') === 'true') {
            const paidLotId = urlParams.get('lot_id');
            fetch(`${API_URL}/lots/${paidLotId}/mark-paid`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            }).then(() => {
                showToast('🎉 Оплата успешно завершена!', 'success');
                window.history.replaceState({}, document.title, window.location.pathname); // Убираем мусор из ссылки
            });
        }
        
        if(guestInfo) guestInfo.style.display = 'none';
        if(userInfo) userInfo.style.display = 'block';
        if(mainNav) mainNav.style.display = 'flex'; 
        if(authModal) closeAuthModal(); 
        
        // 👉 2. ПОКАЗЫВАЕМ кнопку чата авторизованному юзеру
        if(messagesBtn) messagesBtn.style.display = 'block'; 
        
        protectedSections.forEach(el => el.style.display = 'block');

        supabaseClient.from('profiles').select('username, avatar_url').eq('id', session.user.id).single()
            .then(({data}) => {
                if (data) {
                    if (document.getElementById('current-username')) {
                        document.getElementById('current-username').innerText = data.username;
                    }
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
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        updateThemeIcon(true);
    }
    if (document.getElementById('lots-container')) loadLots();
});

// --- СТАВКИ, ЛАЙКИ И УДАЛЕНИЕ ---
async function placeBid(lotId) {
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
        myBidLotIds.add(lotId); 
        loadLots(); 
    } else { 
        const err = await response.json(); 
        showToast(`Ошибка: ${err.error}`, 'error'); 
    }
}

async function toggleFavorite(lotId) {
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

supabaseClient.channel('public:bids')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids' }, async (payload) => {
      const newBid = payload.new;
      if (currentSession && myBidLotIds.has(newBid.lot_id) && newBid.bidder_id !== currentSession.user.id) {
          const { data } = await supabaseClient.from('lots').select('title').eq('id', newBid.lot_id).single();
          const lotTitle = data ? data.title : 'один из лотов';
          showToast(`⚠️ Вашу ставку на "${lotTitle}" перебили! Новая цена: $${newBid.amount}`, 'error');
          if (document.getElementById('my-bids-container') && document.getElementById('my-bids-container').innerHTML !== '') {
              loadMyProfile();
          }
      }
  })
  .subscribe();

  // --- РЕАЛТАЙМ: ЧАТ ---
supabaseClient.channel('public:messages')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const newMsg = payload.new;
      
      // Если мы сейчас прямо сидим в чате этого лота — рисуем пузырек
      if (currentChatLotId === newMsg.lot_id) {
          appendMessageToChat(newMsg);
      } 
      // Если чат закрыт, но сообщение адресовано нам — показываем тост-уведомление!
      else if (currentSession && newMsg.receiver_id === currentSession.user.id) {
          showToast('💬 Вам новое сообщение в чате!', 'info');
      }
  })
  .subscribe();

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('lots-container')) loadLots();
    if (document.getElementById('my-lots-container')) loadMyProfile();
});

// --- СОЗДАНИЕ ЛОТА ---
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
        const buy_now_price = document.getElementById('buy_now_price') ? document.getElementById('buy_now_price').value : null; // Добавлено
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
                body: JSON.stringify({ 
                    title, 
                    description, 
                    category, 
                    starting_price: Number(starting_price), 
                    end_time, 
                    images: imageUrls,
                    buy_now_price: buy_now_price ? Number(buy_now_price) : null // Добавлено
                })
            });

            if (response.ok) {
                showToast('Лот создан!', 'success');
                setTimeout(() => window.location.href = 'index.html', 1500); 
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

// ==========================================
// 1. ЗАГРУЗКА И ОТРИСОВКА ЛОТОВ
// ==========================================
async function loadLots(searchQuery = '', categoryFilter = 'all', sortFilter = 'newest') { 
    const container = document.getElementById('lots-container');
    if (!container) return;

    container.innerHTML = '<div class="loader"></div>';

    try {
        let url = `${API_URL}/lots?category=${categoryFilter}&sort=${sortFilter}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
        
        const response = await fetch(url);
        const lots = await response.json();
        
        container.innerHTML = lots.length === 0 ? '<p style="text-align:center; color: var(--text-muted);">Нет активных лотов.</p>' : '';

        lots.forEach(lot => {
            // ВАЖНО: Теперь лот считается завершенным, если вышло время ИЛИ если он продан/оплачен
            const isEnded = new Date() > new Date(lot.end_time) || lot.status === 'sold' || lot.is_paid === true;
            
            let imagesHtml = lot.lot_images?.length > 0 ? `<img src="${lot.lot_images[0].image_url}" style="width:100%; height: 150px; object-fit: cover; border-radius:8px; margin-bottom:10px;">` : '';
            let deleteBtnHtml = (currentSession && currentSession.user.id === lot.seller_id) ? `<button onclick="deleteLot('${lot.id}')" style="background:#ff4d4d; margin-top:10px; width:100%;">🗑️ Удалить</button>` : '';
            
            // Кнопка Купить сейчас (только если лот активен)
            let buyNowBtnHtml = '';
            if (!isEnded && lot.buy_now_price) {
                buyNowBtnHtml = `<button class="btn-buy-now" onclick="buyNow('${lot.id}')">Купить сейчас за ₸${lot.buy_now_price}</button>`;
            }
            
            const currentSellerName = (lot.profiles && lot.profiles.username) ? lot.profiles.username : 'Продавец';
            
            // Кнопка Чата (Показываем, если мы вошли и это НЕ наш лот)
            let chatBtnHtml = '';
            if (currentSession && currentSession.user.id !== lot.seller_id) {
                chatBtnHtml = `<button class="btn-chat" onclick="openChat('${lot.id}', '${lot.seller_id}', '${currentSellerName}')">Написать продавцу</button>`;
            }
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
                <div class="price" id="lot-price-${lot.id}">Текущая ставка: ${lot.current_price} ₸</div>
                <button onclick="showBidsHistory('${lot.id}')" style="background:none; border:none; box-shadow:none; color:#2980b9; text-decoration:underline; padding:0; margin-top:5px; font-size:14px;">История ставок</button>
                
                <div class="timer" id="timer-${lot.id}" data-endtime="${lot.end_time}" style="margin:10px 0;color:#e67e22;font-weight:bold;">
                    ${isEnded ? (lot.status === 'sold' || lot.is_paid ? '<span class="status-paid">ПРОДАНО</span>' : '<span style="color:red;">АУКЦИОН ЗАВЕРШЕН</span>') : 'Загрузка...'}
                </div>
                
                <div class="bid-controls" id="bid-controls-${lot.id}" style="${isEnded ? 'display:none;' : ''}">
                    <input type="number" id="bid-input-${lot.id}" placeholder="Ставка" min="${lot.current_price + 1}">
                    <button onclick="placeBid('${lot.id}')">Ставка</button>
                </div>
                
                ${buyNowBtnHtml}
                ${chatBtnHtml} 
                ${deleteBtnHtml}
            `;
            container.appendChild(card);
        });
        
        if (!window.timerInterval) window.timerInterval = setInterval(updateAllTimers, 1000);
    } catch (error) { 
        console.error(error); 
    }
}

// ==========================================
// 2. ФУНКЦИЯ ОПЛАТЫ (STRIPE CHECKOUT)
// ==========================================
async function buyNow(lotId) {
    if (!currentSession) {
        showToast('Пожалуйста, войдите в систему', 'error');
        showAuthModal();
        return;
    }

    if (!confirm('Вы уверены, что хотите перейти к оплате и выкупить этот лот?')) {
        return;
    }

    try {
        showToast('Создаем безопасный платеж Stripe...', 'info');
        
        const res = await fetch(`${API_URL}/lots/${lotId}/checkout`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}` 
            },
            // Передаем флаг isBuyNow, чтобы бэкенд знал, что это покупка по блиц-цене!
            body: JSON.stringify({ isBuyNow: true }) 
        });
        
        const data = await res.json();

        if (data.url) {
            window.location.href = data.url; // Улетаем на страницу оплаты Stripe!
        } else {
            showToast(data.error || 'Ошибка при создании чека', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Ошибка сети при связи со Stripe', 'error');
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
                    <div class="price">₸${lot.current_price}</div>
                    <button onclick="deleteLot('${lot.id}')" style="margin-top: auto;">Удалить</button>
                </div>`;
        });

        const resBids = await fetch(`${API_URL}/users/me/bids`, { headers: { 'Authorization': `Bearer ${currentSession.access_token}` }});
        const myBids = await resBids.json();
        const cBids = document.getElementById('my-bids-container');
        cBids.innerHTML = myBids.length ? '' : '<p style="color: var(--text-muted);">Вы еще не сделали ни одной ставки.</p>';
        
        myBids.forEach(bid => {
            if (!bid.lots) return;
            let img = bid.lots.lot_images?.length > 0 ? `<img src="${bid.lots.lot_images[0].image_url}" alt="Лот">` : '';
            
            // Оставили переменные только один раз!
            let isWinning = bid.amount >= bid.lots.current_price;
            let isEnded = new Date() > new Date(bid.lots.end_time);
            let statusColor = isWinning ? '#008a00' : '#e53238'; 

            // Рисуем кнопку оплаты, если победили и аукцион завершен
let payButtonHtml = '';
            if (isEnded && isWinning) {
                if (!bid.lots.is_paid) {
                    // Используем наш новый класс btn-pay-lot
                    payButtonHtml = `<button class="btn-pay-lot" onclick="payForLot('${bid.lots.id}')">Оплатить лот</button>`;
                } else {
                    // Добавляем новый класс для статуса "Оплачено"
                    payButtonHtml = `<div class="status-paid">Оплачено</div>`;
                }
            }
                        
            cBids.innerHTML += `
                <div class="lot-card" style="border: 2px solid ${statusColor};">
                    ${img}
                    <h3>${bid.lots.title}</h3>
                    <p style="margin: 10px 0 0 0; color: var(--text-muted);">Ваша ставка:</p>
                    <div class="price" style="margin-top: 0 !important; color: ${statusColor} !important;">₸${bid.amount}</div>
                    <p style="font-size: 8px; color: var(--text-muted); margin-top: auto;">Текущая цена лота: ₸${bid.lots.current_price}</p>
                    ${isEnded ? '<p style="color:red; font-weight:bold; margin-top:5px;">Аукцион завершен</p>' : ''}
                    ${payButtonHtml}
                </div>`;
        });

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
                        <button onclick="toggleFavorite('${fav.lots.id}')" style="margin-top: auto; border: 1px solid #e53238; color: #e53238; background: transparent; border-radius: 20px; height: 40px; cursor: pointer;">Убрать из избранного</button>
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
const sortFilter = document.getElementById('sort-filter'); 
const searchBtn = document.getElementById('search-btn');

function triggerSearch() {
    const text = searchInput ? searchInput.value : '';
    const cat = categoryFilter ? categoryFilter.value : 'all';
    const sort = sortFilter ? sortFilter.value : 'newest';
    loadLots(text, cat, sort);
}

let searchTimeout;
if (searchInput) searchInput.addEventListener('input', () => { 
    clearTimeout(searchTimeout); 
    searchTimeout = setTimeout(triggerSearch, 300); 
});
if (categoryFilter) categoryFilter.addEventListener('change', triggerSearch);
if (sortFilter) sortFilter.addEventListener('change', triggerSearch);
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
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
        themeBtn.innerText = isDark ? '🔆' : '⏾';
    }
}

// --- ЛОГИКА ЖИВОГО ПРЕДПРОСМОТРА ---
const titleInput = document.getElementById('title');
const priceInput = document.getElementById('starting_price');
const categoryInput = document.getElementById('category');
const imagesInput = document.getElementById('images');

if (titleInput && priceInput && categoryInput) {
    const previewTitle = document.getElementById('preview-title');
    const previewPrice = document.getElementById('preview-price');
    const previewCategory = document.getElementById('preview-category');
    const previewImg = document.getElementById('preview-img');

    const catNames = { 'electronics': 'Электроника', 'auto': 'Авто и мото', 'home': 'Для дома', 'clothing': 'Одежда и обувь', 'other': 'Разное' };

    titleInput.addEventListener('input', (e) => { previewTitle.innerText = e.target.value || 'Название лота'; });
    priceInput.addEventListener('input', (e) => { previewPrice.innerText = `$${e.target.value || '10'}`; });
    categoryInput.addEventListener('change', (e) => { previewCategory.innerText = catNames[e.target.value] || 'Разное'; });

    imagesInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = function(event) { previewImg.src = event.target.result; }
            reader.readAsDataURL(e.target.files[0]); 
        } else {
            previewImg.src = 'https://via.placeholder.com/400x300?text=Загрузите+фото';
        }
    });
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
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
        const { data: profileData } = await supabaseClient
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', sellerId)
            .single();

        if (profileData) {
            nameHeader.innerText = profileData.username; 
            if (profileData.avatar_url && document.getElementById('seller-avatar')) {
                document.getElementById('seller-avatar').src = profileData.avatar_url;
            }
        }

        const response = await fetch(`${API_URL}/users/${sellerId}/public`);
        const data = await response.json();

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
    loadReviews(sellerId);
}

document.addEventListener('DOMContentLoaded', () => {
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
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentSession.user.id}_${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        let { error: uploadError } = await supabaseClient.storage.from('avatars').upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabaseClient.storage.from('avatars').getPublicUrl(filePath);

        const { error: updateError } = await supabaseClient.from('profiles').update({ avatar_url: publicUrl }).eq('id', currentSession.user.id);
        if (updateError) throw updateError;

        document.getElementById('user-avatar').src = publicUrl;
        showToast('Аватар обновлен! ✨', 'success');
    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        showToast('Не удалось загрузить фото', 'error');
    }
}

// --- ФУНКЦИЯ: КУПИТЬ СЕЙЧАС ---
async function buyNow(lotId) {
    if (!currentSession) {
        showAuthModal();
        return;
    }
    
    if (!confirm('Вы уверены, что хотите мгновенно купить этот лот?')) return;

    try {
        const response = await fetch(`${API_URL}/lots/${lotId}/buy-now`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });

        if (response.ok) {
            showToast('Поздравляем с покупкой! ', 'success');
            loadLots(); 
        } else {
            const err = await response.json();
            showToast(`Ошибка: ${err.error}`, 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Системная ошибка', 'error');
    }
}
// --- СИСТЕМА ОТЗЫВОВ ---

// 1. Функция загрузки отзывов
async function loadReviews(sellerId) {
    const list = document.getElementById('reviews-list');
    const avgEl = document.getElementById('average-rating');
    const addSection = document.getElementById('add-review-section');
    if (!list) return;

    // Показываем форму отзыва только авторизованным (и не самому себе)
    if (currentSession && currentSession.user.id !== sellerId) {
        addSection.style.display = 'block';
    }

    try {
        const res = await fetch(`${API_URL}/users/${sellerId}/reviews`);
        const reviews = await res.json();

        if (!reviews.length) {
            list.innerHTML = '<p style="color: var(--text-muted);">Пока нет отзывов. Будьте первым!</p>';
            return;
        }

        // Высчитываем среднюю оценку
        const sum = reviews.reduce((acc, rev) => acc + rev.rating, 0);
        const avg = (sum / reviews.length).toFixed(1); // Округляем до 1 знака (например, 4.8)
        avgEl.innerText = avg;

        list.innerHTML = ''; // Очищаем список

        // Рисуем каждый отзыв
        reviews.forEach(r => {
            const stars = '✦'.repeat(r.rating); // Превращаем цифру 5 в 5 звездочек
            const avatar = r.buyer.avatar_url 
                ? `<img src="${r.buyer.avatar_url}" style="width:45px; height:45px; border-radius:50%; object-fit:cover; border: 2px solid var(--ebay-blue);">` 
                : `<div style="width:45px; height:45px; border-radius:50%; background:var(--border-color); display:flex; align-items:center; justify-content:center; font-size: 20px;">👤</div>`;

            list.innerHTML += `
                <div style="background: var(--card-bg); padding: 15px; border-radius: 12px; border: 1px solid var(--border-color); margin-bottom: 15px; display:flex; gap:15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    ${avatar}
                    <div style="flex-grow: 1;">
                        <div style="font-weight:bold; color: var(--text-heading); font-size: 15px;">
                            ${r.buyer.username} 
                            <span style="font-weight:normal; font-size:12px; color:var(--text-muted); margin-left: 5px;">• ${new Date(r.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style="margin: 5px 0; letter-spacing: 2px;">${stars}</div>
                        <div style="color: var(--text-color); font-size: 14px; line-height: 1.4;">${r.comment || '<i>Без комментариев</i>'}</div>
                    </div>
                </div>
            `;
        });
    } catch (e) { 
        console.error('Ошибка загрузки отзывов:', e); 
        list.innerHTML = '<p style="color: red;">Ошибка загрузки отзывов.</p>';
    }
}

// 2. Функция отправки отзыва
async function submitReview() {
    const params = new URLSearchParams(window.location.search);
    const sellerId = params.get('id');
    const rating = Number(document.getElementById('review-rating').value);
    const comment = document.getElementById('review-comment').value;

    if (!currentSession) return showToast('Сначала авторизуйтесь!', 'error');

    const btn = event.target;
    btn.innerText = 'Отправка...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/users/${sellerId}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
            body: JSON.stringify({ rating, comment })
        });

        if (res.ok) {
            showToast('Отзыв опубликован! Спасибо!', 'success');
            document.getElementById('review-comment').value = ''; // Очищаем поле ввода
            loadReviews(sellerId); // Обновляем список отзывов без перезагрузки страницы
        } else {
            const err = await res.json();
            showToast(`Ошибка: ${err.error}`, 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    } finally {
        btn.innerText = 'Опубликовать отзыв';
        btn.disabled = false;
    }
}   
// --- СИСТЕМА ОПЛАТЫ ---
async function payForLot(lotId) {
    if (!currentSession) return;
    try {
        showToast('Создаем безопасный платеж...', 'info');
        const res = await fetch(`${API_URL}/lots/${lotId}/checkout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const data = await res.json();

        if (data.url) {
            window.location.href = data.url; // Улетаем на страницу Stripe!
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (e) {
        showToast('Ошибка сети', 'error');
    }
}
// Открытие/закрытие окна поиска
function toggleSearchModal() {
    const modal = document.getElementById('mangalib-search-modal');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
    } else {
        modal.style.display = 'block';
        document.getElementById('search-input').focus(); // Ставим курсор
    }
}

// Переключение фиолетовых "таблеток" с категориями
function setCategory(value, buttonElement) {
    // 1. Убираем класс 'active' у всех кнопок-таблеток
    const pills = document.querySelectorAll('.filter-pill');
    pills.forEach(pill => pill.classList.remove('active'));
    
    // 2. Добавляем фиолетовый цвет той кнопке, на которую нажали
    buttonElement.classList.add('active');
    
    // 3. Тайно меняем значение в нашем скрытом селекте, чтобы поиск работал как раньше
    document.getElementById('category-filter').value = value;
}
// ==========================================
// ЛОВИМ ВОЗВРАТ ИЗ STRIPE ПОСЛЕ ОПЛАТЫ
// ==========================================
window.addEventListener('load', async () => {
    // Читаем параметры из адресной строки
    const urlParams = new URLSearchParams(window.location.search);
    const isSuccess = urlParams.get('payment_success');
    const paidLotId = urlParams.get('lot_id');

    if (isSuccess === 'true' && paidLotId && currentSession) {
        // Очищаем адресную строку, чтобы при обновлении страницы код не сработал дважды
        window.history.replaceState({}, document.title, "/");

        try {
            // Дергаем твой роут mark-paid
            const res = await fetch(`${API_URL}/lots/${paidLotId}/mark-paid`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
            });
            
            if (res.ok) {
                showToast('🎉 Оплата прошла успешно! Лот ваш.', 'success');
                // Можно добавить эффект конфетти или перезагрузить лоты
                setTimeout(() => loadLots(), 1000); 
            }
        } catch (e) {
            console.error('Ошибка подтверждения:', e);
        }
    }
});