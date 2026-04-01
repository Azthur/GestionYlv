// ─── Auth Guard & Sesión ────────────
function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    try {
        return JSON.parse(localStorage.getItem('yelave_user'));
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
    
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre || user.login)}&background=2b3954&color=fff`;
    if (avatarEl) avatarEl.src = avatarUrl;
    
    // Main profile picture in the specific page
    const mainAvatar = document.getElementById('mainProfileAvatar');
    if (mainAvatar) mainAvatar.src = avatarUrl;
    
    const mainName = document.getElementById('mainProfileName');
    if (mainName) mainName.textContent = user.nombre || user.login;
    
    const mainLogin = document.getElementById('mainProfileLogin');
    if (mainLogin) mainLogin.textContent = `@${user.login.toLowerCase()}`;

    // Access Control
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
            if (href.includes('conciliacion.html')) isVisible = true;
        } else if (userRol === 'CONTABILIDAD') {
            if (href.includes('orders.html') || href.includes('conciliacion.html')) isVisible = true;
        } else if (userRol === 'COMERCIAL') {
            if (href.includes('conciliacion.html')) isVisible = true;
        }

        if (!isVisible) {
            el.style.display = 'none';
        }
    });

    // Handle nav groups
    document.querySelectorAll('.nav-group').forEach(group => {
        const visibleItems = Array.from(group.querySelectorAll('.nav-item')).filter(item => item.style.display !== 'none');
        if (visibleItems.length === 0) {
            group.style.display = 'none';
        } else {
            group.style.display = 'block';
        }
    });
}

function logout() {
    localStorage.removeItem('yelave_token');
    localStorage.removeItem('yelave_user');
    window.location.href = 'login.html';
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active', sidebar.classList.contains('open'));
}

// ─── Fetch Data ────────────
async function loadProfile() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/users/me/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('No se pudo cargar el perfil');
        const data = await res.json();
        
        document.getElementById('profileNombre').value = data.nombre || '';
        document.getElementById('profileCorreo').value = data.correo || '';
        document.getElementById('profileCelular').value = data.celular || '';
        
        const rolEl = document.getElementById('profileRol');
        if (rolEl) rolEl.value = data.rol || 'USER';

        // Check if admin to show extra info
        const user = JSON.parse(localStorage.getItem('yelave_user'));
        if (user && user.rol === 'ADMIN') {
            const adminInfo = document.getElementById('adminRoleInfo');
            if (adminInfo) adminInfo.style.display = 'block';
        }
        
    } catch(e) {
        console.error(e);
    }
}

function showMessage(elId, success, msg) {
    const el = document.getElementById(elId);
    el.textContent = msg;
    el.className = `form-message ${success ? 'success' : 'error'}`;
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ─── Forms ────────────
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('yelave_token');
    
    const body = {
        nombre: document.getElementById('profileNombre').value,
        correo: document.getElementById('profileCorreo').value,
        celular: document.getElementById('profileCelular').value
    };
    
    try {
        const res = await fetch('/api/users/me/profile', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        if (!res.ok) throw new Error('Error al actualizar el perfil');
        showMessage('profileMsg', true, '¡Perfil actualizado correctamente!');
        
        // Update local context
        let user = JSON.parse(localStorage.getItem('yelave_user'));
        user.nombre = body.nombre;
        localStorage.setItem('yelave_user', JSON.stringify(user));
        renderUserInfo(user);
        
    } catch(e) {
        showMessage('profileMsg', false, e.message);
    }
});

document.getElementById('pwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('yelave_token');
    
    const oldPwd = document.getElementById('oldPwd').value;
    const newPwd = document.getElementById('newPwd').value;
    const confirmPwd = document.getElementById('confirmPwd').value;
    
    if (newPwd !== confirmPwd) {
        showMessage('pwdMsg', false, 'Las contraseñas nuevas no coinciden');
        return;
    }
    
    try {
        const res = await fetch('/api/users/me/password', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ old_password: oldPwd, new_password: newPwd })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Error al actualizar contraseña');
        }
        
        showMessage('pwdMsg', true, '¡Contraseña de FoxPro/Web cambiada! (Vuelve a loguearte)');
        document.getElementById('pwdForm').reset();
        
        setTimeout(() => logout(), 2500);
        
    } catch(e) {
        showMessage('pwdMsg', false, e.message);
    }
});

function togglePassword(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        iconElement.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
    } else {
        input.type = 'password';
        iconElement.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    }
}

// ─── Init ────────────
document.addEventListener('DOMContentLoaded', () => {
    const user = checkAuth();
    if (!user) return;
    
    renderUserInfo(user);
    loadProfile();
});
