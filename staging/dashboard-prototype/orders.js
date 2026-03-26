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
    currentLogin = String(user.login || '').trim().toUpperCase();
    const isSuperuser = currentLogin === '71941916JL' || currentLogin.includes('71941916JL');
    const isAdmin = String(user.rol || '').trim().toUpperCase() === 'ADMIN';
    currentRole = String(user.rol || '').trim().toUpperCase();
    if (isSuperuser) currentRole = 'ADMIN';

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

// ─── Global State ────────────
let dtInstance = null;
let currentRole = '';
let currentLogin = '';
let currentAttachmentContext = null; // { codcia, tipooc, nrodoc, docType }

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
            
            // Role-based attachment buttons
            const isLogistics = currentRole === 'LOGISTICA' || currentRole === 'ADMIN';
            const isTreasury = currentRole === 'TESORERIA' || currentRole === 'ADMIN';
            
            const showRecojoBtn = (String(o.tipooc).trim().toUpperCase() === 'M' || String(o.tipooc).trim().toUpperCase() === 'O');
            
            const btnHtml = `<div style="display:flex; gap:0.25rem;">
                <button class="btn-ver-oc" onclick="openReportModal('${codcia}','${o.nrodoc}','${o.tipooc || ''}','${o.anos || year || ''}')" title="Ver Orden">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </button>
                ${showRecojoBtn ? 
                    (o.has_recojo ? `
                    <button class="btn-ver-oc" style="background:var(--success); opacity:0.8; cursor:not-allowed;" title="Solicitud Enviada a Recojo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>` : `
                    <button class="btn-ver-oc" style="background:#0ea5e9;" onclick="openRecojoModal('${codcia}','${o.tipooc}','${o.nrodoc}','${o.anos || year || ''}')" title="Generar Solicitud de Recojo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                            <path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path>
                        </svg>
                    </button>`)
                : ''}
                ${showWarehouseBtn ? `
                <button class="btn-ver-oc" style="background:var(--success);" onclick="openWarehouseModal('${codcia}','${o.nrodoc}')" title="Ver Ingresos a Almacén">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>
                    </svg>
                </button>` : ''}
                ${isLogistics ? `
                <button class="btn-ver-oc" style="${o.has_signed_order ? 'background:#6366f1;' : 'background:#94a3b8; opacity:0.7;'}" onclick="openAttachmentModal('${codcia}','${o.tipooc}','${o.nrodoc}','signed_order')" title="Orden Firmada${o.has_signed_order ? '' : ' (Vacío)'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                        <path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"></path>
                        <polygon points="18 2 22 6 12 16 8 16 8 12 18 2"></polygon>
                    </svg>
                </button>` : ''}
                ${isTreasury ? `
                <button class="btn-ver-oc" style="${o.has_voucher ? 'background:#f59e0b;' : 'background:#94a3b8; opacity:0.7;'}" onclick="openAttachmentModal('${codcia}','${o.tipooc}','${o.nrodoc}','voucher')" title="Voucher de Pago${o.has_voucher ? '' : ' (Vacío)'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                        <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                        <line x1="2" y1="10" x2="22" y2="10"></line>
                    </svg>
                </button>` : ''}
            </div>`;

            return [
                btnHtml,
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
                statusHtml
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
                { extend: 'copy', text: '📋 Copiar', exportOptions: { columns: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] } },
                { extend: 'excel', text: '📊 Excel', title: 'Ordenes_de_Compra', exportOptions: { columns: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] } },
                { extend: 'pdf', text: '📄 PDF', title: 'Órdenes de Compra', orientation: 'landscape', exportOptions: { columns: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] } },
            ],
            columnDefs: [
                { targets: 0, className: 'dt-body-center sticky-col-left', orderable: false, searchable: false },
                { targets: 1, className: 'dt-body-left', render: (d) => `<strong>${d}</strong>` },
                { targets: 6, className: 'dt-body-center' },
                { targets: 7, className: 'dt-body-right', render: (d) => `<strong>${fmtNum(d)}</strong>` },
                { targets: 15, className: 'dt-body-center', orderable: false }
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

// ─── Attachments Logic ─────────────────────────
async function openAttachmentModal(codcia, tipooc, nrodoc, docType) {
    currentAttachmentContext = { codcia, tipooc, nrodoc, docType };
    
    const title = (docType === 'signed_order') ? 'Orden Firmada' : 'Vouchers de Pago';
    document.getElementById('attachmentModalTitle').textContent = title;
    document.getElementById('attachmentOcNro').textContent = nrodoc;
    document.getElementById('attachmentModal').classList.add('active');
    
    loadAttachmentList();
}

function closeAttachmentModal() {
    document.getElementById('attachmentModal').classList.remove('active');
    currentAttachmentContext = null;
    document.getElementById('attachmentFileInput').value = '';
}

async function loadAttachmentList() {
    const listEl = document.getElementById('attachmentList');
    listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.875rem;">Cargando archivos...</div>';
    
    if (!currentAttachmentContext) return;
    const { codcia, tipooc, nrodoc, docType } = currentAttachmentContext;
    
    try {
        const url = `/api/logistics/attachments/list?codcia=${encodeURIComponent(codcia)}&tipooc=${encodeURIComponent(tipooc)}&nrodoc=${encodeURIComponent(nrodoc)}&doc_type=${docType}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al listar adjuntos');
        const files = await res.json();
        
        if (files.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.875rem;">No hay archivos adjuntos para este tipo.</div>';
            return;
        }
        
        let html = '';
        files.forEach(f => {
            const isImg = f.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            const icon = isImg ? `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="color:#10b981;">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>` : `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="color:#ef4444;">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>`;

            html += `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:0.75rem; background:white; border:1px solid var(--border); border-radius:8px;">
                <div style="display:flex; align-items:center; gap:0.75rem; overflow:hidden;">
                    ${icon}
                    <span style="font-size:0.8125rem; font-weight:500; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${f.filename}">${f.filename}</span>
                </div>
                <button onclick="openPreviewModal('${f.url}', '${f.filename}')" class="btn btn-outline" style="padding:0.35rem 0.6rem; font-size:0.75rem; display:flex; align-items:center; gap:0.3rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>
                    </svg>Ver
                </button>
            </div>`;
        });
        listEl.innerHTML = html;
        
    } catch (err) {
        listEl.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--danger); font-size:0.875rem;">${err.message}</div>`;
    }
}

async function handleAttachmentUpload() {
    const fileInput = document.getElementById('attachmentFileInput');
    if (!fileInput.files.length || !currentAttachmentContext) return;
    
    const file = fileInput.files[0];
    const { codcia, tipooc, nrodoc, docType } = currentAttachmentContext;
    
    const formData = new FormData();
    formData.append('codcia', codcia);
    formData.append('tipooc', tipooc);
    formData.append('nrodoc', nrodoc);
    formData.append('doc_type', docType);
    formData.append('file', file);
    
    try {
        Swal.fire({ title: 'Subiendo archivo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        const res = await fetch('/api/logistics/attachments/upload', { 
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Error al subir');
        }
        
        Swal.fire({ icon: 'success', title: '¡Subido!', text: 'El archivo se guardó correctamente.', timer: 1500, showConfirmButton: false });
        fileInput.value = '';
        loadAttachmentList();
        
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
}

// ─── Document Preview Modal ──────────────────────
function openPreviewModal(url, filename) {
    document.getElementById('previewModal').classList.add('active');
    document.getElementById('previewModalTitle').textContent = filename || 'Visualización de Archivo';
    
    const downloadBtn = document.getElementById('previewModalDownloadBtn');
    downloadBtn.href = url;
    downloadBtn.setAttribute('download', filename || 'documento');
    
    const body = document.getElementById('previewModalBody');
    const isImage = url.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) != null;
    const cacheUrl = url + (url.includes('?') ? '&' : '?') + 't=' + new Date().getTime();
    
    if (isImage) {
        body.innerHTML = `<img src="${cacheUrl}" alt="${filename}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:8px;">`;
    } else {
        // Assume PDF or other browser-supported document
        body.innerHTML = `<iframe src="${cacheUrl}#toolbar=0&navpanes=0&view=FitH" frameborder="0" style="width:100%; height:100%; border:none;"></iframe>`;
    }
}

function closePreviewModal() {
    document.getElementById('previewModal').classList.remove('active');
    document.getElementById('previewModalBody').innerHTML = '<div style="color:var(--text-muted);">Cargando previsualización...</div>';
}

// ─── Generar Recojo Logic ─────────────────────────
async function openRecojoModal(codcia, tipooc, nrodoc, year) {
    document.getElementById('recojoModal').classList.add('active');
    document.getElementById('recojoOcNro').textContent = nrodoc;
    
    // Clean form
    document.getElementById('formRecojo').reset();
    document.getElementById('recCodCia').value = codcia;
    document.getElementById('recTipoOc').value = tipooc;
    document.getElementById('recYear').value = year;
    document.getElementById('recojoItemsTbody').innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando detalles...</td></tr>';
    
    try {
        const token = localStorage.getItem('yelave_token');
        let url = `/api/logistics/orders/${encodeURIComponent(nrodoc)}/report?codcia=${encodeURIComponent(codcia)}&tipo_oc=${encodeURIComponent(tipooc)}&year=${encodeURIComponent(year)}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('Error al cargar reporte OC');
        const data = await res.json();
        
        // Init flatpickr for Time Picker (12H)
        flatpickr("#recHora", {
            enableTime: true,
            noCalendar: true,
            dateFormat: "H:i",
            time_24hr: false, // false enables AM/PM
            allowInput: true
        });

        // Populate fields
        document.getElementById('recProveedor').value = data.header.nomaux || '';
        document.getElementById('recOrigen').value = data.header.diraux || '';
        document.getElementById('recDestino').value = data.header.lugent || '';
        document.getElementById('recContacto').value = data.header.contacto || data.header.nomaux || '';
        document.getElementById('recCelular').value = data.header.tlfaux || '';
        document.getElementById('recObservaciones').value = '';
        document.getElementById('recUrlMaps').value = '';
        
        // Populate items
        let html = '';
        data.items.forEach((it, idx) => {
            const pendiente = it.candes - it.cant_ingresada;
            if (pendiente > 0 || (it.candes === 0)) {
                html += `<tr>
                    <td style="text-align:center;"><input type="checkbox" class="chk-recojo-item" data-codmat="${it.codmat || ''}" data-desc="${it.desmat || ''}" data-unidad="${it.undstk || ''}"></td>
                    <td style="font-size:0.75rem; font-family:monospace;">${it.codmat || '-'}</td>
                    <td style="font-size:0.75rem;">${it.desmat || ''}</td>
                    <td style="text-align:center; font-size:0.75rem;">${it.undstk || ''}</td>
                    <td style="text-align:right;">${fmtNum(pendiente, 2)}</td>
                    <td style="text-align:right;"><input type="number" step="0.01" class="recojo-qty" value="${pendiente}" max="${pendiente}" min="0.01" style="width:70px; padding:0.15rem 0.35rem; font-size:0.75rem;"></td>
                </tr>`;
            }
        });
        if (html === '') html = '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No hay ítems pendientes de recoger.</td></tr>';
        document.getElementById('recojoItemsTbody').innerHTML = html;
        
    } catch (err) {
        document.getElementById('recojoItemsTbody').innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">${err.message}</td></tr>`;
    }
}

function closeRecojoModal() {
    document.getElementById('recojoModal').classList.remove('active');
}

function toggleAllRecojo() {
    const isChecked = document.getElementById('chkAllRecojo').checked;
    document.querySelectorAll('.chk-recojo-item').forEach(chk => chk.checked = isChecked);
}

async function submitSolicitudRecojo() {
    const form = document.getElementById('formRecojo');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const itemsSelected = [];
    document.querySelectorAll('.chk-recojo-item').forEach(chk => {
        if (chk.checked) {
            const tr = chk.closest('tr');
            const qtyInput = tr.querySelector('.recojo-qty');
            itemsSelected.push({
                codmat: chk.dataset.codmat,
                descripcion: chk.dataset.desc,
                cantidad: parseFloat(qtyInput.value),
                unidad: chk.dataset.unidad
            });
        }
    });
    
    if (itemsSelected.length === 0) {
        Swal.fire({icon: 'warning', title: 'Atención', text: 'Seleccione al menos un ítem para recoger'});
        return;
    }
    
    const payload = {
        tipo: 'OC',
        codcia: document.getElementById('recCodCia').value,
        nro_oc: document.getElementById('recojoOcNro').textContent,
        fecha_recojo: document.getElementById('recFecha').value,
        hora_recojo: document.getElementById('recHora').value,
        origen: document.getElementById('recOrigen').value,
        destino: document.getElementById('recDestino').value,
        contacto: document.getElementById('recContacto').value,
        responsable: document.getElementById('userNameDisplay').textContent,
        proveedor_nombre: document.getElementById('recProveedor').value,
        celular_contacto: document.getElementById('recCelular').value,
        observaciones: document.getElementById('recObservaciones').value,
        url_maps: document.getElementById('recUrlMaps').value,
        items: itemsSelected
    };
    
    try {
        Swal.fire({ title: 'Generando Solicitud...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await fetch('/api/reparto/solicitudes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error al generar solicitud');
        
        Swal.fire({ icon: 'success', title: '¡Solicitud Creada!', html: `La solicitud de recojo se ha registrado exitosamente.<br><br><span style="font-size:1.1rem; color:var(--primary);"><b>N° de Solicitud: SR-${data.solicitud_id}</b></span>` });
        closeRecojoModal();
        loadOrders(); // Reload orders to update the button status
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
}
