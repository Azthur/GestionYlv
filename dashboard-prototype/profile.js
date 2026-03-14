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
    if (roleEl) roleEl.textContent = user.rol === 'ADMIN' ? 'Administrador' : 'Usuario';
    
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre || user.login)}&background=2b3954&color=fff`;
    if (avatarEl) avatarEl.src = avatarUrl;
    
    // Main profile picture in the specific page
    const mainAvatar = document.getElementById('mainProfileAvatar');
    if (mainAvatar) mainAvatar.src = avatarUrl;
    
    const mainName = document.getElementById('mainProfileName');
    if (mainName) mainName.textContent = user.nombre || user.login;
    
    const mainLogin = document.getElementById('mainProfileLogin');
    if (mainLogin) mainLogin.textContent = `@${user.login.toLowerCase()}`;

    // Admin link visibility
    if (user.rol === 'ADMIN') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
    }
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

// ─── Init ────────────
document.addEventListener('DOMContentLoaded', () => {
    const user = checkAuth();
    if (!user) return;
    
    renderUserInfo(user);
    loadProfile();
});
