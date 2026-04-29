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
    
    // Default filterPeriod to current month
    window.addEventListener('DOMContentLoaded', () => {
        const pSel = document.getElementById('filterPeriod');
        if (pSel) pSel.value = String(new Date().getMonth() + 1);
    });
})();

// ─── Format Utils ────────────
const fmtNum = (val, dec = 2) => {
    if (val === null || val === undefined || isNaN(val)) return '0.00';
    return parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const formatCurrency = (val, sym = 'S/') => (val === null || val === undefined) ? '-' : `${sym} ${fmtNum(val)}`;

const TIPO_OC_MAP = { 'M': 'Mercadería', 'S': 'Servicios', 'T': 'Contable' };
const formatTipo = (t) => TIPO_OC_MAP[t] || t || '-';

function formatStatus(status, isApproved, tipoOc) {
    const s = String(status || '').trim().toUpperCase();
    const t = String(tipoOc || '').trim().toUpperCase();
    let watermark = '';
    let badge = '';

    if (s === 'E' || s === 'A' || s === 'X' || s === 'E*' || s === 'ANULADO') {
        watermark = '<div class="watermark-text wm-anulado">OC ANULADA</div>';
        badge = '<span class="badge canceled"><i class="fas fa-times-circle"></i> ANULADO</span>';
    } else if (s === 'C') {
        watermark = '<div class="watermark-text wm-completo">CERRADO</div>';
        badge = '<span class="badge approved" style="background:#f0fdf4; color:#16a34a;"><i class="fas fa-check-double"></i> CERRADO</span>';
    } else if (s === 'P') {
        if (isApproved) {
            badge = '<span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0;"><i class="fas fa-check-circle"></i> APROBADO</span>';
        } else {
            badge = '<span class="badge" style="background:#eff6ff; color:#2563eb;"><i class="fas fa-clock"></i> PENDIENTE</span>';
        }
    } else if (s === 'R') {
        badge = '<span class="badge" style="background:#fef3c7; color:#d97706;"><i class="fas fa-file-signature"></i> REGISTRADO</span>';
    } else {
        badge = '<span class="badge pending"><i class="fas fa-clock"></i> SIN ESTADO</span>';
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
        const ocSearch = (document.getElementById('filterOcSearch') || {}).value || '';
        const chkMyRecords = document.getElementById('filterMyRecords');
        const onlyMyRecords = chkMyRecords ? chkMyRecords.checked : true;

        // Show loading state
        $('#tableWrapper').show();
        $('#initialMessage').hide();
        
        const params = new URLSearchParams({ codcia: cia, only_my_records: onlyMyRecords });
        
        if (ocSearch.trim()) {
            // Búsqueda global: ignora año y periodo, busca todo el historial
            params.append('search', ocSearch.trim());
        } else {
            if (year) params.append('year', year);
            if (period) params.append('period', period);
        }
        if (type) params.append('tipo_oc', type);

        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/logistics/orders?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error al cargar órdenes');
        const orders = await res.json();

        if (dtInstance) {
            dtInstance.destroy();
        }

        // Build DataTable data array
        const dtData = orders.map(o => {
            const isApproved = !!(o.es_aprobado || o.usuario_aprobado);
            const statusInfo = formatStatus(o.estado, isApproved, o.tipooc);
            const mon = String(o.moneda || '1').trim();
            const sym = (mon === '2') ? 'USD' : 'S/';
            const total = parseFloat(o.total) || 0;
            const t = String(o.tipooc || '').trim().toUpperCase();
            let tipoLabel = '<span class="badge" style="background:#f1f5f9; color:#475569;">📦 Mercadería</span>';
            if (t === 'S') tipoLabel = '<span class="badge" style="background:#f1f5f9; color:#475569;">⚙️ Servicios</span>';
            else if (t === 'T') tipoLabel = '<span class="badge" style="background:#f1f5f9; color:#475569;">🗂️ Contable</span>';
            
            let procesoBg = '#f1f5f9';
            let procesoColor = '#475569';
            let procesoIcon = '📦';
            const proc = (o.estado_proceso || 'EN LOGÍSTICA').toUpperCase();
            if (proc === 'EN TESORERÍA') { procesoBg = '#fef3c7'; procesoColor = '#b45309'; procesoIcon = '💸'; }
            else if (proc === 'EN CONTABILIDAD') { procesoBg = '#f3e8ff'; procesoColor = '#7e22ce'; procesoIcon = '🗂️'; }
            else if (proc === 'CANCELADO') { procesoBg = '#dcfce7'; procesoColor = '#15803d'; procesoIcon = '✅'; }
            else if (proc === 'EN LOGÍSTICA') { procesoBg = '#e0f2fe'; procesoColor = '#0369a1'; procesoIcon = '🚚'; }
            
            const procesoBadge = `<span style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; font-weight:600; padding:3px 6px; border-radius:4px; background:${procesoBg}; color:${procesoColor};" title="${proc}">${procesoIcon} ${proc}</span>`;

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
                    ${ (((o.tipooc || '').trim().toUpperCase() === 'M' && (o.estado || '').trim().toUpperCase() === 'R') || (['S', 'T'].includes((o.tipooc || '').trim().toUpperCase()) && (o.estado || '').trim().toUpperCase() === 'P')) ? `
                    <div class="action-dropdown-divider"></div>
                    <button class="action-dropdown-item" onclick="aprobarOc('${cia}','${o.nrodoc}','${o.tipooc}','${o.anos}')" style="color:var(--success);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        Aprobar OC
                    </button>` : ''}
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
                statusInfo.badge,
                procesoBadge,
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
                statusInfo.watermark, // Hidden col 17
                o.tipooc || ''        // Hidden col 18
            ];
        });

        // Initialize DataTable
        dtInstance = $('#ordersTable').DataTable({
            data: dtData,
            destroy: true,
            deferRender: true,
            dom: '<"top-controls"Bf>rtip',
            buttons: [
                { extend: 'excelHtml5', text: '📊 Exportar Excel', className: 'dt-button', exportOptions: { columns: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16] } }
            ],
            order: [[3, 'desc']],
            pageLength: 10,
            scrollX: true,
            language: {
                search: 'Buscar:',
                lengthMenu: 'Mostrar _MENU_ registros',
                info: 'Mostrando _START_ a _END_ de _TOTAL_ órdenes',
                paginate: { first: '«', previous: '‹', next: '›', last: '»' }
            },
            columnDefs: [
                { targets: 0, className: 'dt-body-center sticky-col-left', orderable: false },
                { targets: 9, className: 'dt-body-right', render: (d) => `<strong>${fmtNum(d)}</strong>` },
                { targets: [17, 18], visible: false } // Hide helper columns
            ]
        });

    } catch (err) {
        $('#ordersTable tbody').html(`<tr><td colspan="18" style="text-align:center;padding:2rem;color:#ef4444;">${err.message}</td></tr>`);
    }
}

// ─── Aprobar OC ─────────────────────────
async function aprobarOc(codcia, nrodoc, tipooc, year) {
    const result = await Swal.fire({
        title: '¿Aprobar Orden de Compra?',
        html: `Esta acción aprobará la OC <strong>${nrodoc}</strong>.<br>Una vez aprobada, pasará al estado Autorizado.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#22c55e',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Sí, Aprobar',
        cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/logistics/orders/${encodeURIComponent(nrodoc)}/aprobar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                codcia: codcia,
                year: year,
                tipo_oc: tipooc
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Error al aprobar la OC');
        }

        Swal.fire({
            icon: 'success',
            title: '¡Aprobada!',
            text: `La OC ${nrodoc} ha sido aprobada exitosamente.`,
            timer: 2000,
            showConfirmButton: false
        });
        
        loadOrders(); // Recargar tabla
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Error de Aprobación',
            text: err.message
        });
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
        
        // Cargar Firmas (Acciones)
        let acciones = [];
        try {
            const urlAcc = `/api/logistics/orders/${encodeURIComponent(nrodoc)}/acciones?codcia=${encodeURIComponent(codcia)}&tipo_oc=${encodeURIComponent(tipooc)}&year=${encodeURIComponent(year || '')}`;
            const resAcc = await fetch(urlAcc, { headers: { 'Authorization': `Bearer ${token}` } });
            if (resAcc.ok) {
                const accData = await resAcc.json();
                acciones = accData.acciones || [];
            }
        } catch(e) { console.warn("Error cargando firmas", e); }

        // Cargar Adjuntos
        let attachedDocs = { signed: [], voucher: [] };
        try {
            const getDocs = async (type) => {
                const resApp = await fetch(`/api/logistics/attachments/list?codcia=${encodeURIComponent(codcia)}&tipooc=${encodeURIComponent(tipooc)}&nrodoc=${encodeURIComponent(nrodoc)}&doc_type=${type}`);
                return resApp.ok ? await resApp.json() : [];
            };
            attachedDocs.signed = await getDocs('signed_order');
            attachedDocs.voucher = await getDocs('voucher');
        } catch(e) { console.warn("Error cargando archivos adjuntos en reporte", e); }

        // Cargar Vouchers de Pago desde FinPagos
        let pagosFin = [];
        try {
            const resPagos = await fetch(`/api/cargos/pagos/oc/${encodeURIComponent(nrodoc)}?codcia=${encodeURIComponent(codcia)}`);
            if (resPagos.ok) {
                pagosFin = await resPagos.json();
            }
        } catch(e) { console.warn("Error cargando pagos FinPagos", e); }

        renderReport(data, acciones, attachedDocs, pagosFin);
    } catch (err) {
        container.innerHTML = `<div style="text-align:center;padding:3rem;color:#ef4444;font-weight:500;">❌ ${err.message}</div>`;
    }
}

function renderReport(data, acciones = [], attachedDocs = { signed: [], voucher: [] }, pagosFin = []) {
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
    const isService = (t === 'S' || t === 'T');
    const colCantLabel = isService ? 'Monto OC' : (isGoods ? 'Cant' : 'Cantidad');
    const facturadoLabel = isService ? 'Monto Fac.' : 'Facturado';

    html += `
    <table class="report-table" style="position:relative; z-index:1;">
        <thead><tr>
            <th style="width:30px;text-align:center;">N°</th>
            <th style="width:75px;">Código</th>
            <th>Producto / Servicio</th>
            <th style="width:35px;text-align:center;">Und</th>
            <th style="width:65px;text-align:right;">${colCantLabel}</th>
            ${isGoods ? '<th style="width:65px;text-align:right;">Recibido</th>' : ''}
            <th style="width:65px;text-align:right;">${facturadoLabel}</th>
            <th style="width:65px;text-align:center;">Estado</th>
            <th style="width:70px;text-align:right;">Precio</th>
            <th style="width:80px;text-align:right;">Total</th>
        </tr></thead><tbody>`;

    if (items.length === 0) {
        html += `<tr><td colspan="${isGoods ? '10' : '9'}" style="text-align:center;color:#94a3b8;padding:2rem;">Sin ítems</td></tr>`;
    } else {
        items.forEach(it => {
            const rowColor = (it.estado_ingreso === 'Completo') ? 'color: var(--success); font-weight:600;' : (it.estado_ingreso === 'Parcial' ? 'color: var(--warning); font-weight:600;' : 'color:#64748b;');

            html += `<tr>
                <td style="text-align:center;color:#64748b;font-weight:600;">${it.item_display}</td>
                <td style="font-family:monospace;font-size:0.725rem;">${it.codmat}</td>
                <td style="font-weight:500;">${it.desmat}</td>
                <td style="text-align:center;font-size:0.75rem;">${it.undstk}</td>
                <td style="text-align:right;">${fmtNum(isService ? it.imptot : it.candes)}</td>
                ${isGoods ? `<td style="text-align:right;font-weight:600;color:#22c55e;">${fmtNum(it.cant_ingresada)}</td>` : ''}
                <td style="text-align:right;font-weight:600;color:#8b5cf6;">${fmtNum(isService ? (it.monto_facturado || 0) : it.cant_facturada)}</td>
                <td style="text-align:center;font-size:0.7rem;${rowColor}">${it.estado_ingreso}</td>
                <td style="text-align:right;">${fmtNum(it.preuni)}</td>
                <td style="text-align:right;font-weight:600;color:var(--primary);">${sym} ${fmtNum(it.imptot)}</td>
            </tr>`;
            if (it.notas && it.notas.length) {
                it.notas.forEach(n => {
                    html += `<tr class="note-row"><td></td><td></td><td colspan="${isGoods ? '8' : '7'}" style="padding-left:1.5rem;"><span style="color:#94a3b8;">↳</span> ${n}</td></tr>`;
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
    html += `<style>
        .report-signatures { display:flex; justify-content:space-between; margin-top:2.5rem; gap:1.5rem; }
        .sig-block { flex:1; padding:0.75rem; border:1px solid #e2e8f0; border-radius:6px; background:#f8fafc; font-size:0.75rem; text-align:center; }
        .sig-pending { background:#fff; border-style:dashed; color:#94a3b8; }
        .sig-approved { border-color:#22c55e; background:#f0fdf4; }
        .sig-registered { border-color:#3b82f6; background:#eff6ff; }
        .sig-closed { border-color:#8b5cf6; background:#faf5ff; }
        .sig-title { font-weight:700; margin-bottom:0.5rem; display:flex; align-items:center; justify-content:center; gap:0.5rem; font-size:0.8rem; }
        .sig-user { font-weight:600; color:#1e293b; margin-bottom:0.25rem; font-size:0.85rem;}
        .sig-date { color:#64748b; font-size:0.7rem; }
    </style>`;

    html += `<div class="report-signatures">`;
    
    const getActionDate = (fch) => {
        if(!fch) return '';
        const d = new Date(fch);
        return `${d.toLocaleDateString('es-PE')} ${d.toLocaleTimeString('es-PE', {hour:'2-digit', minute:'2-digit'})}`;
    }

    const reg = acciones.find(a => a.accion === 'REGISTRO');
    if (reg) {
        html += `<div class="sig-block sig-registered">
            <div class="sig-title"><span style="color:#3b82f6;">📝</span> REGISTRADO POR</div>
            <div class="sig-user">${reg.usuario_nombre || reg.usuario_login || 'Usuario'}</div>
            <div class="sig-date">${getActionDate(reg.fecha_hora)}</div>
        </div>`;
    } else {
        html += `<div class="sig-block sig-pending"><div class="sig-title">REGISTRO PENDIENTE</div></div>`;
    }

    const apr = acciones.find(a => a.accion === 'APROBACION');
    if (apr) {
        html += `<div class="sig-block sig-approved">
            <div class="sig-title"><span style="color:#22c55e;">✅</span> APROBADO POR</div>
            <div class="sig-user">${apr.usuario_nombre || apr.usuario_login || 'Usuario'}</div>
            <div class="sig-date">${getActionDate(apr.fecha_hora)}</div>
        </div>`;
    } else {
        html += `<div class="sig-block sig-pending"><div class="sig-title">APROBACIÓN PENDIENTE</div><div class="sig-date">En espera</div></div>`;
    }

    const cie = acciones.find(a => a.accion === 'CIERRE');
    if (cie) {
        html += `<div class="sig-block sig-closed">
            <div class="sig-title"><span style="color:#8b5cf6;">🔒</span> CERRADO POR</div>
            <div class="sig-user">${cie.usuario_nombre || cie.usuario_login || 'Usuario'}</div>
            <div class="sig-date">${getActionDate(cie.fecha_hora)}</div>
        </div>`;
    } else {
        html += `<div class="sig-block sig-pending"><div class="sig-title">CIERRE PENDIENTE</div><div class="sig-date">En proceso</div></div>`;
    }

    html += `</div>`;

    html += `</div>`;

    html += `</div>`;

    // ─── Vouchers de Pago desde FinPagos ─────────────────────
    if(pagosFin && pagosFin.length > 0) {
        html += `
            <div style="margin-top: 2rem; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-family: 'Inter', sans-serif;">
                <div style="background: #fef3c7; padding: 0.75rem 1.25rem; font-weight: 700; color: #92400e; border-bottom: 1px solid #e2e8f0; display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-size:1.2rem;">💰</span>
                    Vouchers de Pago - Tesorería (${pagosFin.length} pago${pagosFin.length > 1 ? 's' : ''})
                </div>
                <div style="padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">
        `;

        pagosFin.forEach(p => {
            const simbolo = p.Moneda === 'USD' ? '$' : 'S/';
            html += `
                <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; background: #fff;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.85rem; margin-bottom: 0.75rem;">
                        <div><strong style="color: #64748b;">Monto:</strong> <span style="font-weight: 700; color: #059669;">${simbolo} ${p.MontoPago.toLocaleString('es-PE', {minimumFractionDigits: 2})}</span></div>
                        <div><strong style="color: #64748b;">Fecha:</strong> ${p.FechaPago}</div>
                        <div><strong style="color: #64748b;">Banco:</strong> ${p.BancoPago || '-'}</div>
                        <div><strong style="color: #64748b;">Tipo:</strong> ${p.TipoPago || '-'}</div>
                        <div><strong style="color: #64748b;">N° Operación:</strong> ${p.NroOperacion || '-'}</div>
                        <div><strong style="color: #64748b;">Registrado por:</strong> ${p.UsuarioRegistro || '-'}</div>
                    </div>
                    ${p.Notas ? `<div style="font-size: 0.8rem; color: #475569; background: #f8fafc; padding: 0.5rem; border-radius: 4px; margin-bottom: 0.5rem;"><strong>Notas:</strong> ${p.Notas}</div>` : ''}
                    ${p.Adjuntos && p.Adjuntos.length > 0 ? `
                        <div style="margin-top: 0.5rem;">
                            <strong style="font-size: 0.8rem; color: #64748b;">Adjuntos:</strong>
                            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.25rem;">
                                ${p.Adjuntos.map(a => `
                                    <a href="/uploads/pagos/${a.ArchivoNombre}" target="_blank" style="display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; background: #e0e7ff; color: #4338ca; border-radius: 4px; font-size: 0.75rem; text-decoration: none;">
                                        📎 ${a.ArchivoNombre}
                                    </a>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        html += `</div></div>`;
    }

    // ─── Attachments List in Report ──────────────────────────
    const signedFiles = attachedDocs.signed || [];
    const voucherFiles = attachedDocs.voucher || [];

    if(signedFiles.length > 0 || voucherFiles.length > 0) {
        html += `
            <div style="margin-top: 2rem; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-family: 'Inter', sans-serif;">
                <div style="background: #f8fafc; padding: 0.75rem 1.25rem; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; display:flex; align-items:center; gap:0.5rem;">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Documentos Adjuntos
                </div>
                <div style="padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">
        `;

        const renderFiles = (files, title, color) => {
            if(!files.length) return '';
            let filesHtml = files.map(f => {
                const isImg = f.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.6rem 0.8rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; margin-top:0.4rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; color:#475569; overflow:hidden;">
                            ${isImg ? '🖼️' : '📄'}
                            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${f.filename}">${f.filename}</span>
                        </div>
                        <button class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;" onclick="viewReportAttachment('${f.url}', '${f.filename}')">Virtualizar 👁</button>
                    </div>
                `;
            }).join('');
            return `
                <div>
                    <h5 style="margin: 0 0 0.2rem 0; font-size: 0.85rem; font-weight: 600; color: ${color};">${title}</h5>
                    ${filesHtml}
                </div>
            `;
        };

        html += renderFiles(signedFiles, 'Orden Firmada - OC', '#2563eb');
        html += renderFiles(voucherFiles, 'Vouchers de Pago (Adjuntos)', '#f59e0b');

        html += `</div></div>`;
    }

    document.getElementById('reportContent').innerHTML = html;
}

function closeReportModal() { 
    document.getElementById('reportModal').classList.remove('active'); 
    closeReportViewer();
}

function printReport() { window.print(); }

// ─── Attachments Split View ─────────────────────────
function viewReportAttachment(url, filename) {
    const viewer = document.getElementById('reportAttachmentViewer');
    const iframe = document.getElementById('reportAttachmentIframe');
    const loader = document.getElementById('reportViewerLoader');
    const title = document.getElementById('reportViewerTitle');
    
    const modal = document.querySelector('#reportModal .modal');
    modal.style.transition = 'max-width 0.3s ease-out';
    modal.style.maxWidth = '1400px';

    viewer.style.display = 'flex';
    loader.style.display = 'flex';
    iframe.style.display = 'none'; // hide until loaded
    iframe.onload = () => {
        loader.style.display = 'none';
        iframe.style.display = 'block';
    };
    iframe.src = url;
    
    title.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <span style="white-space:nowrap; max-width:250px; overflow:hidden; text-overflow:ellipsis;" title="${filename}">${filename}</span>
    `;
}

function closeReportViewer() {
    const viewer = document.getElementById('reportAttachmentViewer');
    const iframe = document.getElementById('reportAttachmentIframe');
    
    if(viewer) viewer.style.display = 'none';
    if(iframe) iframe.src = '';
    
    const modal = document.querySelector('#reportModal .modal');
    if(modal) modal.style.maxWidth = '920px';
}

// ─── Warehouse Modal (Voucher estilo Crystal Report) ─────────────────────────
async function openWarehouseModal(codcia, nrodoc) {
    document.getElementById('warehouseOcNro').textContent = nrodoc;
    document.getElementById('warehouseModal').classList.add('active');
    
    // Select the modal body directly so we don't depend on inner elements that might have been overwritten
    const modalBody = document.querySelector('#warehouseModal .modal-body');
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
            <div style="text-align:center; font-weight:bold; font-size:1.1rem; color:var(--primary); margin-bottom:1.5rem; text-transform:uppercase; letter-spacing:1px;">
                📦 Detalle de Movimientos Almacén
            </div>
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
// ════════════════════════════════════════════════════════════
//  BÚSQUEDA GLOBAL DE OC (por NroDoc, RUC, Proveedor)
// ════════════════════════════════════════════════════════════

function openOcSearchModal() {
    document.getElementById('ocSearchModal').classList.add('active');
    const input = document.getElementById('ocSearchInput');
    input.value = '';
    document.getElementById('ocSearchTbody').innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:#94a3b8;">Escriba para buscar OC</td></tr>';
    setTimeout(() => input.focus(), 100);
}

function closeOcSearchModal() {
    document.getElementById('ocSearchModal').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
    const ocInput = document.getElementById('ocSearchInput');
    if (ocInput) ocInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') triggerOcSearch(); });
});

async function triggerOcSearch() {
    const q = document.getElementById('ocSearchInput').value.trim();
    if (q.length < 2) return;
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) { Swal.fire('Atención', 'Seleccione una empresa primero', 'warning'); return; }
    
    const tbody = document.getElementById('ocSearchTbody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:#64748b;">Buscando...</td></tr>';
    
    try {
        const res = await fetch(`/api/logistics/orders?codcia=${encodeURIComponent(codcia)}&search=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error('Error buscando');
        const orders = await res.json();
        
        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:#64748b;">No se encontraron órdenes.</td></tr>';
            return;
        }
        
        const TIPO_COLORS = { 'M': '#2563eb', 'S': '#16a34a', 'T': '#9333ea' };
        const TIPO_LABELS = { 'M': 'Mercadería', 'S': 'Servicios', 'T': 'Contable' };
        
        let html = '';
        orders.forEach(o => {
            const mon = String(o.moneda || '1').trim();
            const sym = (mon === '2') ? 'USD' : 'S/';
            const total = parseFloat(o.total) || 0;
            const tipoColor = TIPO_COLORS[o.tipooc] || '#64748b';
            const tipoLabel = TIPO_LABELS[o.tipooc] || o.tipooc || '-';
            const statusInfo = formatStatus(o.estado);
            
            html += `<tr style="cursor:pointer; border-bottom:1px solid #e2e8f0;" 
                        onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''" 
                        onclick="selectOcFromSearch('${o.nrodoc}', '${o.tipooc || ''}', '${o.anos || ''}')">
                <td style="padding:0.6rem; font-family:monospace; color:#2563eb; font-weight:700;">${o.nrodoc}</td>
                <td style="padding:0.6rem; color:#475569;">${o.fchdoc || '-'}</td>
                <td style="padding:0.6rem; text-align:center;">
                    <span style="font-size:0.7rem; background:${tipoColor}15; color:${tipoColor}; padding:0.2rem 0.5rem; border-radius:4px; font-weight:700; border:1px solid ${tipoColor}30;">${o.tipooc} - ${tipoLabel}</span>
                </td>
                <td style="padding:0.6rem; font-weight:500;">${(o.proveedor || '').substring(0, 30)}</td>
                <td style="padding:0.6rem; font-family:monospace; font-size:0.75rem; color:#475569;">${o.ruc || '-'}</td>
                <td style="padding:0.6rem; text-align:right; font-weight:600;">${sym} ${fmtNum(total)}</td>
                <td style="padding:0.6rem; text-align:center;">${statusInfo.badge}</td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:#ef4444;">Error: ${err.message}</td></tr>`;
    }
}

function selectOcFromSearch(nrodoc, tipooc, anos) {
    closeOcSearchModal();
    // Open traza modal directly for the selected OC
    const codcia = document.getElementById('filterCia').value;
    openTrazaModal(codcia, nrodoc, tipooc, anos);
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

        const isService = tipooc === 'S' || tipooc === 'T';
        
        let html = `
        <div class="traza-summary">
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${r.total_items_oc}</div><div class="tlabel">Items OC</div></div>
            ${!isService 
                ? `<div class="traza-summary-item" style="flex:1;"><div class="tval">${fmtN(r.total_oc)}</div><div class="tlabel">Cant. Pedida</div></div>`
                : `<div class="traza-summary-item" style="flex:1;"><div class="tval">${fmtN(r.monto_oc)}</div><div class="tlabel">Monto Pedido</div></div>`
            }
            ${tipooc === 'M' ? `<div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#22c55e;">${fmtN(r.total_almacen)}</div><div class="tlabel">Cant. Almacén</div></div>` : ''}
            ${!isService
                ? `<div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#8b5cf6;">${fmtN(r.total_facturado)}</div><div class="tlabel">Cant. Facturada</div></div>`
                : `<div class="traza-summary-item" style="flex:1;"><div class="tval" style="color:#8b5cf6;">${fmtN(r.monto_facturado)}</div><div class="tlabel">Monto Facturado</div></div>`
            }
            <div class="traza-summary-item" style="flex:1;"><div class="tval">${r.total_facturas}</div><div class="tlabel">Facturas</div></div>
        </div>`;

        // ─── Validaciones / Alertas ───
        if (data.validaciones && data.validaciones.length > 0) {
            html += `<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:1rem; margin-bottom:1.5rem;">
                <h5 style="margin:0 0 0.5rem 0; color:#b45309; font-size:0.85rem; font-weight:700;">⚠️ Advertencias y Discrepancias</h5>
                <ul style="margin:0; padding-left:1.5rem; color:#92400e; font-size:0.75rem; font-weight:500;">`;
            data.validaciones.forEach(val => {
                html += `<li style="margin-bottom:0.25rem;">${val}</li>`;
            });
            html += `</ul></div>`;
        }

        // ─── Timeline Information Prep ───
        const dateOC = data.fch_oc ? new Date(data.fch_oc) : null;
        const diffDays = (dStr) => {
            if (!dateOC || !dStr) return null;
            const d = new Date(dStr);
            const diffTime = d.getTime() - dateOC.getTime();
            return Math.floor(diffTime / (1000 * 60 * 60 * 24));
        };

        let events = [];
        if (data.fch_oc) {
            events.push({ type: 'oc', fchdoc: data.fch_oc, label: 'Orden Emitida', desc: '', icon: '📝', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' });
        }
        if (data.movimientos_almacen) {
            data.movimientos_almacen.forEach(m => {
                if (m.fchdoc) events.push({ type: 'alm', fchdoc: m.fchdoc, label: `Ingreso a Almacén`, desc: `Inv: ${m.nrodoc}`, icon: '📦', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' });
            });
        }
        if (data.facturas) {
            data.facturas.forEach(f => {
                if (f.FecEmision) events.push({ type: 'fac', fchdoc: f.FecEmision, label: `Facturación`, desc: `Serie/Núm: ${f.Serie}-${f.Numero}`, icon: '🧾', color: '#9333ea', bg: '#faf5ff', border: '#e9d5ff' });
            });
        }
        events.sort((a,b) => new Date(a.fchdoc) - new Date(b.fchdoc));

        // Items Table
        html += `<div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:1rem;">
        <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
            <thead>
                <tr style="background:#f1f5f9;">
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">#</th>
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">Código</th>
                    <th style="padding:0.6rem 0.5rem; text-align:left; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">Descripción</th>
                    <th style="padding:0.6rem 0.5rem; text-align:right; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#334155; border-bottom:2px solid #cbd5e1;">${!isService ? 'Cant. OC' : 'Monto OC'}</th>
                    ${tipooc === 'M' ? `<th style="padding:0.6rem 0.5rem; text-align:center; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#22c55e; border-bottom:2px solid #cbd5e1;">Almacén</th>` : ''}
                    <th style="padding:0.6rem 0.5rem; text-align:center; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:#8b5cf6; border-bottom:2px solid #cbd5e1;">${!isService ? 'Cant. Facturada' : 'Monto Facturado'}</th>
                </tr>
            </thead><tbody>`;

        if (data.items.length === 0) {
            html += `<tr><td colspan="${tipooc === 'M' ? '6' : '5'}" style="text-align:center; padding:2rem; color:#94a3b8;">Sin ítems encontrados en la OC</td></tr>`;
        } else {
            data.items.forEach((it, idx) => {
                const almClass = it.pct_almacen >= 100 ? 'complete' : (it.pct_almacen > 0 ? 'partial' : 'pending');
                const facClass = it.pct_facturado >= 100 ? 'complete' : (it.pct_facturado > 0 ? 'partial' : 'pending');

                let trWarning = '';
                if (it.warnings && it.warnings.length > 0) {
                    const warnsInfo = it.warnings.map(w => `<span style="display:inline-block; margin-right:12px;">⚠️ ${w}</span>`).join('');
                    trWarning = `<tr style="background:#fffbeb; border-bottom:1px solid #f1f5f9;">
                         <td colspan="${tipooc === 'M' ? '6' : '5'}" style="padding:0.35rem 0.6rem; font-size:0.68rem; font-weight:500; color:#b45309;">
                             ${warnsInfo}
                         </td>
                    </tr>`;
                }

                html += `<tr style="border-bottom:${it.warnings && it.warnings.length ? 'none' : '1px solid #f1f5f9'};">
                    <td style="padding:0.5rem; text-align:center; color:#64748b;">${it.nroitm}</td>
                    <td style="padding:0.5rem; font-family:monospace; font-size:0.725rem;">${it.codmat}</td>
                    <td style="padding:0.5rem;">${(it.desmat || '').substring(0, 50)}</td>
                    <td style="padding:0.5rem; text-align:right; font-weight:600;">${!isService ? fmtN(it.candes) : fmtN(it.monto_oc)}</td>
                    ${tipooc === 'M' ? `<td style="padding:0.5rem; text-align:center;">
                        <div style="font-weight:600; ${almClass === 'complete' ? 'color:#22c55e;' : almClass === 'partial' ? 'color:#f59e0b;' : 'color:#94a3b8;'}">${fmtN(it.cant_almacen)} <span style="font-size:0.65rem; font-weight:400;">(${it.pct_almacen}%)</span></div>
                        <div class="traza-bar"><div class="traza-bar-fill ${almClass}" style="width:${Math.min(it.pct_almacen, 100)}%;"></div></div>
                    </td>` : ''}
                    <td style="padding:0.5rem; text-align:center;">
                        <div style="font-weight:600; ${facClass === 'complete' ? 'color:#8b5cf6;' : facClass === 'partial' ? 'color:#f59e0b;' : 'color:#94a3b8;'}">${!isService ? fmtN(it.cant_facturada) : fmtN(it.monto_facturado)} <span style="font-size:0.65rem; font-weight:400;">(${it.pct_facturado}%)</span></div>
                        <div class="traza-bar"><div class="traza-bar-fill ${facClass}" style="width:${Math.min(it.pct_facturado, 100)}%;"></div></div>
                    </td>
                </tr>${trWarning}`;
            });
        }
        html += '</tbody></table></div>';

        // Section: Documentos Agrupados (Vertically stacked for full width)
        html += `<div style="display:flex; flex-direction:column; gap:1.5rem; margin-bottom:1.5rem;">`;

        if (tipooc === 'M') {
            html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:1.25rem;">
                <h5 style="font-size:0.85rem; font-weight:700; margin-top:0; margin-bottom:1rem; color:#1e293b; border-bottom:2px solid #22c55e; padding-bottom:0.5rem;"><span style="color:#22c55e;">📦</span> Detalle de Movimientos Almacén</h5>
                <div style="overflow-x:auto;">`;

            if (data.movimientos_almacen && data.movimientos_almacen.length > 0) {
                html += `<table style="width:100%; border-collapse:collapse; font-size:0.75rem; background:#fff; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
                    <thead>
                        <tr style="color:#334155; background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Almacén</th>
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Doc. Referencia</th>
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Fecha</th>
                            <th style="padding:0.5rem; text-align:left; font-weight:600;">Material</th>
                            <th style="padding:0.5rem; text-align:right; font-weight:600;">Cantidad</th>
                            <th style="padding:0.5rem; text-align:right; font-weight:600;">Precio</th>
                        </tr>
                    </thead>
                    <tbody>`;
                data.movimientos_almacen.forEach((m, idx) => {
                    const isLast = idx === data.movimientos_almacen.length - 1;
                    html += `
                        <tr style="${!isLast ? 'border-bottom:1px solid #e2e8f0;' : ''}">
                            <td style="padding:0.5rem; color:#64748b;">${m.almcen}</td>
                            <td style="padding:0.5rem; color:#1d4ed8; font-weight:600;">${m.tipmov}-${m.codmov}-${m.nrodoc}</td>
                            <td style="padding:0.5rem; color:#475569;">${m.fchdoc}</td>
                            <td style="padding:0.5rem; font-family:monospace; font-weight:600; color:#475569;">${m.codmat}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600; color:#16a34a;">${fmtN(m.candes)}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600;">${fmtN(m.preuni)} <span style="font-size:0.65rem; color:#64748b; font-weight:400;">${m.codmon_desc || ''}</span></td>
                        </tr>`;
                });
                html += '</tbody></table></div>';
            } else {
                html += '<div style="text-align:center; padding:1.5rem; color:#94a3b8; font-size:0.8rem; background:#f8fafc; border:1px dashed #e2e8f0; border-radius:8px;">No hay movimientos.</div></div>';
            }
            html += `</div>`; // End top card (Movimientos)
        }

        html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:1.25rem;">
                 <h5 style="font-size:0.85rem; font-weight:700; margin-top:0; margin-bottom:1rem; color:#1e293b; border-bottom:2px solid #8b5cf6; padding-bottom:0.5rem;"><span style="color:#8b5cf6;">🧾</span> Facturas Vinculadas</h5>
                 <div class="traza-factura-list">`;
        
        // Linked invoices
        if (data.facturas && data.facturas.length > 0) {
            data.facturas.forEach(f => {
                const facturaUrl = f.Uuid ? `factura_visor.html?uid=${f.Uuid}` : '#';
                html += `
                <div style="margin-bottom:1rem; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.85rem 1rem; background:#f8fafc; border-bottom:${f.detalles && f.detalles.length ? '1px solid #cbd5e1' : 'none'};">
                        <div style="display:flex; align-items:center; gap:0.85rem;">
                            <div style="background:#f0f7ff; color:#2563eb; width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            </div>
                            <div>
                                <div style="font-weight:700; color:#1e293b;">${f.Serie || ''}-${f.Numero || ''}</div>
                                <div style="font-size:0.7rem; color:#64748b;">${f.NomProveedor || '-'}</div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:700; color:#1e293b;">${fmtN(f.Total)} ${f.codmon_desc || f.CodMoneda}</div>
                            <div style="display:flex; align-items:center; justify-content:flex-end; gap:0.5rem; margin-top:0.25rem;">
                                <span style="font-size:0.7rem; color:#64748b;">${f.FecEmision || '-'}</span>
                                ${f.Uuid ? `<a href="${facturaUrl}" target="_blank" class="btn btn-primary" style="padding:0.25rem 0.5rem; font-size:0.65rem; height:auto; text-decoration:none;">Ver PDF</a>` : ''}
                            </div>
                        </div>
                    </div>`;

                if (f.detalles && f.detalles.length > 0) {
                    html += `<div style="padding:0 0.75rem 0.75rem 0.75rem;"><table style="width:100%; font-size:0.72rem; border-collapse:collapse; margin-top:0.5rem; background:#fff; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
                        <thead>
                           <tr style="color:#334155; background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
                             <th style="padding:0.5rem; text-align:left; font-weight:600;">Cod. Material</th>
                             <th style="padding:0.5rem; text-align:left; font-weight:600;">Descripción</th>
                             <th style="padding:0.5rem; text-align:right; font-weight:600;">Cantidad</th>
                             <th style="padding:0.5rem; text-align:right; font-weight:600;">Precio Unitario</th>
                           </tr>
                        </thead><tbody>`;
                    f.detalles.forEach((d, idx) => {
                        const isLast = idx === f.detalles.length - 1;
                        html += `<tr style="${!isLast ? 'border-bottom:1px solid #e2e8f0;' : ''}">
                            <td style="padding:0.5rem; font-family:monospace; font-weight:600; color:#475569;">${d.codmat}</td>
                            <td style="padding:0.5rem; font-weight:500;">${(d.desmat || '')}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600; color:#8b5cf6;">${fmtN(d.cant)}</td>
                            <td style="padding:0.5rem; text-align:right; font-weight:600;">${fmtN(d.preuni)} <span style="font-size:0.65rem; color:#64748b; font-weight:400;">${f.codmon_desc || ''}</span></td>
                        </tr>`;
                    });
                    html += `</tbody></table></div>`;
                }
                html += `</div>`;
            });
            html += '</div>';
        } else {
            html += '<div style="text-align:center; padding:1.5rem; color:#94a3b8; font-size:0.8rem; background:#f8fafc; border:1px dashed #e2e8f0; border-radius:8px;">No hay facturas vinculadas aún.</div></div>';
        }
        
        html += `</div>`; // End right card
        html += `</div>`; // End grouped flex

        // ─── Vertical Timeline Render ───
        html += `<div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:1.25rem;">
            <h5 style="font-size:0.85rem; font-weight:700; color:#1e293b; margin-top:0; margin-bottom:1.2rem; border-bottom:2px solid #e2e8f0; padding-bottom:0.5rem;"><span style="color:#f59e0b; margin-right:6px;">⏱️</span> Línea de Tiempo (Cronograma)</h5>`;
        
        html += `<div style="border-left:2px solid #cbd5e1; margin-left:1rem; padding-left:1.5rem; position:relative; display:flex; flex-direction:column; gap:1.2rem;">`;

        events.forEach(ev => {
             const dd = diffDays(ev.fchdoc);
             const daysText = dd === 0 ? "Mismo Día" : (dd > 0 ? `+${dd} Días` : `${dd} Días`);
             html += `
             <div style="position:relative;">
                 <div style="position:absolute; left:-1.9rem; top:0.25rem; width:14px; height:14px; background:#fff; border:3px solid ${ev.color}; border-radius:50%;"></div>
                 <div style="background:${ev.bg}; border:1px solid ${ev.border}; padding:0.6rem 1rem; border-radius:8px;">
                     <div style="display:flex; justify-content:space-between; align-items:center;">
                         <div style="font-weight:700; color:${ev.color}; font-size:0.75rem;"><span style="font-size:0.85rem; margin-right:4px;">${ev.icon}</span> ${ev.label}</div>
                         <div style="font-size:0.7rem; color:#475569; font-weight:600; padding:2px 8px; background:#fff; border-radius:12px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">${daysText}</div>
                     </div>
                     <div style="color:#64748b; font-size:0.72rem; margin-top:0.4rem;">Fecha doc: <strong style="color:#334155;">${ev.fchdoc}</strong> ${ev.desc ? `<span style="margin-left:0.5rem; padding-left:0.5rem; border-left:1px solid #cbd5e1; color:#64748b;">${ev.desc}</span>` : ''}</div>
                 </div>
             </div>
             `;
        });
        
        if (events.length === 0) {
             html += `<div style="color:#64748b; font-size:0.8rem; font-style:italic;">Sin eventos registrados</div>`;
        }
        html += `</div></div>`;

        // ─── Botón Cerrar Proceso Completo ───
        const hasWarnings = data.validaciones && data.validaciones.length > 0;
        const isClosed = String(data.resumen.estado_oc || '').trim().toUpperCase() === 'C';
        
        html += `<div style="margin-top:2rem; text-align:right; border-top:1px solid #e2e8f0; padding-top:1.5rem;">`;
        if (!isClosed) {
            if (hasWarnings) {
                html += `<button class="btn" style="background:#e2e8f0; color:#64748b; cursor:not-allowed;" title="Hay discrepancias en la trazabilidad. Resuélvalas antes de cerrar.">
                    🔒 Cerrar Proceso Completo
                </button>`;
            } else {
                html += `<button class="btn btn-primary" style="background:#8b5cf6;" onclick="cerrarOcIntegral('${codcia}','${nrodoc}','${tipooc}','${anos}')">
                    🔒 Cerrar Proceso Completo
                </button>`;
            }
        } else {
            html += `<span style="display:inline-block; padding:0.6rem 1.25rem; font-size:0.85rem; font-weight:700; color:#16a34a; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px;">✅ PROCESO CERRADO</span>`;
        }
        html += `</div>`;

        content.innerHTML = html;
    } catch(err) {
        content.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444; font-weight:500;">❌ Error: ${err.message}</div>`;
    }
}

// ─── Cerrar OC Integral ─────────────────────────
async function cerrarOcIntegral(codcia, nrodoc, tipooc, year) {
    const result = await Swal.fire({
        title: 'Cerrar Proceso Completo',
        html: `Esta acción cerrará la <strong>OC ${nrodoc}</strong>, y bloqueará permanentemente todos sus movimientos de almacén y facturas vinculadas.<br><br><span style="color:#ef4444; font-weight:bold;">Esta acción es irreversible.</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#8b5cf6',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Sí, Cerrar Proceso',
        cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/logistics/orders/${encodeURIComponent(nrodoc)}/cerrar-integral`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                codcia: codcia,
                year: year,
                tipo_oc: tipooc
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Error al cerrar el proceso integral');
        }

        Swal.fire({
            icon: 'success',
            title: '¡Cerrado exitosamente!',
            text: `Toda la trazabilidad de la OC ${nrodoc} ha sido cerrada y bloqueada.`,
            timer: 2500,
            showConfirmButton: false
        });
        
        closeTrazaModal();
        loadOrders(); // Recargar tabla
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Error de cierre',
            text: err.message
        });
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

// ─── Security Permissions (RLS) ────────────
async function enforceUserPermissions() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/permisos/me', { headers: { 'Authorization': `Bearer ${token}` }});
        if(res.ok) {
            const data = await res.json();
            
            // 1. Visibilidad Global
            const myRsContainer = document.getElementById('filterMyRecordsContainer');
            if(data.puede_ver_todo) {
                if(myRsContainer) myRsContainer.style.display = 'flex';
            } else {
                if(myRsContainer) myRsContainer.style.display = 'none';
                const chk = document.getElementById('filterMyRecords');
                if(chk) chk.checked = true; // Forzar
            }

            // 2. Tipos de OC Permitidos
            if (!data.isAdmin && data.tipos_oc_permitidos) {
                const selTipos = document.getElementById('filterType');
                if(selTipos) {
                    Array.from(selTipos.options).forEach(opt => {
                        if(opt.value && !data.tipos_oc_permitidos.includes(opt.value)) {
                            opt.style.display = 'none'; // Ocultar visualmente
                            opt.disabled = true; // Desactivar seleccionable
                        }
                    });
                    
                    // Si el usuario no tiene ninguna selección válida, seleccionar (Todos) o limpiar
                    if(selTipos.options[selTipos.selectedIndex] && selTipos.options[selTipos.selectedIndex].disabled) {
                        selTipos.value = "";
                    }
                }
            }
        }
    } catch(err) { console.error("Error cargando RLS", err); }
}

// ─── Auto-Open Modals via URL Params ────────────
document.addEventListener('DOMContentLoaded', () => {
    enforceUserPermissions().then(() => {
        loadCompanies().then(() => {
            loadOrders();
            
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

            // Soporte ?oc=XXXX — auto-buscar y abrir reporte OC (desde pagos_tesoreria)
            const ocDirect = urlParams.get('oc');
            if (ocDirect) {
                const filterSearch = document.getElementById('filterOcSearch');
                if (filterSearch) {
                    filterSearch.value = ocDirect;
                    setTimeout(() => {
                        loadOrders().then(() => {
                            const ciaSel = document.getElementById('filterCia').value;
                            if (ciaSel) {
                                setTimeout(() => openReportModal(ciaSel, ocDirect, 'O', new Date().getFullYear().toString()), 400);
                            }
                        });
                    }, 300);
                }
            }
        });
    });
// ─── Attachments Modal ─────────────────────────
function openAttachmentModal(codcia, tipooc, nrodoc, docType) {
    currentAttachmentContext = { codcia, tipooc, nrodoc, docType };
    
    let title = 'Adjuntos';
    if(docType === 'signed_order') title = 'Orden Firmada';
    if(docType === 'voucher') title = 'Voucher de Pago';
    
    document.getElementById('attachmentModalTitle').textContent = title;
    document.getElementById('attachmentOcNro').textContent = nrodoc;
    document.getElementById('attachmentModal').classList.add('active');
    
    loadAttachmentList();
}

function closeAttachmentModal() {
    document.getElementById('attachmentModal').classList.remove('active');
    currentAttachmentContext = null;
}

async function loadAttachmentList() {
    if(!currentAttachmentContext) return;
    const { codcia, tipooc, nrodoc, docType } = currentAttachmentContext;
    const container = document.getElementById('attachmentList');
    container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);">Cargando...</div>';
    
    try {
        const res = await fetch(`/api/logistics/attachments/list?codcia=${encodeURIComponent(codcia)}&tipooc=${encodeURIComponent(tipooc)}&nrodoc=${encodeURIComponent(nrodoc)}&doc_type=${encodeURIComponent(docType)}`);
        if(!res.ok) throw new Error('Error al cargar adjuntos');
        const files = await res.json();
        
        if(files.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.875rem;">No hay archivos guardados</div>';
            return;
        }
        
        container.innerHTML = files.map(f => {
            const isImg = f.filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            const icon = isImg ? '🖼️' : '📄';
            return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                <div style="display:flex; align-items:center; gap:0.75rem; overflow:hidden;">
                    <div style="font-size:1.5rem;">${icon}</div>
                    <div style="display:flex; flex-direction:column; overflow:hidden;">
                        <span style="font-size:0.875rem; font-weight:600; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${f.filename}">${f.filename}</span>
                        <span style="font-size:0.7rem; color:#64748b;">${(f.size/1024).toFixed(1)} KB</span>
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem; flex-shrink:0;">
                    <button class="btn btn-outline" style="padding:0.35rem 0.6rem; font-size:0.75rem;" onclick="openPreviewModal('${f.url}', '${f.filename}')">Ver</button>
                    <button class="btn" style="background:#fee2e2; color:#ef4444; border:1px solid #fecaca; padding:0.35rem 0.6rem; font-size:0.75rem;" onclick="deleteAttachment('${f.filename}')">❌</button>
                </div>
            </div>`;
        }).join('');
        
    } catch(err) {
        container.innerHTML = `<div style="text-align:center; padding:2rem; color:#ef4444; font-size:0.875rem;">${err.message}</div>`;
    }
}

async function handleAttachmentUpload() {
    const input = document.getElementById('attachmentFileInput');
    if(!input.files || input.files.length === 0) return;
    
    if(!currentAttachmentContext) return;
    const { codcia, tipooc, nrodoc, docType } = currentAttachmentContext;
    const file = input.files[0];
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('codcia', codcia);
    formData.append('tipooc', tipooc);
    formData.append('nrodoc', nrodoc);
    formData.append('doc_type', docType);
    
    try {
        Swal.fire({title: 'Subiendo archivo...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
        
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/logistics/attachments/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if(!res.ok) throw new Error('Error al subir el archivo');
        
        Swal.fire({ icon: 'success', title: 'Archivo subido', timer: 1500, showConfirmButton: false });
        input.value = ''; // clear
        loadAttachmentList(); // refresh list
        loadOrders(); // refresh main table flags
    } catch(err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
}

async function deleteAttachment(filename) {
    const result = await Swal.fire({
        title: '¿Eliminar archivo?',
        text: filename,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });
    
    if(!result.isConfirmed || !currentAttachmentContext) return;
    const { codcia, tipooc, nrodoc, docType } = currentAttachmentContext;
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/logistics/attachments/delete', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                codcia, tipooc, nrodoc, doc_type: docType, filename
            })
        });
        
        if(!res.ok) throw new Error('Error al eliminar');
        loadAttachmentList();
        loadOrders();
    } catch(err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
}

function openPreviewModal(url, filename) {
    document.getElementById('previewModalTitle').textContent = filename;
    document.getElementById('previewModalDownloadBtn').href = url;
    document.getElementById('previewModalDownloadBtn').setAttribute('download', filename);
    
    const body = document.getElementById('previewModalBody');
    const isImg = filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    
    if(isImg) {
        body.innerHTML = `<img src="${url}" style="max-width:100%; max-height:100%; object-fit:contain; padding:1rem;" />`;
    } else {
        body.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`;
    }
    
    document.getElementById('previewModal').classList.add('active');
}

function closePreviewModal() {
    document.getElementById('previewModal').classList.remove('active');
    document.getElementById('previewModalBody').innerHTML = '<div style="color:var(--text-muted);">Cargando previsualización...</div>';
}

});

