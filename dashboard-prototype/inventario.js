// ─── INVENTARIO.JS — Saldos de Inventario ───────────────
const API = '/api';
let dtProd = null, dtAlm = null, dtLote = null;
let catFamilias = [];
let catAlmacenes = [];
let userPerms = [];
let canExport = false;

// ─── Format Utils ───
const fmtN = (v, d=2) => {
    if (v === null || v === undefined || isNaN(v)) return '0.00';
    return parseFloat(v).toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d});
};

// ─── Security Initialization ───
async function initSecurity() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`${API}/permisos/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        
        // Find children of 'inventario'
        const invParent = data.modulos.find(m => m.Codigo === 'inventario');
        if (!invParent) return; // Should not happen if user is here

        userPerms = data.modulos.filter(m => m.ParentId === invParent.Id);
        
        // 1. Hide tabs if not permitted
        const checkTab = (code, tabId) => {
            const p = userPerms.find(m => m.Codigo === code);
            if (!p || !p.PuedeVer) {
                const btn = document.querySelector(`.inv-tab-btn[data-tab="${tabId}"]`);
                if (btn) btn.style.display = 'none';
                return false;
            }
            return true;
        };

        const hasProd = checkTab('inv_tab_prod', 'producto');
        const hasAlm  = checkTab('inv_tab_alm', 'almacen');
        const hasLote = checkTab('inv_tab_lote', 'lote');

        // 2. Export button permission
        const pExport = userPerms.find(m => m.Codigo === 'inv_btn_exc');
        canExport = pExport ? pExport.PuedeVer : false;

        // Auto-switch to first available tab if active is hidden
        const activeTabBtn = document.querySelector('.inv-tab-btn.active');
        if (activeTabBtn && activeTabBtn.style.display === 'none') {
            if (hasProd) switchTab('producto');
            else if (hasAlm) switchTab('almacen');
            else if (hasLote) switchTab('lote');
        }

    } catch(e) { console.error('Error initializing security:', e); }
}

// ─── Company Selector ───
async function loadCompanies() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`${API}/permisos/empresas/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const companies = await res.json();
        const sel = document.getElementById('filterCia');
        sel.innerHTML = '<option value="" disabled selected>Selecciona Empresa...</option>';
        companies.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.codcia; opt.textContent = `${c.codcia} - ${c.nomcia}`;
            sel.appendChild(opt);
        });
        // Default from user session
        const cu = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        sel.value = cu.codcia || (companies.length > 0 ? companies[0].codcia : '');
    } catch(e) { console.error('Error loading companies:', e); }
}

function getCodCia() {
    return document.getElementById('filterCia').value;
}

async function onCompanyChange() {
    await loadFilters();
    // Clear tables when company changes so user is forced to click Consultar
    if (dtProd) dtProd.clear().draw();
    if (dtAlm) dtAlm.clear().draw();
    if (dtLote) dtLote.clear().draw();
    ['kpiProd', 'kpiAlm', 'kpiLote'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

// ─── Load Filters (Almacenes, Familias) ───
async function loadFilters() {
    const codcia = getCodCia();
    if (!codcia) return;
    
    try {
        // Almacenes
        const almRes = await fetch(`${API}/kardex/almacenes?codcia=${codcia}`);
        catAlmacenes = await almRes.json();
        
        // Populate display texts if currently selected or leave as 'Todos'
        ['btnAlmAlm', 'btnAlmLote'].forEach(id => {
            const btn = document.getElementById(id);
            btn.setAttribute('data-val', '');
            btn.textContent = 'Todos';
        });

        // Familias
        const famRes = await fetch(`${API}/kardex/familias?codcia=${codcia}`);
        catFamilias = await famRes.json();
        const btnFam = document.getElementById('btnFamProd');
        btnFam.setAttribute('data-val', '');
        btnFam.textContent = 'Todas';
        
    } catch(e) { console.error('Error loading filters:', e); }
}

// ─── Modal Generico Seleccion ───
let _currentSearchCallback = null;
let _currentSearchData = [];

function openSearchModal(title, data, callback) {
    const modal = document.getElementById('searchModal');
    document.getElementById('searchModalTitle').textContent = title;
    _currentSearchData = data;
    _currentSearchCallback = callback;
    document.getElementById('searchModalInput').value = '';
    renderSearchModalList(data);
    
    modal.style.display = 'flex';
    // Small delay to allow 'display: flex' to register before adding 'active' for transition
    setTimeout(() => modal.classList.add('active'), 10);
    
    setTimeout(() => document.getElementById('searchModalInput').focus(), 100);
}

function closeSearchModal() {
    const modal = document.getElementById('searchModal');
    modal.classList.remove('active');
    // Wait for transition before hiding
    setTimeout(() => {
        if (!modal.classList.contains('active')) {
            modal.style.display = 'none';
        }
    }, 200);
}

function renderSearchModalList(data) {
    const list = document.getElementById('searchModalList');
    list.innerHTML = '';
    
    // "Todos" Option
    const divTodos = document.createElement('div');
    divTodos.style.cssText = 'padding:0.6rem; cursor:pointer; border-bottom:1px solid var(--border); font-size:0.8rem;';
    divTodos.innerHTML = '<strong>[Todos / Todas]</strong>';
    divTodos.onclick = () => selectFromSearchModal('', 'Todos / Todas');
    list.appendChild(divTodos);
    
    // Prevent huge freezes if list is incredibly long
    const limit = Math.min(data.length, 300); 

    for(let i = 0; i < limit; i++) {
        const item = data[i];
        const nom = item.nombre || '';
        const cod = item.codigo || '';
        
        const div = document.createElement('div');
        div.style.cssText = 'padding:0.6rem; cursor:pointer; border-bottom:1px solid var(--border); font-size:0.8rem; display:flex; gap:0.5rem; flex-wrap:wrap;';
        
        const spanCod = document.createElement('span');
        spanCod.className = 'badge pending';
        spanCod.textContent = cod;
        
        const spanNom = document.createElement('span');
        spanNom.textContent = nom;
        
        div.appendChild(spanCod);
        div.appendChild(spanNom);
        
        div.onclick = () => selectFromSearchModal(cod, `${cod} - ${nom}`);
        list.appendChild(div);
    }
}

function selectFromSearchModal(codigo, desc) {
    if (_currentSearchCallback) _currentSearchCallback(codigo, desc);
    closeSearchModal();
}

document.getElementById('searchModalInput')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = _currentSearchData.filter(x => 
        x.codigo.toLowerCase().includes(q) || x.nombre.toLowerCase().includes(q)
    );
    renderSearchModalList(filtered);
});

function openModalFamilia() {
    openSearchModal("Seleccionar Familia", catFamilias, (codigo, desc) => {
        const btn = document.getElementById('btnFamProd');
        btn.setAttribute('data-val', codigo);
        btn.textContent = desc;
        loadProductos();
    });
}

function openModalAlmacen(tabRef) {
    openSearchModal("Seleccionar Almacén", catAlmacenes, (codigo, desc) => {
        const btn = document.getElementById('btnAlm' + tabRef);
        btn.setAttribute('data-val', codigo);
        btn.textContent = desc;
        if(tabRef === 'Alm') loadAlmacenStock();
        if(tabRef === 'Lote') loadLoteStock();
    });
}

// ─── Tab Switching ───
function switchTab(tab) {
    // Security check
    const codes = { 'producto': 'inv_tab_prod', 'almacen': 'inv_tab_alm', 'lote': 'inv_tab_lote' };
    const p = userPerms.find(m => m.Codigo === codes[tab]);
    if (p && !p.PuedeVer) {
        alert('No tiene permiso para acceder a esta pestaña.');
        return;
    }

    document.querySelectorAll('.inv-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.inv-tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelector(`.inv-tab-btn[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
}

// ─── KPI Renderer ───
function renderKPIs(containerId, kpis) {
    const el = document.getElementById(containerId);
    el.innerHTML = kpis.map(k => `
        <div class="inv-kpi ${k.cls || ''}">
            <div class="inv-kpi-label">${k.label}</div>
            <div class="inv-kpi-value">${k.value}</div>
            ${k.sub ? `<div class="inv-kpi-sub">${k.sub}</div>` : ''}
        </div>
    `).join('');
}

// ═══════════════════════════════════════════════════════
//  TAB 1: Saldos por Producto (AlmmMatg)
// ═══════════════════════════════════════════════════════
async function loadProductos() {
    const codcia = getCodCia();
    if (!codcia) return;
    
    const busqueda = document.getElementById('filBuscaProd').value;
    const codfam = document.getElementById('btnFamProd').getAttribute('data-val');
    const soloStock = document.getElementById('chkStockProd').checked;
    
    let url = `${API}/kardex/saldos-producto?codcia=${codcia}&solo_stock=${soloStock}`;
    if (busqueda) url += `&busqueda=${encodeURIComponent(busqueda)}`;
    if (codfam) url += `&codfam=${encodeURIComponent(codfam)}`;
    
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al consultar saldos');
        const data = await res.json();
        
        // KPIs
        const totalItems = data.length;
        const totalStock = data.reduce((s, d) => s + d.stock, 0);
        const totalValMN = data.reduce((s, d) => s + d.valor_mn, 0);
        const totalValUS = data.reduce((s, d) => s + d.valor_us, 0);
        const negativos = data.filter(d => d.stock < 0).length;
        
        renderKPIs('kpiProd', [
            {label: 'Total Items', value: totalItems.toLocaleString()},
            {label: 'Stock Total', value: fmtN(totalStock, 2), sub: 'unidades totales'},
            {label: 'Valor S/', value: `S/ ${fmtN(totalValMN)}`, cls: 'success'},
            {label: 'Valor US$', value: `$ ${fmtN(totalValUS)}`},
            ...(negativos > 0 ? [{label: 'Stock Negativo', value: negativos, cls: 'danger', sub: 'items con stock < 0'}] : []),
        ]);
        
        // DataTable
        if (dtProd) { dtProd.destroy(); dtProd = null; }
        const dtData = data.map(d => [
            d.codmat, d.desmat, d.undstk, d.codfam,
            d.stock, d.valor_mn, d.valor_us,
            d.stk_min, d.stk_max, d.ult_compra, d.ult_salida
        ]);
        
        dtProd = $('#tblProducto').DataTable({
            data: dtData, destroy: true,
            deferRender: true, pageLength: 50, scrollX: true,
            language: { search:'Buscar:', lengthMenu:'Mostrar _MENU_', info:'_START_ a _END_ de _TOTAL_', zeroRecords:'Sin resultados', paginate:{previous:'‹',next:'›'} },
            dom: '<"dt-top"Bfl>rt<"dt-bottom"ip>',
            buttons: canExport ? [
                {extend:'excel', text:'📊 Excel', title:'Saldos_Producto', exportOptions:{columns:':visible'}},
                {extend:'pdf', text:'📄 PDF', title:'Saldos por Producto', orientation:'landscape', exportOptions:{columns:':visible'}},
            ] : [],
            columnDefs: [
                {targets:0, render:d=>`<span style="font-family:monospace;font-size:0.725rem;">${d}</span>`},
                {targets:1, render:d=>`<span style="font-weight:500;">${d}</span>`},
                {targets:4, className:'dt-body-right', render:d=>{
                    const v = parseFloat(d);
                    const color = v < 0 ? 'color:#ef4444;' : v === 0 ? 'color:#94a3b8;' : 'font-weight:700;';
                    return `<span style="${color}">${fmtN(v,4)}</span>`;
                }},
                {targets:5, className:'dt-body-right', render:d=>`<span style="color:var(--primary);">${fmtN(d)}</span>`},
                {targets:6, className:'dt-body-right', render:d=>`<span>${fmtN(d)}</span>`},
                {targets:[7,8], className:'dt-body-right', render:d=>fmtN(d,2)},
            ],
            order: [[0,'asc']]
        });
        
    } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════════
//  TAB 2: Saldos por Almacén (AlmmMate)
// ═══════════════════════════════════════════════════════
async function loadAlmacenStock() {
    const codcia = getCodCia();
    if (!codcia) return;
    
    const almacen = document.getElementById('btnAlmAlm').getAttribute('data-val');
    const busqueda = document.getElementById('filBuscaAlm').value;
    const soloStock = document.getElementById('chkStockAlm').checked;
    
    let url = `${API}/kardex/saldos-almacen?codcia=${codcia}&solo_stock=${soloStock}`;
    if (almacen) url += `&almacen=${encodeURIComponent(almacen)}`;
    if (busqueda) url += `&busqueda=${encodeURIComponent(busqueda)}`;
    
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al consultar saldos por almacén');
        const data = await res.json();
        
        // KPIs
        const totalItems = data.length;
        const almacenes = [...new Set(data.map(d => d.almacen))].length;
        const totalStock = data.reduce((s, d) => s + d.stock, 0);
        const totalValMN = data.reduce((s, d) => s + d.valor_mn, 0);
        
        renderKPIs('kpiAlm', [
            {label: 'Almacenes', value: almacenes},
            {label: 'Total Items', value: totalItems.toLocaleString()},
            {label: 'Stock Total', value: fmtN(totalStock, 2)},
            {label: 'Valor Total S/', value: `S/ ${fmtN(totalValMN)}`, cls: 'success'},
        ]);
        
        // DataTable
        if (dtAlm) { dtAlm.destroy(); dtAlm = null; }
        const dtData = data.map(d => [
            d.almacen, d.des_almacen, d.codmat, d.desmat, d.undstk,
            d.stock, d.valor_mn, d.valor_us, d.fch_ingreso, d.fch_salida
        ]);
        
        dtAlm = $('#tblAlmacen').DataTable({
            data: dtData, destroy: true,
            deferRender: true, pageLength: 50, scrollX: true,
            language: { search:'Buscar:', lengthMenu:'Mostrar _MENU_', info:'_START_ a _END_ de _TOTAL_', zeroRecords:'Sin resultados', paginate:{previous:'‹',next:'›'} },
            dom: '<"dt-top"Bfl>rt<"dt-bottom"ip>',
            buttons: canExport ? [
                {extend:'excel', text:'📊 Excel', title:'Saldos_Almacen', exportOptions:{columns:':visible'}},
                {extend:'pdf', text:'📄 PDF', title:'Saldos por Almacén', orientation:'landscape', exportOptions:{columns:':visible'}},
            ] : [],
            columnDefs: [
                {targets:0, render:d=>`<span class="badge pending" style="font-size:0.7rem;">${d}</span>`},
                {targets:2, render:d=>`<span style="font-family:monospace;font-size:0.725rem;">${d}</span>`},
                {targets:3, render:d=>`<span style="font-weight:500;">${d}</span>`},
                {targets:5, className:'dt-body-right', render:d=>{
                    const v = parseFloat(d);
                    const color = v < 0 ? 'color:#ef4444;' : v === 0 ? 'color:#94a3b8;' : 'font-weight:700;';
                    return `<span style="${color}">${fmtN(v,4)}</span>`;
                }},
                {targets:6, className:'dt-body-right', render:d=>`<span style="color:var(--primary);">${fmtN(d)}</span>`},
                {targets:7, className:'dt-body-right', render:d=>fmtN(d)},
            ],
            order: [[0,'asc'],[2,'asc']]
        });
        
    } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════════
//  TAB 3: Saldos por Lote (AlmAcmLt)
// ═══════════════════════════════════════════════════════
async function loadLoteStock() {
    const codcia = getCodCia();
    if (!codcia) return;
    
    const almacen = document.getElementById('btnAlmLote').getAttribute('data-val');
    const busqueda = document.getElementById('filBuscaLote').value;
    const soloStock = document.getElementById('chkStockLote').checked;
    const proxVencer = document.getElementById('chkVencer').checked;
    
    let url = `${API}/kardex/saldos-lote?codcia=${codcia}&solo_stock=${soloStock}&proximos_vencer=${proxVencer}`;
    if (almacen) url += `&almacen=${encodeURIComponent(almacen)}`;
    if (busqueda) url += `&busqueda=${encodeURIComponent(busqueda)}`;
    
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al consultar saldos por lote');
        const data = await res.json();
        
        // KPIs
        const totalLotes = data.length;
        const totalStock = data.reduce((s, d) => s + d.stock, 0);
        const vencidos = data.filter(d => d.dias_vencer !== null && d.dias_vencer < 0).length;
        const proximos = data.filter(d => d.dias_vencer !== null && d.dias_vencer >= 0 && d.dias_vencer <= 90).length;
        const sinFecha = data.filter(d => !d.fch_vencimiento).length;
        
        renderKPIs('kpiLote', [
            {label: 'Total Lotes', value: totalLotes.toLocaleString()},
            {label: 'Stock Total', value: fmtN(totalStock, 2)},
            {label: 'Próx. a Vencer', value: proximos, cls: 'warning', sub: 'dentro de 90 días'},
            {label: 'Vencidos', value: vencidos, cls: 'danger'},
            ...(sinFecha > 0 ? [{label: 'Sin Fch. Vto', value: sinFecha, sub: 'lotes sin fecha'}] : []),
        ]);
        
        // DataTable
        if (dtLote) { dtLote.destroy(); dtLote = null; }
        const dtData = data.map(d => {
            let estadoBadge = '';
            if (!d.fch_vencimiento) {
                estadoBadge = '<span class="badge-lote ok">N/A</span>';
            } else if (d.dias_vencer < 0) {
                estadoBadge = '<span class="badge-lote expired">VENCIDO</span>';
            } else if (d.dias_vencer <= 30) {
                estadoBadge = '<span class="badge-lote danger">URGENTE</span>';
            } else if (d.dias_vencer <= 90) {
                estadoBadge = '<span class="badge-lote warning">PRÓXIMO</span>';
            } else {
                estadoBadge = '<span class="badge-lote ok">VIGENTE</span>';
            }
            
            return [
                d.almacen, d.codmat, d.desmat, d.undstk,
                d.nrolote, d.fch_vencimiento, 
                d.dias_vencer !== null ? d.dias_vencer : '',
                d.stock, estadoBadge
            ];
        });
        
        dtLote = $('#tblLote').DataTable({
            data: dtData, destroy: true,
            deferRender: true, pageLength: 50, scrollX: true,
            language: { search:'Buscar:', lengthMenu:'Mostrar _MENU_', info:'_START_ a _END_ de _TOTAL_', zeroRecords:'Sin resultados', paginate:{previous:'‹',next:'›'} },
            dom: '<"dt-top"Bfl>rt<"dt-bottom"ip>',
            buttons: canExport ? [
                {extend:'excel', text:'📊 Excel', title:'Saldos_Lote', exportOptions:{columns:[0,1,2,3,4,5,6,7]}},
                {extend:'pdf', text:'📄 PDF', title:'Saldos por Lote', orientation:'landscape', exportOptions:{columns:[0,1,2,3,4,5,6,7]}},
            ] : [],
            columnDefs: [
                {targets:0, render:d=>`<span class="badge pending" style="font-size:0.7rem;">${d}</span>`},
                {targets:1, render:d=>`<span style="font-family:monospace;font-size:0.725rem;">${d}</span>`},
                {targets:2, render:d=>`<span style="font-weight:500;">${d}</span>`},
                {targets:4, render:d=>`<span style="font-family:monospace; font-weight:600; color:var(--primary);">${d}</span>`},
                {targets:6, className:'dt-body-center', render:(d)=>{
                    if (d === '' || d === null) return '-';
                    const v = parseInt(d);
                    const color = v < 0 ? '#ef4444' : v <= 30 ? '#ef4444' : v <= 90 ? '#f59e0b' : '#10b981';
                    return `<span style="font-weight:700; color:${color};">${v}</span>`;
                }},
                {targets:7, className:'dt-body-right', render:d=>{
                    const v = parseFloat(d);
                    const color = v < 0 ? 'color:#ef4444;' : v === 0 ? 'color:#94a3b8;' : 'font-weight:700;';
                    return `<span style="${color}">${fmtN(v,4)}</span>`;
                }},
                {targets:8, className:'dt-body-center', orderable:false},
            ],
            order: [[0,'asc'],[1,'asc'],[4,'asc']]
        });
        
    } catch(e) { console.error(e); }
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
    await initSecurity(); // Load permissions first
    await loadCompanies();
    await loadFilters();
});
