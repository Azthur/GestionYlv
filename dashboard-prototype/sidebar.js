/**
 * YELAVE ERP — Sidebar Dinámico Centralizado
 * Genera sidebar + topbar + theme toggle en todas las páginas.
 * Se alimenta del endpoint /api/permisos/me para mostrar solo módulos permitidos.
 */
(function () {
    'use strict';

    // No inyectar sidebar cuando la página está dentro de un iframe (ej: visor modal)
    if (window !== window.top) return;

    const API_URL = '/api';

    // ── Iconos SVG por código de módulo ──
    const MODULE_ICONS = {
        dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
        logistics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
        orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
        contabilidad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>',
        cargos_documentales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
        registro_facturas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/></svg>',
        conciliacion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        cuentas_cobrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        pagos_tesoreria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
        historial_cancelaciones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/><line x1="12" y1="7" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="14"/></svg>',
        planilla_movilidad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
        historial_planillas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        rendicion_gastos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        historial_rendiciones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>',
        revision_rendiciones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        production: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
        kardex: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        inventario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>',
        reparto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
        users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        db_config: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
        profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        manual: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
        trazabilidad_global: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
        auditoria_comprobantes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="11.5" cy="13.5" r="2.5"/><line x1="16" y1="18" x2="13.3" y2="15.3"/></svg>',
        cuentas_contables: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><circle cx="12" cy="10" r="2"/><path d="M12 12v4M10 14h4"/></svg>',
        periodos_contables: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    };

    // ── Secciones con label para agrupar ──
    const SECTION_ORDER = ['Principal', 'Logística', 'Contabilidad', 'Finanzas', 'Gastos y Movilidad', 'Producción', 'Distribución', 'Sistema'];

    // ── Theme ──
    function getTheme() {
        return localStorage.getItem('yelave_theme') || 'dark';
    }
    function setTheme(t) {
        localStorage.setItem('yelave_theme', t);
        document.documentElement.setAttribute('data-theme', t);
        // Sync Bootstrap 5.3+ theme attribute
        document.documentElement.setAttribute('data-bs-theme', t);
    }
    // Apply theme immediately to prevent flash
    setTheme(getTheme());

    // ── Build the sidebar ──
    function buildSidebar(modulos, user) {
        const currentPath = window.location.pathname.toLowerCase();

        // Group modules by section (only TOP LEVEL modules for sidebar)
        const sections = {};
        modulos.filter(m => !m.ParentId).forEach(m => {
            const sec = m.Seccion || 'Otros';
            if (!sections[sec]) sections[sec] = [];
            sections[sec].push(m);
        });

        let navHtml = '';
        SECTION_ORDER.forEach(secName => {
            const items = sections[secName];
            if (!items || items.length === 0) return;

            if (secName !== 'Principal') {
                navHtml += `<div class="nav-group-label">${secName}</div>`;
            }

            items.forEach(m => {
                const isActive = currentPath === m.RutaHtml || currentPath === m.RutaHtml.replace('.html', '');
                const icon = MODULE_ICONS[m.Codigo] || MODULE_ICONS['dashboard'];
                navHtml += `<a href="${m.RutaHtml}" class="nav-item${isActive ? ' active' : ''}" data-tooltip="${m.Nombre}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon.replace(/<svg[^>]*>/, '').replace('</svg>', '')}</svg>${m.Nombre}
                </a>`;
            });
        });

        const userName = user.nombre || user.login || 'Usuario';
        const userRole = user.rol || 'USER';
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=2b3954&color=fff`;

        return `
        <div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar()"></div>
        <aside class="sidebar" id="sidebar">
            <button class="sidebar-toggle" onclick="toggleSidebarCollapse()" title="Colapsar menú">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div class="brand">
                <h1>YELAVE</h1>
                <span>Skincare</span>
            </div>
            <nav class="nav-menu">
                ${navHtml}
            </nav>
            <div class="user-profile" onclick="window.location.href='/profile.html'" style="cursor:pointer;">
                <div class="avatar">
                    <img id="userAvatar" src="${avatarUrl}" alt="User Avatar">
                </div>
                <div class="user-info">
                    <span class="user-name" id="userNameDisplay">${userName}</span>
                    <span class="user-role" id="userRoleDisplay">${userRole}</span>
                </div>
            </div>
        </aside>`;
    }

    function buildTopBar(pageTitle, preservedActionsHtml = '') {
        const theme = getTheme();
        const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

        return `<header class="top-bar">
            <div class="top-bar-left">
                <button class="mobile-menu-btn" onclick="toggleSidebar()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
                    </svg>
                </button>
                <h2>${pageTitle}</h2>
            </div>
            <div class="actions" style="display:flex; gap:0.5rem; align-items:center;">
                ${preservedActionsHtml ? `<div class="top-bar-actions">${preservedActionsHtml}</div>` : ''}
                <button id="themeToggleBtn" class="topbar-btn topbar-btn-theme" onclick="toggleTheme()" title="Cambiar tema">
                    ${theme === 'dark' ? sunIcon : moonIcon}
                </button>
                <a href="/profile.html" class="topbar-btn topbar-btn-profile">Mi Perfil</a>
                <button onclick="logout()" class="topbar-btn topbar-btn-logout">Cerrar Sesión</button>
            </div>
        </header>`;
    }

    // ── Global functions ──
    window.toggleSidebar = function () {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active');
    };

    window.toggleSidebarCollapse = function () {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('collapsed');
        localStorage.setItem('yelave_sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
    };

    window.toggleTheme = function () {
        const next = getTheme() === 'dark' ? 'light' : 'dark';
        setTheme(next);
        // Update button icon
        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
            const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
            btn.innerHTML = next === 'dark' ? sunIcon : moonIcon;
        }
    };

    window.logout = function () {
        localStorage.removeItem('yelave_token');
        localStorage.removeItem('yelave_user');
        window.location.href = 'login.html';
    };

    // ── Init: fetch permisos and render ──
    async function initSidebar() {
        const token = localStorage.getItem('yelave_token');
        const userStr = localStorage.getItem('yelave_user');
        if (!token || !userStr) return; // auth-guard handles redirect

        let user;
        try { user = JSON.parse(userStr); } catch (e) { return; }

        // Determine page title from <title> tag
        const titleEl = document.querySelector('title');
        let pageTitle = 'YELAVE ERP';
        if (titleEl) {
            pageTitle = titleEl.textContent.replace('YELAVE - ', '').replace('YELAVE -', '').trim();
        }

        let modulos = [];
        try {
            const res = await fetch(`${API_URL}/permisos/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                modulos = data.modulos || [];
            }
        } catch (e) {
            console.warn('Sidebar: Could not fetch permisos, using fallback');
        }

        // Inject manual module if not present
        if (!modulos.some(m => m.Codigo === 'manual')) {
            modulos.push({ 
                Codigo: 'manual', 
                Nombre: 'Manual de Procesos', 
                RutaHtml: '/manual.html', 
                Seccion: 'Sistema', 
                Orden: 100 
            });
        }

        // If no modules returned (endpoint failed or no permisos), show at minimum dashboard+profile
        if (modulos.length === 0) {
            modulos = [
                { Codigo: 'dashboard', Nombre: 'Dashboard', RutaHtml: '/index.html', Seccion: 'Principal', Orden: 1 },
                { Codigo: 'profile', Nombre: 'Mi Perfil', RutaHtml: '/profile.html', Seccion: 'Sistema', Orden: 92 },
                { Codigo: 'manual', Nombre: 'Manual de Procesos', RutaHtml: '/manual.html', Seccion: 'Sistema', Orden: 100 }
            ];
        }

        // Find the shell placeholder or wrap existing main content
        const appContainer = document.querySelector('.app-container');
        if (!appContainer) return;

        // Preserve anything inside .top-bar-actions (like the company selector) before destroying the top-bar
        let preservedActionsHtml = '';
        const existingTopbar = appContainer.querySelector('.top-bar');
        if (existingTopbar) {
            const actions = existingTopbar.querySelector('.top-bar-actions');
            if (actions) {
                preservedActionsHtml = actions.innerHTML;
            }
        }

        // Remove existing sidebar and topbar if present
        const existingSidebar = appContainer.querySelector('.sidebar');
        const existingOverlay = appContainer.querySelector('.sidebar-overlay');
        if (existingSidebar) existingSidebar.remove();
        if (existingOverlay) existingOverlay.remove();
        if (existingTopbar) existingTopbar.remove();

        // Inject sidebar before main
        const mainContent = appContainer.querySelector('.main-content') || appContainer.querySelector('main');
        if (mainContent) {
            mainContent.insertAdjacentHTML('beforebegin', buildSidebar(modulos, user));
            mainContent.insertAdjacentHTML('afterbegin', buildTopBar(pageTitle, preservedActionsHtml));
        }

        // Restore collapsed state
        if (localStorage.getItem('yelave_sidebar_collapsed') === '1') {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.add('collapsed');
        }

        // Inject chat module globally
        if (!document.getElementById('chat-js-script')) {
            const chatScript = document.createElement('script');
            chatScript.id = 'chat-js-script';
            chatScript.src = '/chat.js';
            document.body.appendChild(chatScript);
        }
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebar);
    } else {
        initSidebar();
    }
})();
