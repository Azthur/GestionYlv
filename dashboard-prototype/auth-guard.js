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
    const publicPages = ['visor_planilla.html', 'visor_rendicion.html', 'factura_visor.html'];
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
    fetch('http://localhost:8000/api/auth/verify', {
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
            return fetch('http://localhost:8000/api/permisos/me', {
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

    // 6. Inactivity Timeout (10 minutes)
    let inactivityTimer;
    const INACTIVITY_LIMIT_MS = 10 * 60 * 1000;

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(logoutDueToInactivity, INACTIVITY_LIMIT_MS);
    }

    function logoutDueToInactivity() {
        localStorage.removeItem('yelave_token');
        localStorage.removeItem('yelave_user');
        alert("Su sesión ha expirado por inactividad (10 minutos). Será redirigido al inicio de sesión.");
        window.location.href = 'login.html';
    }

    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keypress', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);
    window.addEventListener('scroll', resetInactivityTimer);
    window.addEventListener('touchstart', resetInactivityTimer);

    resetInactivityTimer();
})();
