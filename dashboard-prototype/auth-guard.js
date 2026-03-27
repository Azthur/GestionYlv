// auth-guard.js
(function() {
    // 1. Check if token exists immediately
    const token = localStorage.getItem('yelave_token');
    const userStr = localStorage.getItem('yelave_user');
    
    if (!token || !userStr) {
        window.location.href = 'login.html';
        return; // Stop execution
    }

    // 2. Role-Based Access Control (RBAC) at built-in Page Level
    try {
        const user = JSON.parse(userStr);
        const currentPath = window.location.pathname.toLowerCase();
        
        // Always allowed pages
        if (!currentPath.includes('login.html') && 
            !currentPath.includes('index.html') && 
            !currentPath.includes('profile.html') &&
            currentPath.endsWith('.html')) {
            
            const currentLogin = String(user.login || '').trim().toUpperCase();
            const userRol = String(user.rol || '').trim().toUpperCase();
            const isAdmin = currentLogin === '71941916JL' || currentLogin.includes('71941916JL') || userRol === 'ADMIN';

            if (!isAdmin) {
                let isAllowed = false;

                // Define role permissions based on app.js mapping
                if (userRol === 'LOGISTICA') {
                    if (currentPath.includes('orders.html')) isAllowed = true;
                } else if (userRol === 'CONTROL_INTERNO') {
                    if (currentPath.includes('conciliacion.html') || currentPath.includes('cuentas-cobrar.html')) isAllowed = true;
                } else if (userRol === 'CONTABILIDAD') {
                    if (currentPath.includes('orders.html') || currentPath.includes('conciliacion.html') || currentPath.includes('cuentas-cobrar.html')) isAllowed = true;
                } else if (userRol === 'COMERCIAL') {
                    if (currentPath.includes('conciliacion.html') || currentPath.includes('cuentas-cobrar.html')) isAllowed = true;
                }

                if (!isAllowed) {
                    // Unauthorized access attempt, redirect to safe zone
                    alert("Acceso Denegado: Su rol no tiene permisos para acceder a este módulo.");
                    window.location.href = 'index.html';
                    return;
                }
            }
        }
    } catch (e) {
        console.error("Error parsing user data for RBAC", e);
        window.location.href = 'login.html';
        return;
    }

    // 3. Inactivity Timeout (10 minutes)
    let inactivityTimer;
    const INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutos en milisegundos

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

    // Listen to user events globally to reset the timer
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keypress', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);
    window.addEventListener('scroll', resetInactivityTimer);
    window.addEventListener('touchstart', resetInactivityTimer);

    // Initialize timer on load
    resetInactivityTimer();
})();
