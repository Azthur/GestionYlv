// ─── Auth & Session ──────────────────────────
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

    const currentLogin = String(user.login || '').trim().toUpperCase();
    const isSuperuser = currentLogin === '71941916JL';
    const isAdmin = String(user.rol || '').trim().toUpperCase() === 'ADMIN';
    const userRol = String(user.rol || '').trim().toUpperCase();

    let roleLabel = 'Consultor';
    if (isSuperuser || isAdmin) roleLabel = 'Administrador';
    else if (user.rol) roleLabel = user.rol;

    // ── Landing Page Dynamic Content ──
    renderLandingPage(user, { isSuperuser, isAdmin, userRol, roleLabel });
}

// ── Card descriptions for each module code ──
const MODULE_CARD_INFO = {
    dashboard:           { cls: 'card-logistics',  desc: 'Panel principal con accesos directos a todos los módulos del sistema.' },
    logistics:           { cls: 'card-logistics',  desc: 'Gestión integral del centro logístico y almacén.' },
    orders:              { cls: 'card-logistics',  desc: 'Órdenes de compra, proveedores y seguimiento de entregas.' },
    contabilidad:        { cls: 'card-finance',    desc: 'Compras SUNAT, registro de facturas y trazabilidad integral.' },
    cargos_documentales: { cls: 'card-finance',    desc: 'Cargos documentales y gestión de documentos contables.' },
    registro_facturas:   { cls: 'card-finance',    desc: 'Registro y vinculación de facturas de compra.' },
    conciliacion:        { cls: 'card-finance',    desc: 'Cruce automatizado de cobranzas con movimientos bancarios.' },
    cuentas_cobrar:      { cls: 'card-finance',    desc: 'Reporte de saldos pendientes, análisis y exportación Excel/PDF.' },
    pagos_tesoreria:     { cls: 'card-finance',    desc: 'Gestión de pagos, liquidaciones y tesorería corporativa.' },
    planilla_movilidad:  { cls: 'card-profile',    desc: 'Registro de planillas de movilidad del personal.' },
    historial_planillas: { cls: 'card-profile',    desc: 'Consulta y revisión del historial de planillas.' },
    rendicion_gastos:    { cls: 'card-profile',    desc: 'Registro de rendiciones de gastos con adjuntos.' },
    historial_rendiciones: { cls: 'card-profile',  desc: 'Consulta del historial de rendiciones enviadas.' },
    revision_rendiciones:  { cls: 'card-users',    desc: 'Revisión y aprobación de rendiciones de gastos.' },
    production:          { cls: 'card-logistics',  desc: 'Producción, costeo de productos y formulaciones.' },
    kardex:              { cls: 'card-logistics',  desc: 'Reportes SUNAT formato 12.1 y 13.1 de inventarios.' },
    reparto:             { cls: 'card-logistics',  desc: 'Gestión de rutas, vehículos y despachos de reparto.' },
    users:               { cls: 'card-users',      desc: 'Administración de usuarios, roles y permisos del equipo.' },
    db_config:           { cls: 'card-users',      desc: 'Configuración avanzada y mantenimiento de base de datos.' },
    profile:             { cls: 'card-profile',    desc: 'Configuración personal, cambio de contraseña y datos.' },
};

// ── Module icons by code ──
const MODULE_ICONS_APP = {
    dashboard:           '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    logistics:           '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
    orders:              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    contabilidad:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/></svg>',
    cargos_documentales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    registro_facturas:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/></svg>',
    conciliacion:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    cuentas_cobrar:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    pagos_tesoreria:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
    planilla_movilidad:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    historial_planillas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    rendicion_gastos:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    historial_rendiciones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>',
    revision_rendiciones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    production:          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    kardex:              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    reparto:             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    users:               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    db_config:           '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
    profile:             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
};

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
        heroTitle.innerHTML = `Plataforma de Gestión<br><span style="font-size:0.85em;opacity:0.85;">YELAVE Skincare</span>`;
    }

    if (heroDate) {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        heroDate.textContent = now.toLocaleDateString('es-PE', options);
    }

    if (heroRole) {
        heroRole.textContent = ctx.roleLabel;
    }

    // ── Portal Cards from permissions API ──
    const portalGrid = document.getElementById('portalGrid');
    if (!portalGrid) return;

    // Fetch permissions to build cards dynamically
    const token = localStorage.getItem('yelave_token');
    fetch('http://localhost:8000/api/permisos/me', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(data => {
        const modulos = data.modulos || [];
        const cards = [];

        modulos.forEach(m => {
            // Solo mostrar módulos principales (sin padre)
            if (m.ParentId) return;
            
            // Skip dashboard itself (we're on it)
            if (m.Codigo === 'dashboard') return;

            const info = MODULE_CARD_INFO[m.Codigo] || { cls: 'card-logistics', desc: m.Nombre };
            const icon = MODULE_ICONS_APP[m.Codigo] || MODULE_ICONS_APP['dashboard'];

            cards.push({
                href: m.RutaHtml,
                cls: info.cls,
                icon: icon,
                title: m.Nombre,
                desc: info.desc
            });
        });

        if (cards.length === 0) {
            // Fallback: at least show profile
            cards.push({
                href: '/profile.html',
                cls: 'card-profile',
                icon: MODULE_ICONS_APP['profile'],
                title: 'Mi Perfil',
                desc: 'Configuración personal, cambio de contraseña y datos de tu cuenta corporativa.'
            });
        }

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
    })
    .catch(err => {
        console.warn('Error fetching permisos for portal cards:', err);
        portalGrid.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem;">Error cargando módulos</p>';
    });
}

function logout() {
    localStorage.removeItem('yelave_token');
    localStorage.removeItem('yelave_user');
    window.location.href = 'login.html';
}

// Sidebar toggle (legacy fallback)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active', sidebar && sidebar.classList.contains('open'));
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const user = checkAuth();
    if (user) {
        renderUserInfo(user);
    }
});
