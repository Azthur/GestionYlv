with open('C:/SistemaGestionyelave/dashboard-prototype/users.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add logic to switchTab
content = content.replace(
    "    if (tabId === 'tab-vendedores') {\\n        loadVendedorUsersForSelect();\\n        loadVendedorCiasForSelect();\\n    }",
    "    if (tabId === 'tab-vendedores') {\\n        loadVendedorUsersForSelect();\\n        loadVendedorCiasForSelect();\\n    }\\n    if (tabId === 'tab-tiendas-rendicion') {\\n        loadTiendaUsersForSelect();\\n        loadTiendaCiasForSelect();\\n    }"
)

# Add Tiendas Rendicion functions
tiendas_code = """
// ─── Tiendas Rendición ──────────────────────────────
async function loadTiendaUsersForSelect() {
    const sel = document.getElementById('selTiendaUser');
    if (sel.options.length > 1) return; // Already loaded
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const users = await res.json();
        window._webUsersCache = users; // Cache users list
        
        sel.innerHTML = '<option value="">-- Seleccionar Usuario --</option>';
        users.forEach(u => {
            sel.insertAdjacentHTML('beforeend', `<option value="${u.login}">${u.nombre || u.login} (${u.login})</option>`);
        });
    } catch (e) { console.error('Error loading users for tienda select', e); }
}

async function loadTiendaCiasForSelect() {
    const sel = document.getElementById('selTiendaCia');
    if (sel.options.length > 1) return; // Already loaded
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/permisos/empresas/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const empresas = await res.json();
        
        sel.innerHTML = '<option value="">-- Seleccionar Empresa --</option>';
        empresas.forEach(e => {
            sel.insertAdjacentHTML('beforeend', `<option value="${e.codcia}">${e.codcia} - ${e.nomcia}</option>`);
        });
    } catch (e) { console.error('Error loading empresas for tienda select', e); }
}

async function loadUserTiendas() {
    const login = document.getElementById('selTiendaUser').value;
    const codcia = document.getElementById('selTiendaCia').value;
    const container = document.getElementById('tiendas-checkboxes');
    
    if (!login || !codcia) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Seleccione un usuario y una empresa.</p>';
        return;
    }
    
    try {
        const token = localStorage.getItem('yelave_token');
        if (!token) throw new Error('Sesión expirada o no válida. Identifíquese de nuevo.');
        
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Cargando tiendas rendición...</p>';

        const [allRes, userRes] = await Promise.all([
            fetch(`/api/admin/tiendas-rendicion?codcia=${codcia}`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`/api/admin/usuario-tiendas/${login}?codcia=${codcia}`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        
        if (!allRes.ok) {
            const err = await allRes.json();
            throw new Error(err.detail || 'Error al cargar catálogo de tiendas');
        }
        if (!userRes.ok) {
            const err = await userRes.json();
            throw new Error(err.detail || 'Error al cargar tiendas del usuario');
        }

        const allItems = await allRes.json();
        const userItems = await userRes.json();

        const assignedSet = new Set(Array.isArray(userItems) ? userItems.map(v => v.trim()) : []);
        
        if (allItems.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No se encontraron tiendas en esta empresa.</p>';
            return;
        }

        // Check if user has PuedeVerTodo
        const userObj = window._webUsersCache ? window._webUsersCache.find(u => String(u.login).trim().toUpperCase() === String(login).trim().toUpperCase()) : null;
        const canSeeAll = userObj ? !!userObj.puede_ver_todo : false;

        let html = '';
        if (canSeeAll) {
            html += `
                <div style="grid-column: 1 / -1; padding: 1rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; color: #10b981; font-size: 0.85rem; font-weight: 500; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                    <span>💡</span>
                    <span>Este usuario tiene habilitada la opción <strong>"Puede Ver Todos los Registros"</strong> en su perfil. Actualmente visualiza todas las tiendas sin restricciones.</span>
                </div>
            `;
        }

        html += allItems.map(v => {
            const cod = (v.codigo || '').trim();
            const nom = (v.nombre || '').trim();
            const checked = assignedSet.has(cod) ? 'checked' : '';
            return `<label style="display:flex;align-items:center;gap:0.5rem;padding:0.6rem 1rem;border-radius:8px;border:1px solid var(--border);cursor:pointer;transition:all 0.2s;font-size:0.85rem;">
                <input type="checkbox" class="tienda-cb" value="${cod}" ${checked} style="width:16px;height:16px;cursor:pointer;">
                <strong>${cod}</strong> - ${nom}
            </label>`;
        }).join('');

        container.innerHTML = html;
    } catch (e) {
        console.error('loadUserTiendas error:', e);
        container.innerHTML = `<p style="color:var(--danger); padding:1rem; border:1px dashed var(--danger); border-radius:8px; background:var(--danger-bg);">
            <strong>Error:</strong> ${e.message}
        </p>`;
    }
}

async function saveUserTiendas() {
    const login = document.getElementById('selTiendaUser').value;
    const codcia = document.getElementById('selTiendaCia').value;
    if (!login || !codcia) { alert('Seleccione usuario y empresa primero'); return; }
    
    const checked = document.querySelectorAll('.tienda-cb:checked');
    const tiendas = Array.from(checked).map(cb => cb.value);
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/admin/usuario-tiendas/${login}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ codcia, tiendas })
        });
        if (!res.ok) throw new Error('Error al guardar');
        const data = await res.json();
        alert(data.message || 'Tiendas actualizadas');
    } catch (e) {
        alert('Error: ' + e.message);
    }
}
"""

content = content.replace(
    '// ─── Init ────────────────────────────────────',
    tiendas_code + '\\n// ─── Init ────────────────────────────────────'
)

with open('C:/SistemaGestionyelave/dashboard-prototype/users.js', 'w', encoding='utf-8') as f:
    f.write(content)
