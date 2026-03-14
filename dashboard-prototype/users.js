// ─── Auth Guard & Sesión ────────────
function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    try {
        const user = JSON.parse(localStorage.getItem('yelave_user'));
        if (user.rol !== 'ADMIN') {
            // Protect admin page
            window.location.href = 'index.html';
            return null;
        }
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
    if (roleEl) roleEl.textContent = user.rol === 'ADMIN' ? 'Administrador' : 'Usuario';
    if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre || user.login)}&background=2b3954&color=fff`;

    // Show admin menu
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
}

function logout() {
    localStorage.removeItem('yelave_token');
    localStorage.removeItem('yelave_user');
    window.location.href = 'login.html';
}

// ─── Sidebar Toggle ──────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active', sidebar.classList.contains('open'));
}

// ─── Modals ──────────────────────────────────
function openEditModal(login, nombre, correo, celular, rol, activo) {
    document.getElementById('editModalTitle').textContent = `Editar Usuario: ${login}`;
    document.getElementById('editLoginId').value = login;
    document.getElementById('editNombre').value = nombre || login;
    document.getElementById('editCorreo').value = correo || '';
    document.getElementById('editCelular').value = celular || '';
    document.getElementById('editRol').value = rol || 'USER';
    document.getElementById('editActivo').checked = activo;

    document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

function openPwdModal(login) {
    document.getElementById('resetPwdUsername').textContent = login;
    document.getElementById('pwdLoginId').value = login;
    document.getElementById('newPwdValue').value = '';
    
    document.getElementById('pwdModal').classList.add('active');
}

function closePwdModal() {
    document.getElementById('pwdModal').classList.remove('active');
}

// ─── Data Fetching ───────────────────────────
async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading-state">Cargando directorio...</td></tr>';
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                logout();
                return;
            }
            throw new Error('Error de servidor al cargar usuarios');
        }
        
        const users = await res.json();
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading-state">No se encontraron usuarios.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        users.forEach((u, idx) => {
            const tr = document.createElement('tr');
            tr.style.animation = `fadeIn 0.4s ease-out ${idx * 0.03}s forwards`;
            tr.style.opacity = '0';

            const activeBadge = u.activo ? '<span class="badge active">Activo</span>' : '<span class="badge inactive">Inactivo</span>';
            const roleBadge = u.rol === 'ADMIN' ? '<span class="badge admin">ADMIN</span>' : '<span class="badge user">USER</span>';

            // Escape strings for onclick
            const safeLogin = (u.login || '').replace(/'/g, "\\'");
            const safeNombre = (u.nombre || '').replace(/'/g, "\\'");
            const safeCorreo = (u.correo || '').replace(/'/g, "\\'");
            const safeCel = (u.celular || '').replace(/'/g, "\\'");
            const safeRol = (u.rol || 'USER').replace(/'/g, "\\'");

            tr.innerHTML = `
                <td><strong>${u.login}</strong></td>
                <td>${u.nombre || '<span style="color:#9ca3af;font-style:italic">No definido</span>'}</td>
                <td>${u.correo || '-'}</td>
                <td>${u.celular || '-'}</td>
                <td>${roleBadge}</td>
                <td>${activeBadge}</td>
                <td>
                    <button class="btn-text" onclick="openEditModal('${safeLogin}', '${safeNombre}', '${safeCorreo}', '${safeCel}', '${safeRol}', ${u.activo})" style="margin-right:0.5rem">Editar Perfil</button>
                    <button class="btn-text" onclick="openPwdModal('${safeLogin}')" style="color:var(--danger)">Reset Pwd</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-state" style="color:var(--danger)">${err.message}</td></tr>`;
    }
}

async function submitUserEdit() {
    const login = document.getElementById('editLoginId').value;
    const body = {
        nombre: document.getElementById('editNombre').value,
        correo: document.getElementById('editCorreo').value,
        celular: document.getElementById('editCelular').value,
        rol: document.getElementById('editRol').value,
        activo: document.getElementById('editActivo').checked
    };

    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/users/${login}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) throw new Error('Error al guardar cambios');
        
        closeEditModal();
        loadUsers(); // refresh data

    } catch (err) {
        alert(err.message);
    }
}

async function submitPasswordReset() {
    const login = document.getElementById('pwdLoginId').value;
    const newPwd = document.getElementById('newPwdValue').value;

    if (!newPwd) {
        alert('Ingrese la nueva contraseña');
        return;
    }

    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/users/${login}/reset-password`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ new_password: newPwd })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.detail || 'Error al restablecer');
        }
        
        alert(`Contraseña de ${login} actualizada exitosamente.`);
        closePwdModal();

    } catch (err) {
        alert(err.message);
    }
}

// ─── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const user = checkAuth();
    if (!user) return;
    
    renderUserInfo(user);
    loadUsers();
});
