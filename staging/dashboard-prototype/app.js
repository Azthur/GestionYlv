// Auth Guard y Manejo de Sesión
function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }

    try {
        const user = JSON.parse(localStorage.getItem('yelave_user'));
        return user;
    } catch (e) {
        window.location.href = 'login.html';
        return null;
    }
}

function renderUserInfo(user) {
    if (!user) return;
    const nameEl = document.getElementById('userNameDisplay');
    const roleEl = document.getElementById('userRoleDisplay');
    const avatarEl = document.getElementById('userAvatar');

    if (nameEl) nameEl.textContent = user.nombre || user.login;

    // Role display
    let roleLabel = 'Consultor';
    if (user.login === '71941916JL' || user.rol === 'ADMIN') {
        roleLabel = 'Administrador';
    } else if (user.rol) {
        roleLabel = user.rol;
    }
    if (roleEl) roleEl.textContent = roleLabel;

    if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre || user.login)}&background=2b3954&color=fff`;

    // Access Control (Superuser or Admin)
    const currentLogin = String(user.login || '').trim().toUpperCase();
    const isSuperuser = currentLogin === '71941916JL' || currentLogin.includes('71941916JL');
    const isAdmin = String(user.rol || '').trim().toUpperCase() === 'ADMIN';
    const userRol = String(user.rol || '').trim().toUpperCase();

    if (isSuperuser || isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
    }

    // Role-based navigation visibility
    document.querySelectorAll('.nav-item, .nav-group').forEach(el => {
        const href = (el.getAttribute('href') || '').toLowerCase();

        // Dashboard and Profile are always visible
        if (href.includes('index.html') || href.includes('profile.html')) {
            el.style.display = 'flex';
            return;
        }

        let isVisible = false;

        if (isSuperuser || isAdmin) {
            isVisible = true;
        } else if (userRol === 'LOGISTICA') {
            if (href.includes('orders.html')) isVisible = true;
        } else if (userRol === 'CONTROL_INTERNO') {
            if (href.includes('conciliacion.html') || href.includes('cuentas-cobrar.html')) isVisible = true;
        } else if (userRol === 'CONTABILIDAD') {
            if (href.includes('orders.html') || href.includes('conciliacion.html') || href.includes('cuentas-cobrar.html')) isVisible = true;
        } else if (userRol === 'COMERCIAL') {
            if (href.includes('conciliacion.html') || href.includes('cuentas-cobrar.html')) isVisible = true;
        }
        // Others (USER or empty) only see index/profile (already handled above)

        if (!isVisible) {
            el.style.display = 'none';
        }
    });

    // Handle nav groups (Finanzas, Sistema)
    document.querySelectorAll('.nav-group').forEach(group => {
        const visibleItems = Array.from(group.querySelectorAll('.nav-item')).filter(item => item.style.display !== 'none');
        if (visibleItems.length === 0) {
            group.style.display = 'none';
        } else {
            group.style.display = 'block';
        }
    });

    // ── Landing Page Dynamic Content ──
    renderLandingPage(user, { isSuperuser, isAdmin, userRol, roleLabel });
}

function renderLandingPage(user, ctx) {
    // Hero greeting with time of day
    const heroGreeting = document.getElementById('heroGreeting');
    const heroTitle = document.getElementById('heroTitle');
    const heroDate = document.getElementById('heroDate');
    const heroRole = document.getElementById('heroRole');

    if (heroGreeting) {
        const hour = new Date().getHours();
        let greeting = 'Buenas noches';
        if (hour >= 5 && hour < 12) greeting = 'Buenos días';
        else if (hour >= 12 && hour < 19) greeting = 'Buenas tardes';
        heroGreeting.textContent = `${greeting}, ${user.nombre || user.login}`;
    }

    if (heroTitle) {
        heroTitle.innerHTML = `Plataforma de Gestión<br><span style="font-size:0.85em;opacity:0.85;">YELAVE </span>`;
    }

    if (heroDate) {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        heroDate.textContent = now.toLocaleDateString('es-PE', options);
    }

    if (heroRole) {
        heroRole.textContent = ctx.roleLabel;
    }

    // ── Portal Cards (Role-Based) ──
    const portalGrid = document.getElementById('portalGrid');
    if (!portalGrid) return;

    const cards = [];

    // Logistics card
    if (ctx.isSuperuser || ctx.isAdmin || ctx.userRol === 'LOGISTICA' || ctx.userRol === 'CONTABILIDAD') {
        cards.push({
            href: '/orders.html',
            cls: 'card-logistics',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
            title: 'Logística & Compras',
            desc: 'Gestión integral de órdenes de compra, proveedores y seguimiento de entregas.'
        });
    }

    // Cuentas por Cobrar card
    if (ctx.isSuperuser || ctx.isAdmin || ctx.userRol === 'CONTROL_INTERNO' || ctx.userRol === 'CONTABILIDAD' || ctx.userRol === 'COMERCIAL') {
        cards.push({
            href: '/cuentas-cobrar.html',
            cls: 'card-finance',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
            title: 'Cuentas por Cobrar',
            desc: 'Reporte de saldos pendientes, agrupación dinámica, gráficos y exportación Excel/PDF.'
        });
    }

    // Finance card
    if (ctx.isSuperuser || ctx.isAdmin || ctx.userRol === 'CONTROL_INTERNO' || ctx.userRol === 'CONTABILIDAD' || ctx.userRol === 'COMERCIAL') {
        cards.push({
            href: '/conciliacion.html',
            cls: 'card-finance',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H2v7l6.29 6.29a1 1 0 0 0 1.42 0l4.58-4.58a1 1 0 0 0 0-1.42L9 5z"/><path d="M22 5h-7l-5 5"/><circle cx="6" cy="9" r="1"/></svg>`,
            title: 'Conciliación Bancaria',
            desc: 'Cruce automatizado de cobranzas con movimientos bancarios y reportes de conciliación.'
        });
    }

    // Users card (Admin only)
    if (ctx.isSuperuser || ctx.isAdmin) {
        cards.push({
            href: '/users.html',
            cls: 'card-users',
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
            title: 'Gestión de Usuarios',
            desc: 'Administración de accesos, roles y permisos del equipo corporativo.'
        });
    }

    // Profile card (always visible)
    cards.push({
        href: '/profile.html',
        cls: 'card-profile',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
        title: 'Mi Perfil',
        desc: 'Configuración personal, cambio de contraseña y datos de tu cuenta corporativa.'
    });

    portalGrid.innerHTML = cards.map(c => `
        <a href="${c.href}" class="portal-card ${c.cls}">
            <div class="portal-card-icon">${c.icon}</div>
            <div class="portal-card-title">${c.title}</div>
            <div class="portal-card-desc">${c.desc}</div>
            <div class="portal-card-arrow">
                Acceder
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
            </div>
        </a>
    `).join('');
}

function logout() {
    localStorage.removeItem('yelave_token');
    localStorage.removeItem('yelave_user');
    window.location.href = 'login.html';
}

// Interacciones Menu Movil
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.toggle('open');
    if (sidebar.classList.contains('open')) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    const user = checkAuth();
    if (user) {
        renderUserInfo(user);
    }
});
