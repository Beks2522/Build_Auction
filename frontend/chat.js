
let currentChatLotId = null;
let currentChatReceiverId = null;
let chatChannel = null;

// ==========================================
// Открытие чата
// ==========================================

async function openChat(lotId, sellerId, sellerName) {
    if (!currentSession) {
        showToast('Сначала войдите в систему', 'error');
        return;
    }

    currentChatLotId = lotId;
    currentChatReceiverId = sellerId;

    const modal = document.getElementById('chat-modal');
    if (modal) modal.style.display = 'block';

    const titleEl =
        document.getElementById('chat-title') ||
        document.getElementById('active-partner-name');

    if (titleEl) {
        titleEl.innerText = ` ${sellerName}`;
    }

    const container = document.getElementById('chat-messages');

    if (!container) return;

    container.innerHTML =
        '<p style="text-align:center; color:#888;">Загрузка...</p>';

    try {
        const res = await fetch(
            `${API_URL}/lots/${lotId}/messages`,
            {
                headers: {
                    Authorization: `Bearer ${currentSession.access_token}`
                }
            }
        );

        if (!res.ok) {
            throw new Error('Ошибка загрузки сообщений');
        }

        const messages = await res.json();

        container.innerHTML =
            messages.length === 0
                ? '<p style="text-align:center; color:#888;">Напишите первое сообщение!</p>'
                : '';

        messages.forEach(msg => appendMessageToChat(msg));

    } catch (e) {
        console.error(e);
        showToast('Ошибка загрузки чата', 'error');
    }
}

// ==========================================
// Закрытие чата
// ==========================================

function closeChat() {
    const modal = document.getElementById('chat-modal');

    if (modal) {
        modal.style.display = 'none';
    }

    currentChatLotId = null;
    currentChatReceiverId = null;
}
// Добавление сообщения
function appendMessageToChat(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    // 1. БЕЗОПАСНАЯ ОЧИСТКА ЗАГЛУШЕК
    // Ищем только параграфы с текстом "Загрузка" или "Напишите первое..." и удаляем ТОЛЬКО ИХ
    const placeholders = container.querySelectorAll('p');
    placeholders.forEach(p => {
        if (p.innerText.includes('Напишите') || p.innerText.includes('Загрузка')) {
            p.remove();
        }
    });

    // 2. ФОРМИРУЕМ ПУЗЫРЬ СООБЩЕНИЯ
    const isMine = msg.sender_id === currentSession.user.id;
    const bubble = document.createElement('div');

    bubble.style.maxWidth = '75%';
    bubble.style.padding = '10px 15px';
    bubble.style.borderRadius = '12px';
    bubble.style.margin = '5px 0';
    bubble.style.width = 'fit-content'; // Чтобы короткие сообщения не растягивались на весь экран

    const text = document.createElement('div');
    text.style.fontSize = '15px';
    text.innerText = msg.content; // Защита от XSS

    const time = document.createElement('div');
    time.style.fontSize = '11px';
    time.style.textAlign = 'right';
    time.style.marginTop = '6px';

// 3. ПРИМЕНЯЕМ ЦВЕТА (Умные цвета из тем)
    if (isMine) {
        // МОИ СООБЩЕНИЯ (Всегда яркие, под фирменный цвет)
        bubble.style.alignSelf = 'flex-end';
        bubble.style.background = 'var(--ebay-blue)'; // Берем фирменный синий/фиолетовый из CSS
        bubble.style.borderBottomRightRadius = '2px'; // Острый уголок
        text.style.color = '#ffffff'; // На ярком фоне текст всегда белый
        time.style.color = 'rgba(255, 255, 255, 0.7)';
    } else {
        // СООБЩЕНИЯ СОБЕСЕДНИКА (Подстраиваются под тему)
        bubble.style.alignSelf = 'flex-start';
        bubble.style.background = 'var(--input-bg)'; // В светлой теме будет белым, в темной - темно-серым
        bubble.style.border = '1px solid var(--border-color)'; // Добавим тонкую рамку, чтобы пузырек не сливался с фоном
        bubble.style.borderBottomLeftRadius = '2px'; // Острый уголок
        text.style.color = 'var(--text-color)'; // Текст сам станет черным днем и белым ночью
        time.style.color = 'var(--text-muted)'; // Серое время
    }

    time.innerText = new Date(msg.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    bubble.appendChild(text);
    bubble.appendChild(time);

    // 4. ДОБАВЛЯЕМ В КОНЕЦ СПИСКА (appendChild никогда не стирает старое!)
    container.appendChild(bubble);

    // 5. ПРОКРУТКА В САМЫЙ НИЗ
    container.scrollTop = container.scrollHeight;
}

// ==========================================
// Отправка сообщения
// ==========================================

async function sendMessage() {
    const input =
        document.getElementById('chat-input');

    if (!input) return;

    const content =
        input.value.trim();

    if (
        !content ||
        !currentChatLotId
    ) return;

    input.value = '';

    try {
        const res = await fetch(
            `${API_URL}/lots/${currentChatLotId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Content-Type':
                        'application/json',
                    Authorization:
                        `Bearer ${currentSession.access_token}`
                },
                body: JSON.stringify({
                    receiver_id:
                        currentChatReceiverId,
                    content
                })
            }
        );

        if (!res.ok) {
            throw new Error(
                'Ошибка отправки'
            );
        }

    } catch (e) {
        console.error(e);
        showToast(
            'Ошибка отправки',
            'error'
        );
    }
}

// ==========================================
// Enter отправка
// ==========================================

document
    .getElementById('chat-input')
    ?.addEventListener(
        'keypress',
        e => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        }
    );

// ==========================================
// WebSocket подписка
// ==========================================

function initChatRealtime() {
    if (
        typeof supabaseClient ===
            'undefined' ||
        chatChannel
    ) return;

    chatChannel =
        supabaseClient
            .channel('messages-channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages'
                },
                payload => {
                    const newMsg =
                        payload.new;

                    if (
                        currentChatLotId ===
                        newMsg.lot_id
                    ) {
                        appendMessageToChat(
                            newMsg
                        );
                    } else if (
                        currentSession &&
                        newMsg.receiver_id ===
                            currentSession.user.id
                    ) {
                        showToast(
                            'Новое сообщение',
                            'info'
                        );
                    }
                }
            )
            .subscribe();
}

// запускаем один раз

setTimeout(() => {
    initChatRealtime();
}, 1000);