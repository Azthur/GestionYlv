/**
 * YELAVE ERP — Auth Guard Reforzado
 * Verifica sesión y permisos dinámicos antes de mostrar contenido.
 * - Verifica JWT en localStorage
 * - Valida permisos contra el servidor (GET /api/permisos/me)
 * - Oculta body hasta validación completa
 * - Timeout de inactividad (10 min)
 */
(function() {
    'use strict';

    // No aplicar auth-guard cuando se carga dentro de un iframe (ej: visor modal)
    if (window !== window.top) {
        document.documentElement.style.visibility = 'visible';
        return;
    }

    // 1. Ocultar body hasta validación
    document.documentElement.style.visibility = 'hidden';

    // 2. Check token exists
    const token = localStorage.getItem('yelave_token');
    const userStr = localStorage.getItem('yelave_user');
    
    if (!token || !userStr) {
        window.location.href = 'login.html';
        return;
    }

    // 3. Parse user
    let user;
    try {
        user = JSON.parse(userStr);
    } catch (e) {
        console.error("Error parsing user data", e);
        window.location.href = 'login.html';
        return;
    }

    // 4. Determine current page
    const currentPath = window.location.pathname.toLowerCase();
    
    // Pages that don't need permission checks (always accessible if logged in)
    const alwaysAllowed = ['login.html', 'index.html', 'profile.html'];
    const isAlwaysAllowed = alwaysAllowed.some(p => currentPath.includes(p));
    
    // Public viewers (no auth needed at all)
    const publicPages = ['visor_planilla.html', 'visor_rendicion.html', 'factura_visor.html', 'pago_visor.html', 'dashboard_gerencial_hub.html', 'dashboard_gerencial.html', 'dashboard_cxc.html'];
    const isPublicPage = publicPages.some(p => currentPath.includes(p));

    if (isPublicPage) {
        document.documentElement.style.visibility = 'visible';
        return; // Public pages don't need auth
    }

    // 5. Validate with server and check permissions
    const login = String(user.login || '').trim().toUpperCase();
    const isSuperuser = login === '71941916JL';
    const userRol = String(user.rol || '').trim().toUpperCase();
    const isAdmin = isSuperuser || userRol === 'ADMIN';

    // If admin or always-allowed page, show immediately
    if (isAdmin || isAlwaysAllowed) {
        document.documentElement.style.visibility = 'visible';
    }

    // Server-side validation (async, non-blocking for admin/allowed)
    fetch('/api/auth/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
        if (!res.ok) {
            // Token expired or invalid
            localStorage.removeItem('yelave_token');
            localStorage.removeItem('yelave_user');
            window.location.href = 'login.html';
            return null;
        }
        return res.json();
    })
    .then(data => {
        if (!data) return;
        
        // Update stored user data if server provides newer info
        if (data.nombre || data.rol) {
            user.nombre = data.nombre || user.nombre;
            user.rol = data.rol || user.rol;
            localStorage.setItem('yelave_user', JSON.stringify(user));
        }

        // For non-admin, non-always-allowed pages, check permissions
        if (!isAdmin && !isAlwaysAllowed) {
            return fetch('/api/permisos/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json()).then(permData => {
                const modulos = permData.modulos || [];
                const hasAccess = modulos.some(m => 
                    currentPath.includes(m.RutaHtml.toLowerCase().replace('/', ''))
                );
                
                if (!hasAccess) {
                    alert("Acceso Denegado: Su rol no tiene permisos para acceder a este módulo.");
                    window.location.href = 'index.html';
                    return;
                }
                
                document.documentElement.style.visibility = 'visible';
            });
        } else {
            document.documentElement.style.visibility = 'visible';
        }
    })
    .catch(err => {
        console.warn('Auth verify failed (network):', err);
        // If server is unreachable but token exists, still show (graceful degradation)
        document.documentElement.style.visibility = 'visible';
    });

    // 6. Inactivity Timeout (10 minutes) — skip for dashboard gerencial (keep-alive)
    if (window.__YELAVE_DASHBOARD_KEEP_ALIVE__) {
        // Dashboard gerencial: refresh token periodically instead of expiring
        setInterval(function() {
            fetch('/api/auth/verify', { headers: { 'Authorization': 'Bearer ' + token } })
            .then(function(r) { if (!r.ok) { window.location.href = 'login.html'; } })
            .catch(function() {});
        }, 4 * 60 * 1000); // every 4 min
        return; // skip inactivity setup
    }

    const INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutos
    let lastUpdate = 0;

    function updateSharedActivity() {
        const now = Date.now();
        // Evitar escribir en localStorage en cada milisegundo (throttling de 5 segundos)
        if (now - lastUpdate > 5000) {
            localStorage.setItem('yelave_last_activity', now.toString());
            lastUpdate = now;
        }
    }

    function checkInactivity() {
        const lastActivityStr = localStorage.getItem('yelave_last_activity');
        if (!lastActivityStr) return;
        
        const lastActivity = parseInt(lastActivityStr, 10);
        const now = Date.now();
        
        // Si han pasado más de 10 minutos desde la ÚLTIMA actividad en CUALQUIER pestaña
        if (now - lastActivity > INACTIVITY_LIMIT_MS) {
            // Prevenir loops de logout
            localStorage.removeItem('yelave_last_activity');
            localStorage.removeItem('yelave_token');
            localStorage.removeItem('yelave_user');
            
            alert("Su sesión ha expirado por inactividad (10 minutos). Será redirigido al inicio de sesión.");
            window.location.href = 'login.html';
        }
    }

    // Inicializar el timer compartido
    updateSharedActivity();
    
    // Revisar la inactividad cada 10 segundos
    setInterval(checkInactivity, 10000);

    // Escuchar eventos en ESTA pestaña para actualizar el timer global
    window.addEventListener('mousemove', updateSharedActivity);
    window.addEventListener('keypress', updateSharedActivity);
    window.addEventListener('click', updateSharedActivity);
    window.addEventListener('scroll', updateSharedActivity);
    window.addEventListener('touchstart', updateSharedActivity);
})();
