// ─── Global State ────────────
let dtInstance = null;
let currentRole = '';
let currentLogin = '';
let currentAttachmentContext = null; // { codcia, tipooc, nrodoc, docType }

// ─── Session Init (sidebar.js handles UI, auth-guard.js handles auth) ────────
(function initSession() {
    try {
        const user = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        const login = String(user.login || '').trim().toUpperCase();
        const isSuperuser = login === '71941916JL';
        currentLogin = login;
        currentRole = isSuperuser ? 'ADMIN' : String(user.rol || '').trim().toUpperCase();
    } catch(e) {
        currentLogin = '';
        currentRole = '';
    }
})();

// ─── Format Utils ────────────
const fmtNum = (val, dec = 2) => {
    if (val === null || val === undefined || isNaN(val)) return '0.00';
    return parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const formatCurrency = (val, sym = 'S/') => (val === null || val === undefined) ? '-' : `${sym} ${fmtNum(val)}`;

const TIPO_OC_MAP = { 'M': 'Mercadería', 'S': 'Servicios', 'T': 'Contable' };
const formatTipo = (t) => TIPO_OC_MAP[t] || t || '-';

function formatStatus(status) {
    const s = String(status || '').trim().toUpperCase();
    let watermark = '';
    let badge = '';

    if (s === 'X' || s === 'E' || s === 'ELIMINADO' || s === 'ANULADO') {
        watermark = '<div class="watermark-text wm-anulado">ANULADO</div>';
        badge = '<span class="badge canceled"><i class="fas fa-times-circle"></i> ANULADO</span>';
    } else if (s === '1' || s === 'C' || s === 'CERRADA' || s === 'COMPLETO') {
        watermark = '<div class="watermark-text wm-completo">COMPLETO</div>';
        badge = '<span class="badge approved"><i class="fas fa-check-double"></i> CERRADA</span>';
    } else if (s === 'A' || s === 'APROBADA') {
        badge = '<span class="badge approved"><i class="fas fa-check-circle"></i> APROBADA</span>';
    } else {
        badge = '<span class="badge pending"><i class="fas fa-clock"></i> PENDIENTE</span>';
    }
    
    return { watermark, badge };
}


async function loadCompanies() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/permisos/empresas/me', { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (!res.ok) throw new Error();
        const companies = await res.json();
        const sel = document.getElementById('filterCia');
        sel.innerHTML = '<option value="" disabled selected>Selecciona Empresa...</option>';
        companies.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.codcia; opt.textContent = `${c.codcia} - ${c.nomcia}`;
            sel.appendChild(opt);
        });
        // Default from session or first available
        const cu = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        if (cu.codcia) sel.value = cu.codcia;
        else if (companies.length > 0) sel.value = companies[0].codcia;
    } catch (e) {
        document.getElementById('filterCia').innerHTML = '<option value="" disabled>Sin acceso a empresas</option>';
    }
}

// ─── Load Orders into DataTable ──────
async function loadOrders() {
    const cia = document.getElementById('filterCia').value;
    if (!cia) {
        Swal.fire('Atención', 'Seleccione una empresa primero', 'warning');
        return;
    }

    try {
        const year = document.getElementById('filterYear').value;
        const period = document.getElementById('filterPeriod').value;
        const type = document.getElementById('filterType').value;

        // Show loading state
        $('#tableWrapper').show();
        $('#initialMessage').hide();
        
        const params = new URLSearchParams({ codcia: cia });
        if (year) params.append('year', year);
        if (period) params.append('period', period);
        if (type) params.append('tipo_oc', type);

        const res = await fetch(`/api/logistics/orders?${params.toString()}`);
        if (!res.ok) throw new Error('Error al cargar órdenes');
        const orders = await res.json();

        if (dtInstance) {
            dtInstance.destroy();
        }

        // Build DataTable data array
        const dtData = orders.map(o => {
            const statusInfo = formatStatus(o.estado);
            const mon = String(o.moneda || '1').trim();
            const sym = (mon === '2') ? 'USD' : 'S/';
            const total = parseFloat(o.total) || 0;
            const tipoLabel = formatTipo(o.tipooc);
            
            // Build actions dropdown
            const isLogistics = currentRole === 'LOGISTICA' || currentRole === 'ADMIN';
            const isTreasury = currentRole === 'TESORERIA' || currentRole === 'ADMIN';
            const showWarehouseBtn = String(o.tipooc).trim().toUpperCase() === 'M';

            const btnHtml = `<div class="action-dropdown">
                <button class="action-dropdown-btn" onclick="toggleDropdown(event, this)" title="Acciones">⋮</button>
                <div class="action-dropdown-menu">
                    <button class="action-dropdown-item" onclick="openReportModal('${cia}','${o.nrodoc}','${o.tipooc || ''}','${o.anos || year || ''}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        Orden de Compra (Imprimir)
                    </button>
                    ${showWarehouseBtn ? `
                    <button class="action-dropdown-item" onclick="openWarehouseModal('${cia}','${o.nrodoc}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                        Ingresos Almacén
                    </button>` : ''}
                    <button class="action-dropdown-item" onclick="openTrazaModal('${cia}','${o.nrodoc}','${o.tipooc}','${o.anos}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                        Trazabilidad OC
                    </button>
                    <div class="action-dropdown-divider"></div>
                    ${isLogistics ? `
                    <button class="action-dropdown-item" onclick="openAttachmentModal('${cia}','${o.tipooc}','${o.nrodoc}','signed_order')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"></path><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"></polygon></svg>
                        Orden Firmada
                    </button>` : ''}
                    ${isTreasury ? `
                    <button class="action-dropdown-item" onclick="openAttachmentModal('${cia}','${o.tipooc}','${o.nrodoc}','voucher')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                        Voucher de Pago
                    </button>` : ''}
                </div>
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
                statusInfo.badge,
                statusInfo.watermark, // Hidden col 16
                o.tipooc || ''        // Hidden col 17
            ];
        });

        // Initialize DataTable
        dtInstance = $('#ordersTable').DataTable({
            data: dtData,
            destroy: true,
            order: [[1, 'desc']],
            pageLength: 25,
            scrollX: true,
            language: {
                search: 'Buscar:',
                lengthMenu: 'Mostrar _MENU_ registros',
                info: 'Mostrando _START_ a _END_ de _TOTAL_ órdenes',
                paginate: { first: '«', previous: '‹', next: '›', last: '»' }
            },
            createdRow: function(row, data, dataIndex) {
                // Add type coloring
                const t = String(data[17] || '').trim().toUpperCase();
                if (t === 'S') $(row).addClass('oc-type-s');
                else if (t === 'T') $(row).addClass('oc-type-t');
                else $(row).addClass('oc-type-m');
            },
            columnDefs: [
                { targets: 0, className: 'dt-body-center sticky-col-left', orderable: false },
                { targets: 7, className: 'dt-body-right', render: (d) => `<strong>${fmtNum(d)}</strong>` },
                { targets: [16, 17], visible: false } // Hide helper columns
            ]
        });

    } catch (err) {
        $('#ordersTable tbody').html(`<tr><td colspan="18" style="text-align:center;padding:2rem;color:#ef4444;">${err.message}</td></tr>`);
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

    // ── Watermark inside Report ──
    const statusInfo = formatStatus(header.flgest || header.estado);
    if (statusInfo.watermark) {
        html += `<div style="position:absolute; top:40%; left:50%; transform:translate(-50%, -50%); z-index:0; pointer-events:none; opacity:0.15; width:100%; text-align:center;">
                    ${statusInfo.watermark.replace('position: absolute;', '')}
                 </div>`;
    }

    // ── Header Band ──
    const orderStatusColor = (header.estado_ingreso && header.estado_ingreso.includes('Completo')) ? 'var(--success)' : (header.estado_ingreso === 'Parcial' ? 'var(--warning)' : 'var(--text-sidebar)');
    
    let reportTitle = 'ORDEN DE COMPRA';
    let reportBg = '#1e3a5f'; // Default blue
    const t = String(header.tipooc || '').trim().toUpperCase();
    if (t === 'S') { reportTitle = 'ORDEN DE SERVICIOS'; reportBg = '#16a34a'; }
    if (t === 'T') { reportTitle = 'ORDEN CONTABLE'; reportBg = '#8b5cf6'; }

    html += `
    <div class="report-header-band" style="position:relative; z-index:1;">
        <div class="report-company-info">
            <h2>${company.nomcia || 'EMPRESA'}</h2>
            <p>${company.dircia || ''}</p>
            <p>RUC: <strong>${company.ruccia || ''}</strong></p>
        </div>
        <div class="report-oc-badge" style="background:${reportBg} !important;">
            <div class="oc-label" style="display:flex; justify-content:space-between; align-items:center;">
                ${reportTitle} N° 
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
    <div class="report-supplier-box" style="position:relative; z-index:1;">
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
    const isGoods = (t === 'M');
    const colCantLabel = isGoods ? 'Cant' : 'Cantidad';
    const statusColLabel = isGoods ? 'Recibido' : 'Facturado';

    html += `
    <table class="report-table" style="position:relative; z-index:1;">
        <thead><tr>
            <th style="width:30px;text-align:center;">N°</th>
            <th style="width:75px;">Código</th>
            <th>Producto / Servicio</th>
            <th style="width:35px;text-align:center;">Und</th>
            <th style="width:65px;text-align:right;">${colCantLabel}</th>
            <th style="width:65px;text-align:right;">${statusColLabel}</th>
            <th style="width:65px;text-align:center;">Estado</th>
            <th style="width:70px;text-align:right;">Precio</th>
            <th style="width:80px;text-align:right;">Total</th>
        </tr></thead><tbody>`;

    if (items.length === 0) {
        html += '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:2rem;">Sin ítems</td></tr>';
    } else {
        items.forEach(it => {
            const rowColor = (it.estado_ingreso === 'Completo') ? 'color: var(--success); font-weight:600;' : (it.estado_ingreso === 'Parcial' ? 'color: var(--warning); font-weight:600;' : 'color:#64748b;');
            const compareQty = isGoods ? it.cant_ingresada : it.cant_facturada;

            html += `<tr>
                <td style="text-align:center;color:#64748b;font-weight:600;">${it.item_display}</td>
                <td style="font-family:monospace;font-size:0.725rem;">${it.codmat}</td>
                <td style="font-weight:500;">${it.desmat}</td>
                <td style="text-align:center;font-size:0.75rem;">${it.undstk}</td>
                <td style="text-align:right;">${fmtNum(it.candes)}</td>
                <td style="text-align:right;font-weight:600;">${fmtNum(compareQty)}</td>
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

// ─── Warehouse Modal (Voucher estilo Crystal Report) ─────────────────────────
async function openWarehouseModal(codcia, nrodoc) {
    document.getElementById('warehouseOcNro').textContent = nrodoc;
    document.getElementById('warehouseModal').classList.add('active');
    const tbody = document.getElementById('warehouse-tbody');
    // Use the modal body directly for a richer layout
    const modalBody = tbody.closest('.modal-body');
    modalBody.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted);">Consultando ingresos a almacén...</div>';

    try {
        const token = localStorage.getItem('yelave_token');
        const url = `/api/logistics/orders/${encodeURIComponent(nrodoc)}/warehouse-entry?codcia=${encodeURIComponent(codcia)}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        
        if (!res.ok) throw new Error('Error al obtener ingresos a almacén');
        const data = await res.json();
        
        if (!data.vouchers || data.vouchers.length === 0) {
            modalBody.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted);">No hay ingresos a almacén registrados para esta OC.</div>';
            return;
        }

        let html = '';
        const co = data.company;

        data.vouchers.forEach((v, idx) => {
            const h = v.header;
            const isAnulado = h.estado && h.estado.trim().toUpperCase() === 'A';

            html += `<div id="warehouseVoucher${idx}" style="padding:2rem; background:#fff; font-family:'Inter',Arial,sans-serif; color:#1a1a1a; font-size:0.8125rem; ${idx > 0 ? 'margin-top:1.5rem; border-top:3px dashed #cbd5e1; padding-top:2rem;' : ''}">`;

            // ── Header Band ──
            html += `
            <div class="report-header-band">
                <div class="report-company-info">
                    <h2>${co.nomcia || 'EMPRESA'}</h2>
                    <p>${co.dircia || ''}</p>
                </div>
                <div class="report-oc-badge">
                    <div class="oc-label">Documento N°</div>
                    <div class="oc-number">${h.nrodoc}</div>
                    <div class="oc-date">${h.fchdoc}</div>
                </div>
            </div>`;

            // ── Info Box ──
            html += `
            <div style="font-size:0.8rem; margin-bottom:1rem;">
                <div style="display:flex; gap:2rem; margin-bottom:0.5rem;">
                    <div><strong>${h.almacen}</strong> &nbsp; ${h.des_almacen}</div>
                </div>
            </div>
            <div class="report-supplier-box">
                <span class="lbl">Movimiento :</span><span class="val">${h.tipmov} &nbsp; ${h.codmov} &nbsp; ${h.des_movimiento}</span>
                <span class="lbl">Documento :</span><span class="val"><strong>${h.nrodoc}</strong></span>
                ${h.proveedor ? `<span class="lbl">Proveedor :</span><span class="val">${h.ruc_proveedor} &nbsp; ${h.proveedor}</span>` : ''}
                <span class="lbl">Moneda :</span><span class="val">${h.moneda}</span>
                <span class="lbl">T.Cambio :</span><span class="val">${fmtNum(h.tipo_cambio, 4)}</span>
                <span class="lbl">Fecha :</span><span class="val">${h.fchdoc}</span>
                <span class="lbl">USUARIO :</span><span class="val"><strong>${h.usuario}</strong></span>
                ${h.ordcmp ? `<span class="lbl">O. Compra :</span><span class="val">${h.ordcmp}</span>` : ''}
            </div>`;

            // Referencias
            if (h.referencias && h.referencias.length > 0) {
                html += `<div style="font-size:0.775rem; padding:0.5rem 1rem; background:#f0f4ff; border:1px solid #c7d2fe; border-radius:6px; margin-bottom:0.75rem;">
                    <strong>Documentos de Referencia:</strong><br>`;
                h.referencias.forEach(r => { html += `<span style="margin-right:1.5rem;">${r}</span>`; });
                html += `</div>`;
            }

            // Observacion
            if (h.observacion) {
                html += `<div style="font-size:0.775rem; margin-bottom:0.75rem;"><strong>Observación:</strong> ${h.observacion}</div>`;
            }

            // Anulado banner
            if (isAnulado) {
                html += `<div style="text-align:center; padding:0.75rem; background:#fee2e2; border:2px solid #ef4444; border-radius:8px; margin-bottom:1rem; font-weight:700; color:#991b1b; font-size:1rem;">** A N U L A D O **</div>`;
            }

            // ── Items Table ──
            html += `
            <table class="report-table">
                <thead><tr>
                    <th style="width:30px;text-align:center;">Ite</th>
                    <th style="width:80px;">Artículo</th>
                    <th>Descripción</th>
                    <th style="width:45px;text-align:center;">Unidad</th>
                    <th style="width:80px;">NROLOTE</th>
                    <th style="width:75px;">Fch. Vto</th>
                    <th style="width:80px;text-align:right;">Cantidad</th>
                    <th style="width:80px;text-align:right;">Precio</th>
                    <th style="width:90px;text-align:right;">Total</th>
                </tr></thead><tbody>`;

            if (v.items.length === 0) {
                html += '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:1.5rem;">Sin ítems</td></tr>';
            } else {
                v.items.forEach(it => {
                    html += `<tr>
                        <td style="text-align:center;font-weight:600;">${it.nroitm}</td>
                        <td style="font-family:monospace;font-size:0.725rem;">${it.codmat}</td>
                        <td style="font-weight:500;">${it.desmat}</td>
                        <td style="text-align:center;font-size:0.75rem;">${it.undstk}</td>
                        <td style="font-family:monospace;font-size:0.725rem;">${it.nrolote || ''}</td>
                        <td style="font-size:0.75rem;">${it.fchlote || ''}</td>
                        <td style="text-align:right;font-weight:600;">${fmtNum(it.candes, 6)}</td>
                        <td style="text-align:right;">${fmtNum(it.preuni, 6)}</td>
                        <td style="text-align:right;font-weight:600;color:var(--primary);">${fmtNum(it.impcto, 6)}</td>
                    </tr>`;
                });
            }
            html += '</tbody></table>';

            // ── Totals ──
            html += `
            <div class="report-totals-box">
                <table>
                    <tr>
                        <td style="text-align:right;font-weight:700;font-size:0.875rem;padding:0.5rem 1rem;">TOTAL :</td>
                        <td style="text-align:right;min-width:90px;font-weight:600;">${fmtNum(h.total_cantidad, 6)}</td>
                        <td style="text-align:right;min-width:90px;font-weight:600;">${fmtNum(h.total_precio, 6)}</td>
                        <td style="text-align:right;min-width:100px;font-weight:700;color:var(--primary);font-size:0.9rem;">${fmtNum(h.total_importe, 6)}</td>
                    </tr>
                </table>
            </div>`;

            html += '</div>'; // close voucher div
        });

        modalBody.innerHTML = html;

    } catch (err) {
        modalBody.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--danger);">${err.message}</div>`;
    }
}

function closeWarehouseModal() { document.getElementById('warehouseModal').classList.remove('active'); }

function printWarehouseVoucher() {
    const modal = document.getElementById('warehouseModal');
    const content = modal.querySelector('.modal-body');
    if (!content) return;
    const printWin = window.open('', '_blank');
    printWin.document.write(`<!DOCTYPE html><html><head><title>Voucher de Almacén</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Inter', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 12mm; }
            .report-header-band { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:1rem; margin-bottom:1rem; border-bottom:3px solid #1e3a5f; }
            .report-company-info h2 { font-size:1.1rem; font-weight:700; color:#1e3a5f; margin:0 0 0.1rem; }
            .report-company-info p { font-size:0.75rem; color:#6b7280; margin:0; }
            .report-oc-badge { text-align:right; background:#1e3a5f; color:#fff; padding:0.6rem 1rem; border-radius:6px; min-width:160px; }
            .report-oc-badge .oc-label { font-size:0.6rem; text-transform:uppercase; letter-spacing:1px; opacity:0.8; }
            .report-oc-badge .oc-number { font-size:1.4rem; font-weight:700; }
            .report-oc-badge .oc-date { font-size:0.8rem; opacity:0.9; }
            .report-supplier-box { display:grid; grid-template-columns:100px 1fr 100px 1fr; gap:0.2rem 0.4rem; font-size:0.75rem; padding:0.7rem 0.8rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:0.75rem; }
            .report-supplier-box .lbl { font-weight:600; color:#64748b; }
            .report-supplier-box .val { color:#0f172a; }
            .report-table { width:100%; border-collapse:collapse; margin-top:0.25rem; }
            .report-table th { background:#e2e8f0; font-weight:700; font-size:0.65rem; text-transform:uppercase; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; text-align:left; }
            .report-table td { border:1px solid #e2e8f0; padding:0.35rem 0.4rem; font-size:0.75rem; }
            .report-totals-box { display:flex; justify-content:flex-end; margin-top:0.5rem; }
            .report-totals-box td { padding:0.3rem 0.5rem; font-size:0.8rem; }
            @media print { body { margin: 8mm; } }
        </style>
    </head><body>${content.innerHTML}</body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 300);
}

// ─── Init ────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadCompanies();

    // Role-based restrictions for Logística
    const user = JSON.parse(localStorage.getItem('yelave_user') || '{}');
    if (String(user.rol || '').toUpperCase() === 'LOGISTICA') {
        const filterType = document.getElementById('filterType');
        if (filterType) {
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

// ════════════════════════════════════════════════════════════
//  TRAZABILIDAD OC → ALMACÉN → FACTURA
// ════════════════════════════════════════════════════════════

function closeTrazaModal() {
    document.getElementById('trazaModal').classList.remove('active');
}

async function openTrazaModal(codcia, nrodoc, tipooc, anos) {
    document.getElementById('trazaModal').classList.add('active');
    document.getElementById('trazaOcNro').textContent = nrodoc;
    const content = document.getElementById('trazaContent');
    content.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-muted);">Cargando trazabilidad...</div>';

    try {
        let url = `/api/contabilidad/trazabilidad/${encodeURIComponent(nrodoc)}?codcia=${encodeURIComponent(codcia)}`;
        if (tipooc) url += `&tipo_oc=${encodeURIComponent(tipooc)}`;
        if (anos) url += `&year=${encodeURIComponent(anos)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Error cargando trazabilidad');
        const data = await res.json();

        const r = data.resumen;
        const fmtN = (v) => v != null ? parseFloat(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '0.00';

        let html = `
        <div class="traza-summary">
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${r.total_items_oc}</div><div class="tlabel">Items OC</div></div>
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${fmtN(r.total_oc)}</div><div class="tlabel">Cant. Pedida</div></div>
            <div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#22c55e;">${fmtN(r.total_almacen)}</div><div class="tlabel">Cant. Almacén</div></div>
            <div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#8b5cf6;">${fmtN(r.total_facturado)}</div><div class="tlabel">Cant. Facturada</div></div>
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${r.total_facturas}</div><div class="tlabel">Facturas</div></div>
        </div>`;

        // Items Table
        html += `<div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:1rem;">
        <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
            <thead>
                <tr style="background:#f1f5f9;">
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">#</th>
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">Código</th>
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">Descripción</th>
                    <th style="padding:0.6rem 0.5rem; text-align:right; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">Cant. OC</th>
                    <th style="padding:0.6rem 0.5rem; text-align:center; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#22c55e; border-bottom:2px solid #cbd5e1;">Almacén</th>
                    <th style="padding:0.6rem 0.5rem; text-align:center; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#8b5cf6; border-bottom:2px solid #cbd5e1;">Facturado</th>
                </tr>
            </thead><tbody>`;

        if (data.items.length === 0) {
            html += '<tr><td colspan="6" style="text-align:center; padding:2rem; color:#94a3b8;">Sin ítems encontrados en la OC</td></tr>';
        } else {
            data.items.forEach((it, idx) => {
                const almClass = it.pct_almacen >= 100 ? 'complete' : (it.pct_almacen > 0 ? 'partial' : 'pending');
                const facClass = it.pct_facturado >= 100 ? 'complete' : (it.pct_facturado > 0 ? 'partial' : 'pending');

                html += `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:0.5rem; text-align:center; color:#64748b;">${it.nroitm}</td>
                    <td style="padding:0.5rem; font-family:monospace; font-size:0.725rem;">${it.codmat}</td>
                    <td style="padding:0.5rem;">${(it.desmat || '').substring(0, 50)}</td>
                    <td style="padding:0.5rem; text-align:right; font-weight:600;">${fmtN(it.candes)}</td>
                    <td style="padding:0.5rem; text-align:center;">
                        <div style="font-weight:600; ${almClass === 'complete' ? 'color:#22c55e;' : almClass === 'partial' ? 'color:#f59e0b;' : 'color:#94a3b8;'}">${fmtN(it.cant_almacen)} <span style="font-size:0.65rem; font-weight:400;">(${it.pct_almacen}%)</span></div>
                        <div class="traza-bar"><div class="traza-bar-fill ${almClass}" style="width:${Math.min(it.pct_almacen, 100)}%;"></div></div>
                    </td>
                    <td style="padding:0.5rem; text-align:center;">
                        <div style="font-weight:600; ${facClass === 'complete' ? 'color:#8b5cf6;' : facClass === 'partial' ? 'color:#f59e0b;' : 'color:#94a3b8;'}">${fmtN(it.cant_facturada)} <span style="font-size:0.65rem; font-weight:400;">(${it.pct_facturado}%)</span></div>
                        <div class="traza-bar"><div class="traza-bar-fill ${facClass}" style="width:${Math.min(it.pct_facturado, 100)}%;"></div></div>
                    </td>
                </tr>`;
            });
        }
        html += '</tbody></table></div>';

        // Detailed warehouse movements
        if (data.movimientos_almacen && data.movimientos_almacen.length > 0) {
            html += `
            <h5 style="font-size:0.8rem; font-weight:700; margin-top:1.5rem; margin-bottom:0.75rem; color:#334155;">Detalle de Movimientos Almacén</h5>
            <div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:1.5rem;">
            <table style="width:100%; border-collapse:collapse; font-size:0.75rem;">
                <thead>
                    <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                        <th style="padding:0.5rem; text-align:left;">Almacén</th>
                        <th style="padding:0.5rem; text-align:left;">Doc. Referencia</th>
                        <th style="padding:0.5rem; text-align:left;">Fecha</th>
                        <th style="padding:0.5rem; text-align:left;">Material</th>
                        <th style="padding:0.5rem; text-align:right;">Cantidad</th>
                    </tr>
                </thead>
                <tbody>`;
            data.movimientos_almacen.forEach(m => {
                html += `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:0.4rem 0.5rem;">${m.almcen}</td>
                        <td style="padding:0.4rem 0.5rem;"><strong>${m.tipmov}-${m.codmov}-${m.nrodoc}</strong></td>
                        <td style="padding:0.4rem 0.5rem; color:#64748b;">${m.fchdoc}</td>
                        <td style="padding:0.4rem 0.5rem; font-size:0.7rem;">${m.codmat}</td>
                        <td style="padding:0.4rem 0.5rem; text-align:right; font-weight:600;">${fmtN(m.candes)}</td>
                    </tr>`;
            });
            html += '</tbody></table></div>';
        }

        // Linked invoices
        if (data.facturas && data.facturas.length > 0) {
            html += '<h5 style="font-size:0.8rem; font-weight:700; margin-bottom:1rem; color:#334155;">Facturas Vinculadas</h5><div class="traza-factura-list">';
            data.facturas.forEach(f => {
                const facturaUrl = f.Uuid ? `factura_visor.html?uid=${f.Uuid}` : '#';
                html += `
                <div class="traza-factura-card" style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <div style="background:#f0f7ff; color:#2563eb; width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </div>
                        <div>
                            <div style="font-weight:700; color:#1e293b;">${f.Serie || ''}-${f.Numero || ''}</div>
                            <div style="font-size:0.7rem; color:#64748b;">${f.NomProveedor || '-'}</div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; color:#1e293b;">${fmtN(f.Total)} ${f.CodMoneda === '1' ? 'S/' : 'USD'}</div>
                        <div style="display:flex; align-items:center; justify-content:flex-end; gap:0.5rem;">
                            <span style="font-size:0.7rem; color:#64748b;">${f.FecEmision || '-'}</span>
                            ${f.Uuid ? `<a href="${facturaUrl}" target="_blank" class="btn btn-primary" style="padding:0.25rem 0.5rem; font-size:0.65rem; height:auto; text-decoration:none;">Ver PDF</a>` : ''}
                        </div>
                    </div>
                </div>`;
            });
            html += '</div>';
        } else {
            html += '<div style="text-align:center; padding:1.5rem; color:#94a3b8; font-size:0.8rem; background:#f8fafc; border:1px dashed #e2e8f0; border-radius:8px;">No hay facturas vinculadas aún.</div>';
        }

        content.innerHTML = html;
    } catch(err) {
        content.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444; font-weight:500;">❌ Error: ${err.message}</div>`;
    }
}

// ─── Dropdown Toggle & Close ──────────
let _activeDropdownMenu = null;
let _activeDropdownBtn = null;

function toggleDropdown(event, btn) {
    event.stopPropagation();
    
    // If clicking the same button, close it
    if (_activeDropdownBtn === btn && _activeDropdownMenu) {
        _closeActiveDropdown();
        return;
    }
    
    _closeActiveDropdown();

    const menu = btn.nextElementSibling;
    if (!menu) return;
    
    // Clone menu and append to body for proper positioning
    const clone = menu.cloneNode(true);
    clone.style.display = 'block';
    clone.classList.add('show');
    document.body.appendChild(clone);
    
    // Position relative to button
    const rect = btn.getBoundingClientRect();
    const menuH = clone.offsetHeight;
    const menuW = clone.offsetWidth;
    const spaceBelow = window.innerHeight - rect.bottom;
    
    // Vertical: prefer below, fallback above
    if (spaceBelow >= menuH + 8) {
        clone.style.top = (rect.bottom + 4) + 'px';
    } else {
        clone.style.top = Math.max(4, rect.top - menuH - 4) + 'px';
    }
    // Horizontal: align right edge to button right edge
    clone.style.left = Math.max(8, rect.right - menuW) + 'px';
    
    _activeDropdownMenu = clone;
    _activeDropdownBtn = btn;
}

function _closeActiveDropdown() {
    if (_activeDropdownMenu && _activeDropdownMenu.parentNode) {
        _activeDropdownMenu.parentNode.removeChild(_activeDropdownMenu);
    }
    _activeDropdownMenu = null;
    _activeDropdownBtn = null;
}

document.addEventListener('click', function(e) {
    if (_activeDropdownMenu && !_activeDropdownMenu.contains(e.target)) {
        _closeActiveDropdown();
    }
});

document.addEventListener('scroll', function() {
    _closeActiveDropdown();
}, true);

// ─── Auto-Open Modals via URL Params ────────────
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const seek_oc = urlParams.get('seek_oc');
    const seek_oc_report = urlParams.get('seek_oc_report');
    const seek_wh = urlParams.get('seek_warehouse');
    const cia = urlParams.get('cia');

    if (seek_oc_report && cia) {
        setTimeout(() => openReportModal(cia, seek_oc_report, 'O', new Date().getFullYear().toString()), 600);
    } else if (seek_oc && cia) {
        setTimeout(() => openAttachmentModal(cia, 'O', seek_oc, 'signed_order'), 600);
    } else if (seek_wh && cia) {
        setTimeout(() => openWarehouseModal(cia, seek_wh), 600);
    }
});
