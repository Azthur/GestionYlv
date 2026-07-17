/**
 * YELAVE ERP — Chat Interno (Nexus-style floating window)
 * Split view: contacts left + conversation right
 */
(function () {
    'use strict';

    const API = '/api/config';
    let _chatOpen = false;
    let _minimized = false;
    let _currentChat = null;
    let _contacts = [];
    let _pollTimer = null;
    let _emojiPickerOpen = false;

    function getToken() { return localStorage.getItem('yelave_token'); }
    function getMyLogin() {
        try { return JSON.parse(localStorage.getItem('yelave_user') || '{}').login || ''; }
        catch { return ''; }
    }

    // ═══════════════════════════════════════════
    //  EMOJI DATA
    // ═══════════════════════════════════════════
    const EMOJI_CATEGORIES = {
        '😀': ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
        '👋': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾'],
        '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','🔥','⭐','🌟','✨','💫','💥','🎉','🎊','🎈','🎁','🏆','🥇'],
        '🏢': ['🏢','💼','📊','📈','📉','📋','📌','📎','✂️','📝','✏️','📁','📂','🗂️','📅','📆','🔍','💡','📣','📢','🔔','📧','✉️','📩','💬','💭','🗨️','📱','💻','⌨️'],
        '✅': ['✅','❌','⚠️','🚫','⛔','🔴','🟠','🟡','🟢','🔵','🟣','⬛','⬜','🔶','🔷','▶️','⏩','⏪','🔁','🔄','⏸️','⏹️','🎵','🎶','🔊','🔉'],
    };

    // ═══════════════════════════════════════════
    //  INJECT UI
    // ═══════════════════════════════════════════
    function injectChatUI() {
        if (!document.getElementById('chat-css-link')) {
            const link = document.createElement('link');
            link.id = 'chat-css-link';
            link.rel = 'stylesheet';
            link.href = '/chat.css';
            document.head.appendChild(link);
        }

        // FAB
        const fab = document.createElement('button');
        fab.className = 'chat-fab';
        fab.id = 'chatFab';
        fab.innerHTML = '💬<span class="chat-fab-badge" id="chatFabBadge" style="display:none;">0</span>';
        fab.onclick = openChat;
        document.body.appendChild(fab);

        // Floating Window
        const win = document.createElement('div');
        win.className = 'chat-window';
        win.id = 'chatWindow';
        win.innerHTML = `
            <div class="chat-window-header">
                <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Yelave Chat</h3>
                <div class="chat-header-actions">
                    <button class="chat-header-btn" onclick="window._toggleMinimize()" title="Minimizar">─</button>
                    <button class="chat-header-btn" onclick="window._closeChat()" title="Cerrar">✕</button>
                </div>
            </div>
            <div class="chat-window-body">
                <div class="chat-left">
                    <div class="chat-search">
                        <input type="text" id="chatSearchInput" placeholder="🔍 Buscar usuario..." oninput="window._filterContacts(this.value)">
                    </div>
                    <div class="chat-contact-list" id="chatContactList">
                        <div class="chat-welcome" style="padding:1rem;"><p>Cargando...</p></div>
                    </div>
                </div>
                <div class="chat-right">
                    <div id="chatRightContent">
                        <div class="chat-welcome">
                            <div class="chat-welcome-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            </div>
                            <h4>Bienvenido al Chat</h4>
                            <p>Selecciona un usuario para comenzar</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(win);
    }

    // ═══════════════════════════════════════════
    //  OPEN / CLOSE / MINIMIZE
    // ═══════════════════════════════════════════
    function openChat() {
        _chatOpen = true;
        _minimized = false;
        document.getElementById('chatWindow').classList.add('open');
        document.getElementById('chatWindow').classList.remove('minimized');
        document.getElementById('chatFab').style.display = 'none';
        loadContacts();
        startPolling();
    }

    function closeChat() {
        _chatOpen = false;
        _minimized = false;
        _currentChat = null;
        document.getElementById('chatWindow').classList.remove('open', 'minimized', 'conv-active');
        setTimeout(() => { document.getElementById('chatFab').style.display = 'flex'; }, 250);
        stopPolling();
        resetRightPanel();
    }
    window._closeChat = closeChat;

    function toggleMinimize() {
        _minimized = !_minimized;
        document.getElementById('chatWindow').classList.toggle('minimized', _minimized);
        if (!_minimized) {
            loadContacts();
            startPolling();
        } else {
            stopPolling();
        }
    }
    window._toggleMinimize = toggleMinimize;

    function resetRightPanel() {
        document.getElementById('chatRightContent').innerHTML = `
            <div class="chat-welcome">
                <div class="chat-welcome-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <h4>Bienvenido al Chat</h4>
                <p>Selecciona un usuario para comenzar</p>
            </div>`;
        // Remove active class from contacts
        document.querySelectorAll('.chat-contact-item.active').forEach(el => el.classList.remove('active'));
        document.getElementById('chatWindow').classList.remove('conv-active');
    }

    // ═══════════════════════════════════════════
    //  CONTACTS
    // ═══════════════════════════════════════════
    async function loadContacts() {
        try {
            const res = await fetch(`${API}/contacts`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!res.ok) throw new Error();
            _contacts = await res.json();
            // Respect current search filter
            const searchInput = document.getElementById('chatSearchInput');
            const q = searchInput ? searchInput.value.trim() : '';
            if (q) {
                window._filterContacts(q);
            } else {
                renderContacts(_contacts);
            }
        } catch (e) {
            document.getElementById('chatContactList').innerHTML =
                '<div class="chat-welcome" style="padding:1rem;"><p>⚠️ Error</p></div>';
        }
    }

    function renderContacts(contacts) {
        const list = document.getElementById('chatContactList');
        if (!contacts.length) {
            list.innerHTML = '<div class="chat-welcome" style="padding:1rem;"><p>Sin contactos</p></div>';
            return;
        }

        list.innerHTML = contacts.map(c => {
            const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.nombre || c.login)}&background=2b3954&color=fff&size=34`;
            const badge = c.no_leidos > 0 ? `<span class="chat-contact-badge">${c.no_leidos}</span>` : '';
            const isActive = _currentChat === c.login ? ' active' : '';

            return `<div class="chat-contact-item${isActive}" onclick="window._openConversation('${c.login}')">
                <div class="chat-contact-avatar">
                    <img src="${avatar}" alt="${c.nombre}">
                    <span class="chat-contact-online"></span>
                </div>
                <div class="chat-contact-info">
                    <div class="chat-contact-name">${escapeHtml(c.nombre || c.login)}</div>
                    <div class="chat-contact-role">${c.rol_nombre || c.rol || 'Usuario'}</div>
                </div>
                ${badge}
            </div>`;
        }).join('');
    }

    window._filterContacts = function (q) {
        const query = q.toLowerCase();
        const filtered = _contacts.filter(c =>
            (c.nombre || '').toLowerCase().includes(query) ||
            (c.login || '').toLowerCase().includes(query) ||
            (c.correo || '').toLowerCase().includes(query) ||
            (c.rol_nombre || '').toLowerCase().includes(query)
        );
        renderContacts(filtered);
    };

    // ═══════════════════════════════════════════
    //  CONVERSATION
    // ═══════════════════════════════════════════
    window._openConversation = async function (login) {
        _currentChat = login;
        const contact = _contacts.find(c => c.login === login) || { login, nombre: login, rol: '' };
        const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.nombre || login)}&background=2b3954&color=fff&size=32`;

        // Mark active
        document.querySelectorAll('.chat-contact-item').forEach(el => el.classList.remove('active'));
        const idx = _contacts.findIndex(c => c.login === login);
        const items = document.querySelectorAll('.chat-contact-item');
        if (items[idx]) items[idx].classList.add('active');

        // Mobile: show right panel
        document.getElementById('chatWindow').classList.add('conv-active');

        // Build conversation UI
        const detailParts = [];
        if (contact.rol_nombre || contact.rol) detailParts.push(contact.rol_nombre || contact.rol);
        if (contact.correo) detailParts.push(`📧 ${contact.correo}`);
        if (contact.celular) detailParts.push(`📱 ${contact.celular}`);

        // Store contact data for card
        const contactJson = JSON.stringify(contact).replace(/'/g, '&#39;').replace(/"/g, '&quot;');

        document.getElementById('chatRightContent').innerHTML = `
            <div class="chat-conv-header">
                <button class="chat-conv-back-btn" onclick="window._backToContacts()" style="display:none; background:none; border:none; cursor:pointer; color:#64748b; padding:0.2rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div class="chat-conv-avatar" style="cursor:pointer;" onclick="window._showContactCard('${login}')"><img src="${avatar}" alt=""></div>
                <div style="cursor:pointer;" onclick="window._showContactCard('${login}')">
                    <div class="chat-conv-user-name">${escapeHtml(contact.nombre || login)}</div>
                    <div class="chat-conv-user-detail">${detailParts.join(' · ')}</div>
                </div>
            </div>
            <div class="chat-contact-card" id="chatContactCard" style="display:none;"></div>
            <div class="chat-messages" id="chatMessages">
                <div class="chat-welcome"><p>Cargando...</p></div>
            </div>
            <div class="chat-emoji-picker" id="chatEmojiPicker"></div>
            <div class="chat-input-bar">
                <button class="chat-emoji-btn" onclick="window._toggleEmojiPicker()" title="Stickers">😊</button>
                <textarea id="chatInput" rows="1" placeholder="Escribe un mensaje..." onkeydown="window._chatKeyDown(event)"></textarea>
                <button class="chat-send-btn" id="chatSendBtn" onclick="window._sendMessage()" title="Enviar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
            </div>
        `;

        // Show back button on mobile
        if (window.innerWidth <= 600) {
            document.querySelector('.chat-conv-back-btn').style.display = 'flex';
        }

        buildEmojiPicker();
        await loadMessages(login);
        setTimeout(() => { const inp = document.getElementById('chatInput'); if (inp) inp.focus(); }, 150);
    };

    window._backToContacts = function () {
        _currentChat = null;
        document.getElementById('chatWindow').classList.remove('conv-active');
        resetRightPanel();
        loadContacts();
    };

    // ═══════════════════════════════════════════
    //  CONTACT CARD (Outlook-style popup)
    // ═══════════════════════════════════════════
    window._showContactCard = function (login) {
        const card = document.getElementById('chatContactCard');
        if (!card) return;
        const contact = _contacts.find(c => c.login === login);
        if (!contact) return;

        const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.nombre || login)}&background=2b3954&color=fff&size=64`;
        
        card.innerHTML = `
            <div class="chat-card-backdrop" onclick="window._hideContactCard()"></div>
            <div class="chat-card-body">
                <button class="chat-card-close" onclick="window._hideContactCard()">✕</button>
                <div class="chat-card-avatar">
                    <img src="${avatar}" alt="">
                </div>
                <div class="chat-card-name">${escapeHtml(contact.nombre || login)}</div>
                <div class="chat-card-role-badge">${contact.rol_nombre || contact.rol || 'Usuario'}</div>
                ${contact.rol_descripcion ? `<div class="chat-card-role-desc">${escapeHtml(contact.rol_descripcion)}</div>` : ''}
                <div class="chat-card-divider"></div>
                <div class="chat-card-fields">
                    <div class="chat-card-field">
                        <span class="chat-card-field-icon">👤</span>
                        <div>
                            <div class="chat-card-field-label">Usuario</div>
                            <div class="chat-card-field-value">${escapeHtml(contact.login)}</div>
                        </div>
                    </div>
                    ${contact.correo ? `<div class="chat-card-field">
                        <span class="chat-card-field-icon">📧</span>
                        <div>
                            <div class="chat-card-field-label">Correo electrónico</div>
                            <div class="chat-card-field-value">${escapeHtml(contact.correo)}</div>
                        </div>
                    </div>` : ''}
                    ${contact.celular ? `<div class="chat-card-field">
                        <span class="chat-card-field-icon">📱</span>
                        <div>
                            <div class="chat-card-field-label">Celular</div>
                            <div class="chat-card-field-value">${escapeHtml(contact.celular)}</div>
                        </div>
                    </div>` : ''}
                    <div class="chat-card-field">
                        <span class="chat-card-field-icon">🏷️</span>
                        <div>
                            <div class="chat-card-field-label">Rol del sistema</div>
                            <div class="chat-card-field-value">${escapeHtml(contact.rol_nombre || contact.rol || 'Usuario')}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        card.style.display = 'flex';
    };

    window._hideContactCard = function () {
        const card = document.getElementById('chatContactCard');
        if (card) card.style.display = 'none';
    };

    async function loadMessages(login) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        try {
            const res = await fetch(`${API}/messages/${login}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            renderMessages(data.messages);
        } catch (e) {
            container.innerHTML = '<div class="chat-welcome"><p>⚠️ Error al cargar</p></div>';
        }
    }

    function renderMessages(messages) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        const myLogin = getMyLogin();

        if (!messages.length) {
            container.innerHTML = `<div class="chat-welcome">
                <div class="chat-welcome-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <h4>¡Inicia la conversación!</h4>
                <p>Envía el primer mensaje</p>
            </div>`;
            return;
        }

        let html = '';
        let lastDate = '';

        messages.forEach(m => {
            const isSent = m.DeLogin.toUpperCase() === myLogin.toUpperCase();
            const dt = new Date(m.FechaEnvio);
            const dateStr = dt.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

            if (dateStr !== lastDate) {
                html += `<div class="chat-date-divider"><span>${dateStr}</span></div>`;
                lastDate = dateStr;
            }

            html += `<div class="chat-bubble ${isSent ? 'sent' : 'received'}">
                ${escapeHtml(m.Mensaje)}
                <div class="chat-bubble-time">${timeStr}</div>
            </div>`;
        });

        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    }

    // ═══════════════════════════════════════════
    //  SEND MESSAGE
    // ═══════════════════════════════════════════
    window._sendMessage = async function () {
        const input = document.getElementById('chatInput');
        if (!input) return;
        const msg = input.value.trim();
        if (!msg || !_currentChat) return;

        const btn = document.getElementById('chatSendBtn');
        if (btn) btn.disabled = true;

        try {
            const res = await fetch(`${API}/send`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ para: _currentChat, mensaje: msg })
            });
            if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Error'); }
            input.value = '';
            input.style.height = 'auto';
            closeEmojiPicker();
            await loadMessages(_currentChat);
            // Refresh contacts to update last message
            loadContacts();
        } catch (e) {
            console.error('Chat error:', e);
        } finally {
            if (btn) btn.disabled = false;
            if (input) input.focus();
        }
    };

    window._chatKeyDown = function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            window._sendMessage();
        }
        const ta = e.target;
        setTimeout(() => {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 70) + 'px';
        }, 0);
    };

    // ═══════════════════════════════════════════
    //  EMOJI PICKER
    // ═══════════════════════════════════════════
    function buildEmojiPicker() {
        const picker = document.getElementById('chatEmojiPicker');
        if (!picker) return;
        const categories = Object.keys(EMOJI_CATEGORIES);

        let tabsHtml = categories.map((cat, i) =>
            `<button class="chat-emoji-tab${i === 0 ? ' active' : ''}" onclick="window._switchEmojiTab(${i})">${cat}</button>`
        ).join('');

        let gridsHtml = categories.map((cat, i) => {
            const emojis = EMOJI_CATEGORIES[cat].map(e =>
                `<button class="chat-emoji-item" onclick="window._insertEmoji('${e}')">${e}</button>`
            ).join('');
            return `<div class="chat-emoji-grid" id="emojiGrid${i}" style="${i > 0 ? 'display:none;' : ''}">${emojis}</div>`;
        }).join('');

        picker.innerHTML = `
            <div class="chat-emoji-header">
                <div class="chat-emoji-tabs">${tabsHtml}</div>
                <button class="chat-emoji-close" onclick="window._toggleEmojiPicker()" title="Cerrar">✕</button>
            </div>
            <div class="chat-emoji-divider"></div>
            ${gridsHtml}
        `;
    }

    window._switchEmojiTab = function (idx) {
        Object.keys(EMOJI_CATEGORIES).forEach((_, i) => {
            const g = document.getElementById(`emojiGrid${i}`);
            if (g) g.style.display = i === idx ? 'grid' : 'none';
        });
        document.querySelectorAll('.chat-emoji-tab').forEach((t, i) => t.classList.toggle('active', i === idx));
    };

    window._insertEmoji = function (emoji) {
        const input = document.getElementById('chatInput');
        if (!input) return;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const val = input.value;
        input.value = val.substring(0, start) + emoji + val.substring(end);
        
        // Trigger resize
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 70) + 'px';
        
        input.focus();
        const newPos = start + emoji.length;
        input.setSelectionRange(newPos, newPos);
    };

    window._toggleEmojiPicker = function () {
        const picker = document.getElementById('chatEmojiPicker');
        if (!picker) return;
        _emojiPickerOpen = !_emojiPickerOpen;
        picker.classList.toggle('open', _emojiPickerOpen);
    };

    function closeEmojiPicker() {
        _emojiPickerOpen = false;
        const picker = document.getElementById('chatEmojiPicker');
        if (picker) picker.classList.remove('open');
    }

    // ═══════════════════════════════════════════
    //  BADGE / POLLING
    // ═══════════════════════════════════════════
    async function updateUnreadBadge() {
        try {
            const res = await fetch(`${API}/unread-count`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            const badge = document.getElementById('chatFabBadge');
            if (badge) {
                if (data.unread > 0) {
                    badge.textContent = data.unread > 99 ? '99+' : data.unread;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (e) { /* silent */ }
    }

    function startPolling() {
        stopPolling();
        _pollTimer = setInterval(async () => {
            if (_currentChat) {
                await loadMessages(_currentChat);
            }
            if (_chatOpen && !_minimized) {
                await loadContacts();
            }
            await updateUnreadBadge();
        }, 30000); // Reducido de 5000ms a 30000ms (30 segundos)
    }

    function stopPolling() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    }

    // ═══════════════════════════════════════════
    //  UTILS
    // ═══════════════════════════════════════════
    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    // ═══════════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════════
    async function initChat() {
        if (window.location.pathname.includes('login')) return;
        if (!getToken()) return;

        // Verificar si el chat está habilitado
        try {
            const res = await fetch(`${API}/chat/status`);
            if (!res.ok) {
                // Si el endpoint no existe (404) o hay error, asumir chat deshabilitado
                return;
            }
            const data = await res.json();
            if (!data.enabled) {
                console.log('Chat deshabilitado por el administrador');
                return;
            }
        } catch (e) {
            // Si hay error de red o el endpoint no existe, no cargar el chat
            return;
        }

        injectChatUI();
        updateUnreadBadge();
        setInterval(updateUnreadBadge, 60000); // Reducido de 15000ms a 60000ms (60 segundos)
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChat);
    } else {
        initChat();
    }
})();
