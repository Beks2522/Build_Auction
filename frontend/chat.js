
let currentChatLotId = null;
let currentChatReceiverId = null;
let chatChannel = null;

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

function closeChat() {
    const modal = document.getElementById('chat-modal');

    if (modal) {
        modal.style.display = 'none';
    }

    currentChatLotId = null;
    currentChatReceiverId = null;
}

function appendMessageToChat(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
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
    bubble.style.width = 'fit-content';

    const text = document.createElement('div');
    text.style.fontSize = '15px';
    text.innerText = msg.content;

    const time = document.createElement('div');
    time.style.fontSize = '11px';
    time.style.textAlign = 'right';
    time.style.marginTop = '6px';
    if (isMine) {
        bubble.style.alignSelf = 'flex-end';
        bubble.style.background = 'var(--ebay-blue)';
        bubble.style.borderBottomRightRadius = '2px';
        text.style.color = '#ffffff';
        time.style.color = 'rgba(255, 255, 255, 0.7)';
    } else {
        bubble.style.alignSelf = 'flex-start';
        bubble.style.background = 'var(--input-bg)';
        bubble.style.border = '1px solid var(--border-color)';
        bubble.style.borderBottomLeftRadius = '2px';
        text.style.color = 'var(--text-color)';
        time.style.color = 'var(--text-muted)';
    }

    time.innerText = new Date(msg.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    bubble.appendChild(text);
    bubble.appendChild(time);

    container.appendChild(bubble);

    container.scrollTop = container.scrollHeight;
}

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