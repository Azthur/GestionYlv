// ─── Auth Guard & Session ────────────
function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) { window.location.href = 'login.html'; return null; }
    try { 
        const user = JSON.parse(localStorage.getItem('yelave_user')); 
        if (!user) throw new Error('No user data');
        return user;
    }
    catch (e) { window.location.href = 'login.html'; return null; }
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
const formatCurrency = (val, sym = 'S/') => (val === null || val === undefined) ? '-' : `${sym} ${fmtNum(val)}`;

const TIPO_OC_MAP = { 'O': 'Nacional', 'S': 'Exterior', 'T': 'Contable', 'M': 'Mercadería' };
const formatTipo = (t) => TIPO_OC_MAP[t] || t || '-';

const formatStatus = (status) => {
    if (!status) return '<span class="badge pending">Pendiente</span>';
    const s = status.trim().toUpperCase();
    if (s === 'A') return '<span class="badge approved">Aprobado</span>';
    if (s === 'X') return '<span class="badge canceled">Anulado</span>';
    if (s === '1') return '<span class="badge approved">Cerrada</span>';
    if (s === 'E') return '<span class="badge canceled">Eliminado</span>';
    return `<span class="badge pending">${s}</span>`;
};

// ─── DataTable Instance ──────
let dtInstance = null;

// ─── Load Companies ──────────
async function loadCompanies() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/logistics/companies', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const companies = await res.json();
        const sel = document.getElementById('filterCia');
        sel.innerHTML = '<option value="" disabled selected>Selecciona Empresa...</option>';
        companies.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.codcia; opt.textContent = `${c.codcia} - ${c.nomcia}`;
            sel.appendChild(opt);
        });
    } catch (e) {
        document.getElementById('filterCia').innerHTML = '<option value="" disabled>Error cargando</option>';
    }
}

// ─── Load Orders into DataTable ──────
async function loadOrders() {
    const codcia = document.getElementById('filterCia').value;
    const year = document.getElementById('filterYear').value;
    const period = document.getElementById('filterPeriod').value;
    const tipoOc = document.getElementById('filterType').value;
    if (!codcia) { alert('Seleccione una empresa primero.'); return; }

    // Show table wrapper and hide initial message
    document.getElementById('initialMessage').style.display = 'none';
    document.getElementById('tableWrapper').style.display = 'block';

    // Destroy existing DataTable if any
    if (dtInstance) { dtInstance.destroy(); dtInstance = null; }
    $('#ordersTable tbody').html('<tr><td colspan="9" style="text-align:center;padding:2rem;color:#94a3b8;">Buscando órdenes...</td></tr>');

    try {
        let url = `/api/logistics/orders?codcia=${encodeURIComponent(codcia)}`;
        if (year) url += `&year=${year}`;
        if (period) url += `&period=${period}`;
        if (tipoOc) url += `&tipo_oc=${tipoOc}`;

        const token = localStorage.getItem('yelave_token');
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) {
            if (res.status === 401) { logout(); return; }
            if (res.status === 403) { window.location.href = 'index.html'; return; }
            throw new Error('Error al obtener datos');
        }
        const orders = await res.json();

        // Build DataTable data array
        const dtData = orders.map(o => {
            const mon = String(o.moneda || '1').trim();
            const sym = (mon === '2') ? 'USD' : 'S/';
            const total = parseFloat(o.total) || 0;
            const tipoLabel = formatTipo(o.tipooc);
            const statusHtml = formatStatus(o.estado);
            
            // Only show Warehouse button if Type is 'M' (Mercadería)
            const showWarehouseBtn = String(o.tipooc).trim().toUpperCase() === 'M';
            
            const btnHtml = `<div style="display:flex; gap:0.25rem;">
                <button class="btn-ver-oc" onclick="openReportModal('${codcia}','${o.nrodoc}','${o.tipooc || ''}','${o.anos || year || ''}')" title="Ver Orden">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </button>
                ${showWarehouseBtn ? `
                <button class="btn-ver-oc" style="background:var(--success);" onclick="openWarehouseModal('${codcia}','${o.nrodoc}')" title="Ver Ingresos a Almacén">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>
                    </svg>
                </button>` : ''}
            </div>`;

            return [
                o.nrodoc || '',
                o.fchdoc || '',
                tipoLabel,
                (o.proveedor || '').substring(0, 50),
                o.ruc || '',
                sym,
                total,
                (o.lugent || '').substring(0, 25),
                o.entrega || '',
                o.contacto || '',
                o.tlfaux || '',
                (o.nomdep || '').substring(0, 20),
                (o.nomcom || '').substring(0, 20),
                o.usuario || '',
                statusHtml,
                btnHtml
            ];
        });

        // Initialize DataTable
        dtInstance = $('#ordersTable').DataTable({
            data: dtData,
            destroy: true,
            order: [[1, 'desc'], [0, 'desc']],
            pageLength: 25,
            scrollX: true,
            language: {
                search: 'Buscar:',
                lengthMenu: 'Mostrar _MENU_ registros',
                info: 'Mostrando _START_ a _END_ de _TOTAL_ órdenes',
                infoEmpty: 'Sin registros',
                infoFiltered: '(filtrado de _MAX_ total)',
                zeroRecords: 'No se encontraron órdenes',
                paginate: { first: '«', previous: '‹', next: '›', last: '»' },
                buttons: { copy: 'Copiar', excel: 'Excel', pdf: 'PDF', print: 'Imprimir' }
            },
            dom: '<"dt-top"Bfl>rt<"dt-bottom"ip>',
            buttons: [
                { extend: 'copy', text: '📋 Copiar', exportOptions: { columns: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14] } },
                { extend: 'excel', text: '📊 Excel', title: 'Ordenes_de_Compra', exportOptions: { columns: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14] } },
                { extend: 'pdf', text: '📄 PDF', title: 'Órdenes de Compra', orientation: 'landscape', exportOptions: { columns: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14] } },
            ],
            columnDefs: [
                { targets: 0, className: 'dt-body-left', render: (d) => `<strong>${d}</strong>` },
                { targets: 5, className: 'dt-body-center' },
                { targets: 6, className: 'dt-body-right', render: (d) => `<strong>${fmtNum(d)}</strong>` },
                { targets: 14, className: 'dt-body-center', orderable: false },
                { targets: 15, className: 'dt-body-center', orderable: false, searchable: false },
            ]
        });

    } catch (err) {
        $('#ordersTable tbody').html(`<tr><td colspan="9" style="text-align:center;padding:2rem;color:#ef4444;">${err.message}</td></tr>`);
    }
}

// ─── Report Modal ─────────────────────────
async function openReportModal(codcia, nrodoc, tipooc, year) {
    document.getElementById('reportOcNro').textContent = `N° ${nrodoc}`;
    document.getElementById('reportModal').classList.add('active');
    const container = document.getElementById('reportContent');
    container.innerHTML = '<div style="text-align:center;padding:3rem;color:#94a3b8;">Cargando reporte...</div>';

    try {
        const token = localStorage.getItem('yelave_token');
        let url = `/api/logistics/orders/${encodeURIComponent(nrodoc)}/report?codcia=${encodeURIComponent(codcia)}&tipo_oc=${encodeURIComponent(tipooc)}`;
        if (year) url += `&year=${encodeURIComponent(year)}`;

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Error al cargar reporte');
        }
        const data = await res.json();
        renderReport(data);
    } catch (err) {
        container.innerHTML = `<div style="text-align:center;padding:3rem;color:#ef4444;font-weight:500;">❌ ${err.message}</div>`;
    }
}

function renderReport(data) {
    const { company, header, items } = data;
    const sym = header.codmon || 'S/';
    let html = '';

    // ── Header Band ──
    const orderStatusColor = (header.estado_ingreso && header.estado_ingreso.includes('Completo')) ? 'var(--success)' : (header.estado_ingreso === 'Parcial' ? 'var(--warning)' : 'var(--text-sidebar)');
    
    html += `
    <div class="report-header-band">
        <div class="report-company-info">
            <h2>${company.nomcia || 'EMPRESA'}</h2>
            <p>${company.dircia || ''}</p>
            <p>RUC: <strong>${company.ruccia || ''}</strong></p>
        </div>
        <div class="report-oc-badge">
            <div class="oc-label" style="display:flex; justify-content:space-between; align-items:center;">
                Orden de Compra N° 
                <span style="background:${orderStatusColor}; color:white; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: 600;">
                    ${header.estado_ingreso || 'Pendiente'}
                </span>
            </div>
            <div class="oc-number">${header.nrodoc}</div>
            <div class="oc-date">${header.fchdoc}</div>
        </div>
    </div>`;

    // ── Supplier Box ──
    html += `
    <div class="report-supplier-box">
        <span class="lbl">Señores :</span><span class="val-full" style="font-weight:600;">${header.nomaux}</span>
        <span class="lbl">Dirección :</span><span class="val-full">${header.diraux}</span>
        <span class="lbl">Atención :</span><span class="val">${header.contacto}</span>
        <span class="lbl">Teléfono :</span><span class="val">${header.tlfaux}</span>
        <span class="lbl">Ruc :</span><span class="val"><strong>${header.rucaux}</strong></span>
        <span class="lbl">Comprador :</span><span class="val">${header.nomcom}</span>
        ${header.fax ? `<span class="lbl">Fax :</span><span class="val">${header.fax}</span>` : ''}
        ${header.nroreq ? `<span class="lbl">N° Req. :</span><span class="val">${header.nroreq}</span>` : ''}
    </div>`;

    // ── Items Table ──
    html += `
    <table class="report-table">
        <thead><tr>
            <th style="width:30px;text-align:center;">N°</th>
            <th style="width:75px;">Código</th>
            <th>Producto</th>
            <th style="width:35px;text-align:center;">Und</th>
            <th style="width:65px;text-align:right;">Cant</th>
            <th style="width:65px;text-align:right;">Recib</th>
            <th style="width:65px;text-align:center;">Estado</th>
            <th style="width:70px;text-align:right;">Precio</th>
            <th style="width:80px;text-align:right;">Total</th>
        </tr></thead><tbody>`;

    if (items.length === 0) {
        html += '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:2rem;">Sin ítems</td></tr>';
    } else {
        items.forEach(it => {
            const rowColor = (it.estado_ingreso === 'Completo') ? 'color: var(--success); font-weight:600;' : (it.estado_ingreso === 'Parcial' ? 'color: var(--warning); font-weight:600;' : 'color:#64748b;');
            html += `<tr>
                <td style="text-align:center;color:#64748b;font-weight:600;">${it.item_display}</td>
                <td style="font-family:monospace;font-size:0.725rem;">${it.codmat}</td>
                <td style="font-weight:500;">${it.desmat}</td>
                <td style="text-align:center;font-size:0.75rem;">${it.undstk}</td>
                <td style="text-align:right;">${fmtNum(it.candes)}</td>
                <td style="text-align:right;font-weight:600;">${fmtNum(it.cant_ingresada)}</td>
                <td style="text-align:center;font-size:0.7rem;${rowColor}">${it.estado_ingreso}</td>
                <td style="text-align:right;">${fmtNum(it.preuni)}</td>
                <td style="text-align:right;font-weight:600;color:var(--primary);">${sym} ${fmtNum(it.imptot)}</td>
            </tr>`;
            if (it.notas && it.notas.length) {
                it.notas.forEach(n => {
                    html += `<tr class="note-row"><td></td><td></td><td colspan="7" style="padding-left:1.5rem;"><span style="color:#94a3b8;">↳</span> ${n}</td></tr>`;
                });
            }
        });
    }
    html += '</tbody></table>';

    // ── Totals ──
    html += `
    <div class="report-totals-box">
        <table>
            <tr><td style="text-align:right;color:#64748b;font-weight:500;">Sub Total :</td>
                <td style="text-align:center;width:40px;color:#64748b;">${sym}</td>
                <td style="text-align:right;min-width:100px;">${fmtNum(header.impnet)}</td></tr>
            <tr><td style="text-align:right;color:#64748b;">IGV ${fmtNum(header.porigv, 2)}% :</td>
                <td style="text-align:center;color:#64748b;">${sym}</td>
                <td style="text-align:right;">${fmtNum(header.impigv)}</td></tr>
            <tr class="row-total"><td style="text-align:right;color:#1e3a5f;">Total General</td>
                <td style="text-align:center;color:#1e3a5f;">${sym}</td>
                <td style="text-align:right;color:#1e3a5f;">${fmtNum(header.imptot)}</td></tr>
        </table>
    </div>`;

    // ── Footer Info ──
    html += '<dl class="report-footer-dl">';
    if (header.glodoc) html += `<dt>Nota :</dt><dd>${header.glodoc}</dd>`;
    if (header.tmpent) html += `<dt>Tiempo Entrega :</dt><dd>${header.tmpent}</dd>`;
    if (header.entrega) html += `<dt>Entrega :</dt><dd>${header.entrega}</dd>`;
    if (header.lugent) html += `<dt>Lugar Entrega :</dt><dd>${header.lugent}</dd>`;
    if (header.despag) html += `<dt>Cond. de Pago :</dt><dd><strong>${header.despag}</strong></dd>`;
    html += '</dl>';

    // ── Disclaimer ──
    html += `<div class="report-disclaimer">
        A la entrega de la mercadería dejar copia o fotostática de la guía de remisión.<br>
        En la oficina se recepcionará facturas adjuntando guía y o/c.
    </div>`;

    // ── Signatures ──
    html += `<div class="report-signatures">
        <div class="sig-block"><div class="sig-line">Gerente de Logística</div></div>
        <div class="sig-block"><div class="sig-line">Sub. Ger. Logística</div></div>
        <div class="sig-block"><div class="sig-line">Comprador</div></div>
    </div>`;

    document.getElementById('reportContent').innerHTML = html;
}

function closeReportModal() { document.getElementById('reportModal').classList.remove('active'); }
function printReport() { window.print(); }

// ─── Warehouse Modal ─────────────────────────
async function openWarehouseModal(codcia, nrodoc) {
    document.getElementById('warehouseOcNro').textContent = nrodoc;
    document.getElementById('warehouseModal').classList.add('active');
    const tbody = document.getElementById('warehouse-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading-state">Consultando ingresos a almacén...</td></tr>';

    try {
        const token = localStorage.getItem('yelave_token');
        const url = `/api/logistics/orders/${encodeURIComponent(nrodoc)}/warehouse-entry?codcia=${encodeURIComponent(codcia)}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        
        if (!res.ok) throw new Error('Error al obtener ingresos a almacén');
        const entries = await res.json();
        
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:2rem;">No hay ingresos a almacén registrados para esta OC.</td></tr>';
            return;
        }

        let html = '';
        entries.forEach(e => {
            html += `<tr>
                <td style="font-weight:600; text-align:center;">${e.nro_ingreso}</td>
                <td>${e.fecha_ingreso || '-'}</td>
                <td style="text-align:center;"><span class="badge pending">${e.almacen}</span></td>
                <td style="text-align:center;">${e.tipo_movimiento}</td>
                <td style="font-family:monospace; font-size:0.75rem;">${e.codigo_material}</td>
                <td style="font-weight:500;">${e.descripcion}</td>
                <td style="text-align:right; font-weight:600; color:var(--primary);">${fmtNum(e.cantidad_ingresada, 4)}</td>
            </tr>`;
        });
        tbody.innerHTML = html;

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--danger);">${err.message}</td></tr>`;
    }
}

function closeWarehouseModal() { document.getElementById('warehouseModal').classList.remove('active'); }

// ─── Init ────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const user = checkAuth();
    if (!user) return;
    renderUserInfo(user);
    loadCompanies();

    // Role-based restrictions for Logística
    if (user.rol === 'LOGISTICA') {
        const filterType = document.getElementById('filterType');
        if (filterType) {
            // Remove option 7 as requested
            for (let i = 0; i < filterType.options.length; i++) {
                if (filterType.options[i].value === '7') {
                    filterType.options[i].remove();
                    break;
                }
            }
        }
    }
});
