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

// ─── Tabs ────────────────────────────────────
function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.style.borderBottomColor = 'transparent';
        b.style.color = 'var(--text-muted)';
    });
    
    const panel = document.getElementById(tabId);
    if (panel) panel.style.display = 'block';
    if (btn) {
        btn.classList.add('active');
        btn.style.borderBottomColor = 'var(--primary)';
        btn.style.color = 'var(--primary)';
    }
    
    // Lazy load data
    if (tabId === 'tab-permisos') loadRolesForSelect();
    if (tabId === 'tab-roles') loadRoles();
    if (tabId === 'tab-empresas') loadUsersForSelect();
}

// ─── Permisos ────────────────────────────────
async function loadRolesForSelect() {
    const sel = document.getElementById('selPermisoRol');
    if (sel.options.length > 1) return; // Already loaded
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/admin/roles', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const roles = await res.json();
        
        roles.forEach(r => {
            if (r.Codigo !== 'ADMIN') { // Admin always has full access
                sel.insertAdjacentHTML('beforeend', `<option value="${r.Codigo}">${r.Nombre} (${r.Codigo})</option>`);
            }
        });
    } catch (e) { console.error('Error loading roles for select', e); }
}

async function loadPermisosByRol() {
    const rol = document.getElementById('selPermisoRol').value;
    const tbody = document.getElementById('permisos-tbody');
    if (!rol) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">Seleccione un rol</td></tr>';
        return;
    }
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/admin/permisos?rol=${rol}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error');
        const permisos = await res.json();
        
        tbody.innerHTML = permisos.map(p => {
            const isChild = p.ParentId !== null;
            const styleLabel = isChild ? 'padding-left:1.5rem; color:var(--text-muted); font-size:0.85rem;' : 'font-weight:600;';
            const rowClass = isChild ? 'child-row' : 'parent-row';
            
            return `
            <tr data-modulo-id="${p.ModuloId}" data-parent-id="${p.ParentId || ''}" class="${rowClass}">
                <td style="color:var(--text-muted);font-size:0.75rem;">${p.Seccion || '-'}</td>
                <td style="${styleLabel}">
                    ${isChild ? '↳ ' : ''}${p.Nombre}
                    <br><small style="color:var(--text-muted);font-weight:normal;">${p.Codigo}</small>
                </td>
                <td style="text-align:center;"><input type="checkbox" class="perm-ver" ${p.PuedeVer ? 'checked' : ''} onchange="propagatePerm(this, 'perm-ver')"></td>
                <td style="text-align:center;"><input type="checkbox" class="perm-editar" ${p.PuedeEditar ? 'checked' : ''} onchange="propagatePerm(this, 'perm-editar')"></td>
                <td style="text-align:center;"><input type="checkbox" class="perm-eliminar" ${p.PuedeEliminar ? 'checked' : ''} onchange="propagatePerm(this, 'perm-eliminar')"></td>
                <td style="text-align:center;"><input type="checkbox" class="perm-aprobar" ${p.PuedeAprobar ? 'checked' : ''} onchange="propagatePerm(this, 'perm-aprobar')"></td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:var(--danger);text-align:center;padding:2rem;">Error cargando permisos</td></tr>';
    }
}

/** Propaga el permiso a los hijos si es un padre */
function propagatePerm(el, cls) {
    const row = el.closest('tr');
    const modId = row.dataset.moduloId;
    const checked = el.checked;
    
    // Buscar filas cuyo ParentId sea este modulo
    const children = document.querySelectorAll(`#permisos-tbody tr[data-parent-id="${modId}"]`);
    children.forEach(child => {
        const cb = child.querySelector('.' + cls);
        if (cb) {
            cb.checked = checked;
            // Recursividad para hijos de hijos (si hubiera)
            propagatePerm(cb, cls);
        }
    });
}

async function savePermisos() {
    const rol = document.getElementById('selPermisoRol').value;
    if (!rol) { alert('Seleccione un rol primero'); return; }
    
    const rows = document.querySelectorAll('#permisos-tbody tr[data-modulo-id]');
    const permisos = [];
    rows.forEach(row => {
        permisos.push({
            moduloId: parseInt(row.dataset.moduloId),
            puedeVer: row.querySelector('.perm-ver').checked,
            puedeEditar: row.querySelector('.perm-editar').checked,
            puedeEliminar: row.querySelector('.perm-eliminar').checked,
            puedeAprobar: row.querySelector('.perm-aprobar').checked,
        });
    });
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/admin/permisos', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ rol, permisos })
        });
        if (!res.ok) throw new Error('Error al guardar');
        const data = await res.json();
        alert(data.message || 'Permisos guardados exitosamente');
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// ─── Roles ───────────────────────────────────
async function loadRoles() {
    const tbody = document.getElementById('roles-tbody');
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/admin/roles', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error');
        const roles = await res.json();
        
        tbody.innerHTML = roles.map(r => `
            <tr>
                <td><strong>${r.Codigo}</strong></td>
                <td>${r.Nombre}</td>
                <td style="color:var(--text-muted);font-size:0.85rem;">${r.Descripcion || '-'}</td>
                <td>${r.Activo ? '<span class="badge active">Activo</span>' : '<span class="badge inactive">Inactivo</span>'}</td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:var(--danger);">Error cargando roles</td></tr>';
    }
}

function openNewRoleModal() {
    const codigo = prompt('Codigo del nuevo rol (sin espacios, ej: SUPERVISOR):');
    if (!codigo) return;
    const nombre = prompt('Nombre del rol (ej: Supervisor de Area):');
    if (!nombre) return;
    const desc = prompt('Descripcion (opcional):') || '';
    
    createRole(codigo.toUpperCase().replace(/\s/g, '_'), nombre, desc);
}

async function createRole(codigo, nombre, descripcion) {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/admin/roles', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo, nombre, descripcion })
        });
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Error');
        }
        alert('Rol creado exitosamente');
        loadRoles();
        // Reset select cache
        document.getElementById('selPermisoRol').innerHTML = '<option value="">-- Seleccionar Rol --</option>';
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// ─── Empresas ────────────────────────────────
async function loadUsersForSelect() {
    const sel = document.getElementById('selEmpresaUser');
    if (sel.options.length > 1) return; // Already loaded
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const users = await res.json();
        
        users.forEach(u => {
            sel.insertAdjacentHTML('beforeend', `<option value="${u.login}">${u.nombre || u.login} (${u.login})</option>`);
        });
    } catch (e) { console.error('Error loading users', e); }
}

async function loadUserEmpresas() {
    const login = document.getElementById('selEmpresaUser').value;
    const container = document.getElementById('empresas-checkboxes');
    if (!login) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Seleccione un usuario.</p>';
        return;
    }
    
    try {
        const token = localStorage.getItem('yelave_token');
        if (!token) throw new Error('Sesión expirada o no válida. Identifíquese de nuevo.');

        // Load all companies and user's assigned companies in parallel
        const [empRes, userEmpRes] = await Promise.all([
            fetch('/api/permisos/empresas/me', { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`/api/admin/usuario-empresas/${login}`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        
        // Handle unauthorized or other errors before parsing json
        if (empRes.status === 401 || userEmpRes.status === 401) {
            throw new Error('Su sesión ha expirado. Por favor, vuelva a iniciar sesión.');
        }

        if (!empRes.ok) {
            const err = await empRes.json();
            throw new Error(err.detail || 'Error al cargar catálogo de empresas');
        }
        if (!userEmpRes.ok) {
            const err = await userEmpRes.json();
            throw new Error(err.detail || 'Error al cargar empresas del usuario');
        }

        const allEmpresas = await empRes.json();
        const userEmpresas = await userEmpRes.json();

        // Safety check for allEmpresas (must be array)
        if (!Array.isArray(allEmpresas)) {
            console.error('Expected array for allEmpresas, got:', allEmpresas);
            throw new Error('Respuesta de servidor inválida (Catálogo)');
        }

        const assignedSet = new Set(Array.isArray(userEmpresas) ? userEmpresas.map(e => e.trim()) : []);
        
        container.innerHTML = allEmpresas.map(e => {
            const cod = (e.codcia || '').trim();
            const nom = e.nomcia || '';
            const checked = assignedSet.has(cod) ? 'checked' : '';
            return `<label style="display:flex;align-items:center;gap:0.5rem;padding:0.6rem 1rem;border-radius:8px;border:1px solid var(--border);cursor:pointer;transition:all 0.2s;font-size:0.85rem;">
                <input type="checkbox" class="empresa-cb" value="${cod}" ${checked} style="width:16px;height:16px;cursor:pointer;">
                <strong>${cod}</strong> - ${nom}
            </label>`;
        }).join('');
    } catch (e) {
        console.error('loadUserEmpresas error:', e);
        container.innerHTML = `<p style="color:var(--danger); padding:1rem; border:1px dashed var(--danger); border-radius:8px; background:var(--danger-bg);">
            <strong>Error:</strong> ${e.message}
        </p>`;
    }
}

async function saveUserEmpresas() {
    const login = document.getElementById('selEmpresaUser').value;
    if (!login) { alert('Seleccione un usuario primero'); return; }
    
    const checked = document.querySelectorAll('.empresa-cb:checked');
    const empresas = Array.from(checked).map(cb => cb.value);
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/admin/usuario-empresas/${login}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ empresas })
        });
        if (!res.ok) throw new Error('Error al guardar');
        const data = await res.json();
        alert(data.message || 'Empresas actualizadas');
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// ─── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const user = checkAuth();
    if (!user) return;
    
    renderUserInfo(user);
    loadUsers();
    
    // Activate first tab visually
    const firstTab = document.querySelector('.tab-btn');
    if (firstTab) {
        firstTab.style.borderBottomColor = 'var(--primary)';
        firstTab.style.color = 'var(--primary)';
    }
});
