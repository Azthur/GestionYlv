// auth-guard.js
(function() {
    // 1. Check if token exists immediately
    const token = localStorage.getItem('yelave_token');
    if (!token) {
        window.location.href = 'login.html';
        return; // Stop execution
    }

    // 2. Inactivity Timeout (10 minutes)
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
