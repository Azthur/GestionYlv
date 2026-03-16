// ─── Auth Guard & Sesión ────────────
let dtInstance = null;

function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    try {
        const userStr = localStorage.getItem('yelave_user');
        const user = JSON.parse(userStr);
        if (!user) throw new Error('No user data');

        const currentLogin = String(user.login || '').trim().toUpperCase();
        const currentRol = String(user.rol || '').trim().toUpperCase();
        
        const isSuperuser = currentLogin === '71941916JL' || currentLogin.includes('71941916JL');
        const isAdmin = currentRol === 'ADMIN';

        if (isSuperuser || isAdmin) {
            return user;
        } else {
            console.warn("Unauthorized access to users.html, redirecting...");
            window.location.href = 'index.html';
            return null;
        }
    } catch (e) {
        console.error("Auth error:", e);
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
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            if (res.status === 401) return logout();
            if (res.status === 403) { window.location.href = 'index.html'; return; }
            throw new Error('Error de servidor');
        }
        
        const users = await res.json();
        
        // 1. CLEAR THE DOM TBODY COMPLETELY before DT initialization to avoid "Incorrect column count"
        // DataTables hates seeing that "Cargando..." row with colspan=7 when it expects 7 columns.
        tbody.innerHTML = '';

        // 2. Initialize or Clear DataTable
        if (!dtInstance) {
            dtInstance = $('#usersTable').DataTable({
                language: {
                    url: 'https://cdn.datatables.net/plug-ins/1.13.8/i18n/es-ES.json',
                    search: "Buscar en todo el directorio:",
                    zeroRecords: "No se encontraron usuarios coincidentes",
                    info: "Mostrando _START_ a _END_ de _TOTAL_ usuarios",
                    infoFiltered: "(filtrado de _MAX_ registros totales)"
                },
                pageLength: 10,
                responsive: true,
                dom: '<"dt-top-actions"Bf>rtip',
                buttons: [
                    {
                        extend: 'excelHtml5',
                        text: 'Exportar a Excel',
                        className: 'btn btn-outline',
                        title: 'Directorio de Usuarios - YELAVE',
                        exportOptions: { columns: [0, 1, 2, 3, 4, 5] }
                    }
                ],
                columns: [
                    { data: 'login', render: (data) => `<strong>${data}</strong>` },
                    { data: 'nombre', render: (data) => data || '<span style="color:#9ca3af;font-style:italic">No definido</span>' },
                    { data: 'correo', render: (data) => data || '-' },
                    { data: 'celular', render: (data) => data || '-' },
                    { 
                        data: 'rol', 
                        render: (data) => {
                            if (data === 'ADMIN') return '<span class="badge admin">ADMIN</span>';
                            if (data === 'LOGISTICA') return '<span class="badge" style="background:#FEF3C7; color:#92400E;">LOGISTICA</span>';
                            if (data === 'CONTROL_INTERNO') return '<span class="badge" style="background:#E0F2FE; color:#0369A1;">CONTROL_INTERNO</span>';
                            if (data === 'CONTABILIDAD') return '<span class="badge" style="background:#F3E8FF; color:#7E22CE;">CONTABILIDAD</span>';
                            if (data === 'COMERCIAL') return '<span class="badge" style="background:#D1FAE5; color:#047857;">COMERCIAL</span>';
                            return `<span class="badge user">${data || 'USER'}</span>`;
                        }
                    },
                    { 
                        data: 'activo', 
                        render: (data) => data ? '<span class="badge active">Activo</span>' : '<span class="badge inactive">Inactivo</span>'
                    },
                    {
                        data: null,
                        orderable: false,
                        render: (data, type, row) => {
                            const safeLogin = (row.login || '').replace(/'/g, "\'");
                            const safeNombre = (row.nombre || '').replace(/'/g, "\'");
                            const safeCorreo = (row.correo || '').replace(/'/g, "\'");
                            const safeCel = (row.celular || '').replace(/'/g, "\'");
                            const safeRol = (row.rol || 'USER').replace(/'/g, "\'");
                            
                            return `
                                <button class="btn-text" onclick="openEditModal('${safeLogin}', '${safeNombre}', '${safeCorreo}', '${safeCel}', '${safeRol}', ${row.activo})" style="margin-right:0.5rem">Editar</button>
                                <button class="btn-text" onclick="openPwdModal('${safeLogin}')" style="color:var(--danger)">Reset</button>
                            `;
                        }
                    }
                ]
            });
        }

        // 3. Populate Data using DataTables API (Global Search Support)
        dtInstance.clear();
        dtInstance.rows.add(users);
        dtInstance.draw();

        console.log("DataTable indexado con", users.length, "usuarios.");

    } catch (err) {
        console.error("Error cargando usuarios:", err);
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
