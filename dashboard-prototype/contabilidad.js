// ═══════════════════════════════════════════════════════════
//  Módulo Contable - JavaScript
// ═══════════════════════════════════════════════════════════

// ─── Auth & Session ─────────────────
function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) { window.location.href = 'login.html'; return null; }
    try {
        const user = JSON.parse(localStorage.getItem('yelave_user'));
        if (!user) throw new Error();
        return user;
    } catch(e) { window.location.href = 'login.html'; return null; }
}
function renderUserInfo(user) {
    if (!user) return;
    const nameEl = document.getElementById('userNameDisplay');
    const roleEl = document.getElementById('userRoleDisplay');
    const avatarEl = document.getElementById('userAvatar');
    if (nameEl) nameEl.textContent = user.nombre || user.login;
    let roleLabel = 'Consultor';
    const login = String(user.login||'').trim().toUpperCase();
    const isSuperuser = login === '71941916JL' || login.includes('71941916JL');
    const isAdmin = String(user.rol||'').trim().toUpperCase() === 'ADMIN';
    if (isSuperuser || isAdmin) roleLabel = 'Administrador';
    else if (user.rol) roleLabel = user.rol;
    if (roleEl) roleEl.textContent = roleLabel;
    if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre||user.login)}&background=2b3954&color=fff`;
}
function logout() { localStorage.removeItem('yelave_token'); localStorage.removeItem('yelave_user'); window.location.href = 'login.html'; }
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active', sidebar.classList.contains('open'));
}

// ─── Format Utils ────────────
const fmtNum = (val, dec = 2) => {
    if (val === null || val === undefined || isNaN(val)) return '0.00';
    return parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

// ─── Global State ────────────
let dtCompras = null;
let dtFacturas = null;
let invoiceItems = [];
let invoiceMode = 'auto';
let currentCodCia = '';

// ─── Tab Switching ────────────
function switchTab(tab) {
    document.querySelectorAll('.cnt-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.cnt-tab-panel').forEach(p => p.classList.remove('active'));
    
    const panels = { compras: 'panelCompras', tokens: 'panelTokens' };
    const idx = { compras: 0, tokens: 1 };
    
    document.querySelectorAll('.cnt-tab-btn')[idx[tab]].classList.add('active');
    document.getElementById(panels[tab]).classList.add('active');
    
    if (tab === 'tokens') loadTokens();
}

// ─── Invoice Mode ────────────
function setInvoiceMode(mode) {
    invoiceMode = mode;
    document.getElementById('btnModeAuto').classList.toggle('active', mode === 'auto');
    document.getElementById('btnModeManual').classList.toggle('active', mode === 'manual');
    document.getElementById('autoSearchPanel').style.display = mode === 'auto' ? 'block' : 'none';
}

// ─── Load Companies ──────────
async function loadCompanies() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/permisos/empresas/me', { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (!res.ok) throw new Error();
        const companies = await res.json();
        
        ['cntEmpresa', 'tokCodCia'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            sel.innerHTML = '<option value="" disabled selected>Seleccione Empresa...</option>';
            companies.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.codcia; opt.textContent = `${c.codcia} - ${c.nomcia}`;
                sel.appendChild(opt);
            });
        });

        // Initialize default selection
        const savedCia = localStorage.getItem('cnt_saved_cia');
        const cu = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        const defaultCia = savedCia || cu.codcia || (companies.length > 0 ? companies[0].codcia : '');

        if (defaultCia) {
            const el = document.getElementById('cntEmpresa');
            if (el && Array.from(el.options).some(o => o.value === defaultCia)) {
                el.value = defaultCia;
                currentCodCia = defaultCia;
            }
        }
    } catch(e) {
        console.error('Error loadCompanies:', e);
        if (document.getElementById('cntEmpresa')) 
            document.getElementById('cntEmpresa').innerHTML = '<option value="" disabled>Sin acceso a empresas</option>';
    }
}

function getSelectedCia() {
    const v = document.getElementById('cntEmpresa').value;
    if (!v) {
        Swal.fire({icon:'warning', title:'Atención', text:'Seleccione una empresa primero'});
        return null;
    }
    currentCodCia = v;
    localStorage.setItem('cnt_saved_cia', v);
    return v;
}

// ════════════════════════════════════════════════════════════
//  TAB 1: COMPRAS SUNAT
// ════════════════════════════════════════════════════════════

async function syncCompras() {
    const codcia = getSelectedCia();
    if (!codcia) return;
    
    const periodo = document.getElementById('syncPeriodo').value.trim();
    
    if (!periodo || periodo.length !== 6) {
        Swal.fire({icon:'warning', title:'Periodo inválido', text:'Ingrese el periodo en formato YYYYMM (ej: 202509)'});
        return;
    }

    // Get RUC from tokens
    try {
        const tokRes = await fetch('/api/contabilidad/tokens');
        const tokens = await tokRes.json();
        const tk = tokens.find(t => t.CodCia.trim() === codcia.trim() && t.Activo);
        if (!tk) {
            Swal.fire({icon:'error', title:'Sin Token', text:'No hay token configurado para esta empresa. Vaya a la pestaña "Configuración Tokens" para agregar uno.'});
            return;
        }

        Swal.fire({ title: 'Sincronizando compras...', html: `Consultando API SUNAT para periodo ${periodo}.<br>Esto descargará <b>todas las páginas</b>, por favor espere...`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const res = await fetch('/api/contabilidad/compras/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codcia, num_ruc: tk.NumRuc, periodo, pagina: 1 })
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.detail || 'Error al sincronizar');

        Swal.fire({
            icon: 'success', title: 'Sincronización Completada',
            html: `<div style="text-align:left; font-size:0.875rem;">
                <p><strong>${data.inserted}</strong> documentos nuevos insertados</p>
                <p><strong>${data.skipped}</strong> documentos ya existentes (omitidos)</p>
                <p><strong>${data.total_api}</strong> total documentos en SUNAT</p>
            </div>`,
            timer: 4000
        });
        
        loadCompras();
    } catch(err) {
        Swal.fire({icon:'error', title:'Error', text: err.message});
    }
}

async function loadCompras() {
    const codcia = getSelectedCia();
    if (!codcia) return;
    
    const periodo = document.getElementById('syncPeriodo').value.trim() || null;
    const proveedor = document.getElementById('comprasFilterProv').value.trim() || null;

    if (dtCompras) { dtCompras.destroy(); dtCompras = null; }

    try {
        let url = `/api/contabilidad/compras?codcia=${encodeURIComponent(codcia)}`;
        if (periodo) url += `&periodo=${periodo}`;
        if (proveedor) url += `&proveedor=${encodeURIComponent(proveedor)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al cargar compras');
        const result = await res.json();

        const dtData = result.data.map(c => [
            c.DesTipoCDP || c.CodTipoCDP || '-',
            `${c.NumSerieCDP || ''}-${c.NumCDP || ''}`,
            c.FecEmision || '-',
            (c.NomRazonSocialProveedor || '').substring(0, 40),
            c.NumDocIdProveedor || '-',
            c.CodMoneda || 'PEN',
            fmtNum(c.MtoBIGravadaDG),
            fmtNum(c.MtoIgvIpmDG),
            `<strong>${fmtNum(c.MtoTotalCp)}</strong>`,
            c.DesEstadoComprobante ? `<span class="cnt-badge ${c.DesEstadoComprobante === 'Activo' ? 'active' : 'inactive'}">${c.DesEstadoComprobante}</span>` : '-'
        ]);

        dtCompras = $('#comprasTable').DataTable({
            data: dtData, destroy: true, order: [[2, 'desc']], pageLength: 25, scrollX: true,
            language: {
                search: 'Buscar:', lengthMenu: 'Mostrar _MENU_', info: '_START_ a _END_ de _TOTAL_',
                infoEmpty: 'Sin registros', zeroRecords: 'Sin resultados',
                paginate: { first: '«', previous: '‹', next: '›', last: '»' }
            },
            dom: '<"dt-top"Bfl>rt<"dt-bottom"ip>',
            buttons: [
                { extend: 'excel', text: '📊 Excel', title: 'Compras_SUNAT' },
            ],
            columnDefs: [
                { targets: [6,7,8], className: 'dt-body-right' },
                { targets: [5,9], className: 'dt-body-center' }
            ]
        });
    } catch(err) {
        document.getElementById('comprasTbody').innerHTML = `<tr><td colspan="10" style="text-align:center;color:#ef4444;padding:2rem;">${err.message}</td></tr>`;
    }
}

// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//  TAB 3: TOKENS
// ════════════════════════════════════════════════════════════

async function loadTokens() {
    const grid = document.getElementById('tokenGrid');
    grid.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-muted); grid-column:1/-1;">Cargando tokens...</div>';

    try {
        const res = await fetch('/api/contabilidad/tokens');
        if (!res.ok) throw new Error('Error al cargar tokens');
        const tokens = await res.json();

        if (tokens.length === 0) {
            grid.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-muted); grid-column:1/-1;">No hay tokens configurados. Agregue uno usando el formulario de arriba.</div>';
            return;
        }

        let html = '';
        tokens.forEach(t => {
            const mask = (v) => v ? '••••••' + v.slice(-6) : '<span style="color:#94a3b8;">No configurado</span>';
            html += `
            <div class="cnt-token-card">
                <div class="cnt-token-card-header">
                    <div>
                        <div class="cnt-token-card-title">${t.NomEmpresa || t.CodCia}</div>
                        <div class="cnt-token-card-ruc">RUC: ${t.NumRuc || '-'}</div>
                    </div>
                    <span class="cnt-badge ${t.Activo ? 'active' : 'inactive'}">${t.Activo ? 'Activo' : 'Inactivo'}</span>
                </div>
                <div class="cnt-token-card-body">
                    <div class="cnt-token-field"><span class="tlabel">CodCia:</span><span class="tvalue">${t.CodCia}</span></div>
                    <div class="cnt-token-field"><span class="tlabel">MisCompras:</span><span class="tvalue" title="${t.TokenMisCompras || ''}">${mask(t.TokenMisCompras)}</span></div>
                    <div class="cnt-token-field"><span class="tlabel">DatosCPE:</span><span class="tvalue" title="${t.TokenDatosCpe || ''}">${mask(t.TokenDatosCpe)}</span></div>
                    <div class="cnt-token-field"><span class="tlabel">Corporativo:</span><span class="tvalue" title="${t.TokenCorpo || ''}">${mask(t.TokenCorpo)}</span></div>
                </div>
                <div class="cnt-token-card-actions">
                    <button class="btn btn-outline" onclick="editToken(${t.Id}, '${t.CodCia.trim()}','${t.NumRuc}','${escapeHtml(t.NomEmpresa)}','${t.TokenMisCompras||''}','${t.TokenDatosCpe||''}','${t.TokenCorpo||''}')" style="flex:1; font-size:0.725rem; padding:0.35rem;">Editar</button>
                    <button class="btn btn-outline" onclick="deleteToken(${t.Id})" style="font-size:0.725rem; padding:0.35rem 0.75rem; color:#ef4444; border-color:#fecaca;">Eliminar</button>
                </div>
            </div>`;
        });
        grid.innerHTML = html;
    } catch(err) {
        grid.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444; grid-column:1/-1;">${err.message}</div>`;
    }
}

function editToken(id, codcia, ruc, nom, tok1, tok2, tok3) {
    document.getElementById('tokCodCia').value = codcia;
    document.getElementById('tokRuc').value = ruc;
    document.getElementById('tokNomEmpresa').value = nom;
    document.getElementById('tokMisCompras').value = tok1;
    document.getElementById('tokDatosCpe').value = tok2;
    document.getElementById('tokCorpo').value = tok3;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveToken() {
    const codcia = document.getElementById('tokCodCia').value;
    const ruc = document.getElementById('tokRuc').value.trim();
    const nom = document.getElementById('tokNomEmpresa').value.trim();

    if (!codcia || !ruc || !nom) {
        Swal.fire({icon:'warning', title:'Campos Requeridos', text:'Seleccione empresa e ingrese RUC y Nombre'});
        return;
    }

    const payload = {
        codcia,
        num_ruc: ruc,
        nom_empresa: nom,
        token_mis_compras: document.getElementById('tokMisCompras').value.trim() || null,
        token_datos_cpe: document.getElementById('tokDatosCpe').value.trim() || null,
        token_corpo: document.getElementById('tokCorpo').value.trim() || null,
        activo: true
    };

    try {
        Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await fetch('/api/contabilidad/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error al guardar');

        Swal.fire({icon:'success', title:'Token Guardado', text: data.message, timer: 1500, showConfirmButton: false});
        loadTokens();
        // Clear form
        ['tokRuc','tokNomEmpresa','tokMisCompras','tokDatosCpe','tokCorpo'].forEach(id => document.getElementById(id).value = '');
    } catch(err) {
        Swal.fire({icon:'error', title:'Error', text: err.message});
    }
}

async function deleteToken(id) {
    const result = await Swal.fire({
        icon:'warning', title:'Eliminar Token',
        text:'¿Eliminar este token de empresa?',
        showCancelButton: true, confirmButtonColor:'#ef4444', confirmButtonText:'Eliminar', cancelButtonText:'Cancelar'
    });
    if (!result.isConfirmed) return;

    try {
        const res = await fetch(`/api/contabilidad/tokens/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');
        Swal.fire({icon:'success', title:'Eliminado', timer: 1200, showConfirmButton: false});
        loadTokens();
    } catch(err) {
        Swal.fire({icon:'error', title:'Error', text: err.message});
    }
}

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user) return;
    renderUserInfo(user);
    await loadCompanies();

    // Set default period to current month if none saved
    const now = new Date();
    const periodoDef = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Restore state from LocalStorage
    const savedCia = localStorage.getItem('cnt_saved_cia');
    if (savedCia) {
        const el = document.getElementById('cntEmpresa');
        if (el && el.querySelector(`option[value="${savedCia}"]`)) {
            el.value = savedCia;
            currentCodCia = savedCia;
        }
    }
    
    const savedPeriodo = localStorage.getItem('cnt_saved_periodo');
    document.getElementById('syncPeriodo').value = savedPeriodo || periodoDef;
    
    const savedProv = localStorage.getItem('cnt_saved_prov');
    if (savedProv) document.getElementById('comprasFilterProv').value = savedProv;

    // Attach sync events to localStorage
    document.getElementById('cntEmpresa').addEventListener('change', (e) => {
        localStorage.setItem('cnt_saved_cia', e.target.value);
        if(e.target.value) loadCompras();
    });
    document.getElementById('syncPeriodo').addEventListener('change', (e) => {
        localStorage.setItem('cnt_saved_periodo', e.target.value);
    });
    document.getElementById('comprasFilterProv').addEventListener('change', (e) => {
        localStorage.setItem('cnt_saved_prov', e.target.value);
    });

    // Auto load
    if (document.getElementById('cntEmpresa').value && document.getElementById('syncPeriodo').value) {
        loadCompras();
    }
});

// ═══════════════════════════════════════════════════════════
//  ENRIQUECIMIENTO MASIVO XML
// ═══════════════════════════════════════════════════════════
async function enrichBatch() {
    const codcia = document.getElementById('cntEmpresa').value;
    const periodo = document.getElementById('syncPeriodo').value.trim();
    
    if (!codcia || !periodo || periodo.length < 6) {
        Swal.fire({ icon: 'warning', title: 'Atención', text: 'Seleccione empresa y periodo (YYYYMM) para enriquecer.' });
        return;
    }
    
    const conf = await Swal.fire({
        icon: 'question',
        title: 'Enriquecer XML Masivo',
        html: `<p style="font-size:0.9rem; color:#64748b;">Se descargará el XML completo (ítems, detracciones, créditos, docs relacionados) de <b>cada comprobante</b> del periodo <b>${periodo}</b> que aún no tenga XML cacheado.</p>
               <p style="font-size:0.85rem; color:#94a3b8; margin-top:0.5rem;">Esto puede tomar varios minutos dependiendo de la cantidad de registros.</p>`,
        showCancelButton: true,
        confirmButtonText: 'Iniciar Enriquecimiento',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#8b5cf6'
    });
    if (!conf.isConfirmed) return;

    Swal.fire({
        title: 'Enriqueciendo XML...',
        html: '<p style="font-size:0.9rem;">Consultando API para cada comprobante del periodo.<br>Por favor espere...</p>',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/contabilidad/compras/enrich-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ codcia, periodo })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error en enriquecimiento');

        Swal.fire({
            icon: 'success',
            title: 'Enriquecimiento Completado',
            html: `<div style="text-align:left; font-size:0.9rem; padding:0.5rem 0;">
                <p><b>Total registros:</b> ${data.total}</p>
                <p style="color:#10b981;"><b>Enriquecidos:</b> ${data.enriched}</p>
                ${data.errors > 0 ? `<p style="color:#ef4444;"><b>Errores:</b> ${data.errors}</p>` : ''}
            </div>`,
            confirmButtonColor: '#8b5cf6'
        });
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
}
