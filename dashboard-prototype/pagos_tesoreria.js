// ════════════════════════════════════════════════════════════
//  PAGOS TESORERÍA - Frontend JS
// ════════════════════════════════════════════════════════════

let pendientesDT = null;
let historialPagosDT = null;
let currentUser = '';

// ─── Axios Global Config ────────────
axios.interceptors.request.use(config => {
    const token = localStorage.getItem('yelave_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});
axios.interceptors.response.use(res => res, error => {
    return Promise.reject(error.response?.data?.detail || error.message || 'Error del servidor');
});

// ─── Init ────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadCompanies();
    try {
        const u = JSON.parse(localStorage.getItem('yelave_user'));
        if (u) {
            currentUser = u.login;
        } else {
            const payload = JSON.parse(atob(localStorage.getItem('yelave_token').split('.')[1]));
            currentUser = payload.sub || payload.username || 'Usuario';
        }
    } catch { currentUser = 'Usuario'; }
});

async function loadCompanies() {
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await axios.get('/api/permisos/empresas/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const companies = res.data;
        const select = document.getElementById('filterCia');
        select.innerHTML = '<option value="">Seleccione Empresa...</option>' +
            companies.map(c => {
                const cod = (c.CodCia || c.codcia || '').trim();
                const desc = c.nomcia || c.NomCia || '';
                return `<option value="${cod}">${cod} - ${desc}</option>`;
            }).join('');
        
        const cached = localStorage.getItem('yelave_codcia');
        const cu = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        let fallback = '';
        if (companies.length > 0) {
            fallback = companies[0].CodCia || companies[0].codcia || '';
        }
        const defaultCia = cached || cu.codcia || fallback;

        if (defaultCia) {
            select.value = defaultCia;
            onCiaChange();
        }
    } catch (err) {
        console.error('Error loading companies:', err);
        document.getElementById('filterCia').innerHTML = '<option value="" disabled>Sin acceso a empresas</option>';
    }
}

function onCiaChange() {
    const val = document.getElementById('filterCia').value;
    if (val) {
        localStorage.setItem('yelave_codcia', val);
        loadParametros();
        loadPendientes();
        loadHistorialPagos();
    }
}

// ════════════════════════════════════════════════════════════
//  CARGA DE PARAMETROS (Monedas, Bancos, Tipos de Pago)
// ════════════════════════════════════════════════════════════

let paramMonedas = [{Codigo: 'PEN', Descripcion: 'Soles'}, {Codigo: 'USD', Descripcion: 'Dólares'}];
let paramBancos = [];
let paramTiposPago = [
    {Codigo: 'TRANSFERENCIA', Descripcion: 'Transferencia Bancaria'},
    {Codigo: 'CHEQUE', Descripcion: 'Cheque'},
    {Codigo: 'EFECTIVO', Descripcion: 'Efectivo'},
    {Codigo: 'DEPOSITO', Descripcion: 'Depósito'},
    {Codigo: 'TARJETA', Descripcion: 'Tarjeta'}
];
let paramConceptos = []; // CjaMTipo 0002

async function loadParametros() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) return;

    try {
        const [resBancos, resConceptos] = await Promise.all([
            axios.get(`/api/cargos/parametros/bancos-all?codcia=${codcia}`).catch(() => ({data: []})),
            axios.get(`/api/cargos/parametros/conceptos-pago?codcia=${codcia}`).catch(() => ({data: []}))
        ]);

        paramBancos = resBancos.data;
        paramConceptos = resConceptos.data;

        updateSelectBancos();
        updateSelectTiposPago();
        updateSelectConceptos();
    } catch (err) {
        console.error('Error cargando parámetros:', err);
    }
}

function updateSelectBancos() {
    const select = document.getElementById('pago_banco');
    if (!select) return;

    let html = '<option value="">— Seleccione cuenta bancaria —</option>';
    if (paramBancos.length > 0) {
        html += paramBancos.map(b => {
            const monLabel = parseInt(b.CodMon) === 2 ? 'USD' : 'PEN';
            return `<option value="${b.Codigo}" data-codmon="${b.CodMon}">${b.Descripcion} [${monLabel}]</option>`;
        }).join('');
    } else {
        html += `
            <option value="BCP" data-codmon="1">BANCO DE CREDITO DEL PERU [PEN]</option>
            <option value="BBVA" data-codmon="1">BBVA PERU [PEN]</option>
            <option value="SCOTIABANK" data-codmon="1">SCOTIABANK PERU [PEN]</option>
            <option value="INTERBANK" data-codmon="1">INTERBANK [PEN]</option>
            <option value="EFECTIVO" data-codmon="1">CAJA / EFECTIVO [PEN]</option>
        `;
    }
    select.innerHTML = html;
}

function updateSelectTiposPago() {
    const select = document.getElementById('pago_tipo');
    if (!select) return;
    select.innerHTML = '<option value="">Seleccione...</option>' +
        paramTiposPago.map(t => `<option value="${t.Codigo}">${t.Descripcion}</option>`).join('');
}

function updateSelectConceptos() {
    const select = document.getElementById('pago_concepto');
    if (!select) return;
    let html = '<option value="">Seleccione concepto...</option>';
    if (paramConceptos.length > 0) {
        html += paramConceptos.map(c => `<option value="${c.Codigo}">${c.Descripcion}</option>`).join('');
    }
    select.innerHTML = html;
}

// Cuando se selecciona un banco, auto-setear la moneda
function onBancoChange() {
    const select = document.getElementById('pago_banco');
    const opt = select.options[select.selectedIndex];
    const codMon = opt ? opt.getAttribute('data-codmon') : '1';
    const moneda = parseInt(codMon) === 2 ? 'USD' : 'PEN';

    document.getElementById('pago_moneda').value = moneda;

    const infoDiv = document.getElementById('bancoMonedaInfo');
    const label = document.getElementById('bancoMonedaLabel');
    if (infoDiv && label && select.value) {
        label.textContent = moneda === 'USD' ? 'USD — Dólares' : 'PEN — Soles';
        label.style.color = moneda === 'USD' ? '#d97706' : '#1e40af';
        infoDiv.style.display = 'block';
    } else if (infoDiv) {
        infoDiv.style.display = 'none';
    }
}

// ─── File Upload Helpers ─────────────
let uploadedFiles = [];

function handleFileDrop(event) {
    const dt = event.dataTransfer;
    const files = dt.files;
    addFilesToList(files);
}

function renderFileList() {
    const input = document.getElementById('pago_adjuntos');
    addFilesToList(input.files);
    input.value = '';
}

function addFilesToList(fileList) {
    for (let i = 0; i < fileList.length; i++) {
        uploadedFiles.push(fileList[i]);
    }
    renderFilePreview();
}

function removeFile(idx) {
    uploadedFiles.splice(idx, 1);
    renderFilePreview();
}

function renderFilePreview() {
    const container = document.getElementById('fileListPreview');
    if (!container) return;
    if (uploadedFiles.length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = uploadedFiles.map((f, i) => {
        const sizeKB = (f.size / 1024).toFixed(1);
        const icon = f.type.includes('pdf') ? '📄' : f.type.includes('image') ? '🖼️' : '📎';
        return `<div style="display:flex; align-items:center; gap:0.5rem; padding:0.35rem 0.5rem; background:#f1f5f9; border-radius:6px; margin-bottom:0.25rem; font-size:0.75rem;">
            <span>${icon}</span>
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</span>
            <span style="color:#94a3b8;">${sizeKB} KB</span>
            <button type="button" onclick="removeFile(${i})" style="background:none; border:none; cursor:pointer; color:#ef4444; font-weight:700; font-size:0.85rem;" title="Quitar">✕</button>
        </div>`;
    }).join('');
}

// ─── Tab Switching ────────────────────
function switchTab(tab) {
    document.getElementById('tabPendientes').classList.toggle('active', tab === 'pendientes');
    document.getElementById('tabHistorial').classList.toggle('active', tab === 'historial');
    document.getElementById('panelPendientes').style.display = tab === 'pendientes' ? 'block' : 'none';
    document.getElementById('panelHistorial').style.display = tab === 'historial' ? 'block' : 'none';
}

// ─── Visor Modal (iframe) ─────────────
function openVisor(url, titulo) {
    let overlay = document.getElementById('visorOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'visorOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:12px;width:92%;max-width:1100px;height:85vh;display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,0.3);">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1.25rem;border-bottom:1px solid #e2e8f0;">
                    <h4 id="visorTitle" style="margin:0;font-size:0.95rem;font-weight:700;color:#1e3a5f;"></h4>
                    <button onclick="closeVisor()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#64748b;" title="Cerrar">✕</button>
                </div>
                <iframe id="visorIframe" style="flex:1;border:none;border-radius:0 0 12px 12px;" src="about:blank"></iframe>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeVisor(); });
    }
    document.getElementById('visorTitle').textContent = titulo || 'Visor';
    document.getElementById('visorIframe').src = url;
    overlay.style.display = 'flex';
}
function closeVisor() {
    const o = document.getElementById('visorOverlay');
    if (o) { o.style.display = 'none'; document.getElementById('visorIframe').src = 'about:blank'; }
}

// ════════════════════════════════════════════════════════════
//  TAB 1: PENDIENTES DE PAGO
// ════════════════════════════════════════════════════════════

async function loadPendientes() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) return;

    if (pendientesDT) { pendientesDT.destroy(); pendientesDT = null; }
    const tbody = document.getElementById('pendientesTbody');
    tbody.innerHTML = '<tr><td colspan="16" style="text-align:center; padding:2rem; color:#94a3b8;">Cargando...</td></tr>';

    try {
        const res = await axios.get(`/api/cargos/pagos/pendientes?codcia=${encodeURIComponent(codcia)}`);
        const items = res.data;

        // Stats - Calcular totales por moneda
        let totalPEN = 0, totalUSD = 0;
        items.forEach(i => {
            const monto = parseFloat(i.ImportePrincipal || 0);
            if (i.Moneda === 'USD') totalUSD += monto;
            else totalPEN += monto;
        });
        document.getElementById('statPendientes').textContent = items.length;
        let montoTexto = '';
        if (totalPEN > 0) montoTexto += `S/ ${totalPEN.toLocaleString('es-PE', {minimumFractionDigits: 2})}`;
        if (totalUSD > 0) { if (montoTexto) montoTexto += ' + '; montoTexto += `$ ${totalUSD.toLocaleString('es-PE', {minimumFractionDigits: 2})}`; }
        if (!montoTexto) montoTexto = 'S/ 0.00';
        document.getElementById('statMontoPend').textContent = montoTexto;

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:2rem; color:#94a3b8;">No hay documentos pendientes de pago.</td></tr>';
            return;
        }

        const tipoDocMap = { '01': 'Factura', '03': 'Boleta', '07': 'Nota Crédito', '87': 'NC Especial', '08': 'Nota Débito', '02': 'Rec. Hon.', '00': 'Otros' };
        const ciaVal = document.getElementById('filterCia').value || '';

        const dtData = items.map(c => {
            const tipoDoc = c.TipoDocDesc || 'OC';
            const moneda = c.Moneda || 'PEN';
            const simbolo = moneda === 'USD' ? '$' : 'S/';
            const codcia = c.CodCiaOc || ciaVal;
            const isNC = (c.TipoComprobante === '07' || c.TipoComprobante === '87');

            // Fechas
            const cleanDate = (d) => {
                if (!d || d === '-' || d === 'None' || d === 'null') return '';
                const s = String(d).trim();
                if (s.startsWith('1900') || s.startsWith('0001') || s.startsWith('1899')) return '';
                return s.substring(0, 10);
            };
            const fechaEmision = cleanDate(c.FechaEmision) || cleanDate(c.FechaOC);
            const fechaVencimiento = cleanDate(c.FechaVencimiento);

            // Días por vencer
            let diasVencHtml = '<span style="color:#cbd5e1;">—</span>';
            if (fechaVencimiento) {
                const hoy = new Date(); hoy.setHours(0,0,0,0);
                const fv = new Date(fechaVencimiento + 'T00:00:00');
                const diff = Math.ceil((fv - hoy) / (1000*60*60*24));
                let color = '#059669', icon = '🟢';
                if (diff < 0) { color = '#dc2626'; icon = '🔴'; }
                else if (diff <= 7) { color = '#f59e0b'; icon = '🟡'; }
                diasVencHtml = `<span style="font-weight:700; color:${color};">${icon} ${diff}d</span>`;
            }

            // Importes
            const importeOC = parseFloat(c.MontoOC || 0);
            const importeFactura = parseFloat(c.MontoFactura || 0);
            const importeRendicion = parseFloat(c.MontoRendicion || c.TotalReembolso || 0);
            let importePagar = parseFloat(c.ImportePrincipal || 0);
            if (isNC) importePagar = -Math.abs(importePagar);
            const saldo = importePagar; // TODO: restar pagos parciales si los hay

            // Badge
            let tipoClass = 'badge pending';
            if (tipoDoc === 'Factura' || tipoDoc === 'Boleta') tipoClass = 'badge success';
            if (tipoDoc === 'Rendición') tipoClass = 'badge success';
            if (isNC || tipoDoc === 'Nota Crédito' || tipoDoc === 'NC Especial') tipoClass = 'badge nc';
            const tipoLabel = isNC ? (tipoDocMap[c.TipoComprobante] || tipoDoc) : tipoDoc;

            // Documento principal con enlace
            let docHtml = `<strong>${c.NroDocPrincipal || '-'}</strong>`;
            const linkColor = isNC ? '#ef4444' : '#2563eb';
            if (c.FacturaUuid && tipoDoc !== 'OC' && tipoDoc !== 'Rendición') {
                docHtml = `<a href="javascript:void(0)" onclick="openVisor('/factura_visor.html?uid=${c.FacturaUuid}', '${tipoLabel} ${c.NroDocPrincipal}')" style="color:${linkColor}; text-decoration:underline; font-weight:700;">📄 ${c.NroDocPrincipal}</a>`;
            } else if (tipoDoc === 'Rendición' && c.RendicionUuid) {
                docHtml = `<a href="javascript:void(0)" onclick="openVisor('/visor_rendicion.html?uuid=${c.RendicionUuid}', 'Rendición ${c.NroDocPrincipal}')" style="color:#059669; text-decoration:underline; font-weight:700;">📋 ${c.NroDocPrincipal || c.NroRendicion}</a>`;
            } else if (tipoDoc === 'OC' && c.NroOrdenCompra) {
                const ocUrl = '/oc_visor.html?nrodoc=' + encodeURIComponent(c.NroOrdenCompra) + '&codcia=' + encodeURIComponent(codcia) + '&tipooc=' + encodeURIComponent(c.TipoOc || 'O');
                docHtml = `<a href="javascript:void(0)" onclick="openVisor('${ocUrl}', 'OC ${c.NroOrdenCompra}')" style="color:#8b5cf6; text-decoration:underline; font-weight:700;">📦 ${c.NroDocPrincipal}</a>`;
                if (c.FacturaUuid && c.NroFactura) {
                    docHtml += `<br><a href="javascript:void(0)" onclick="openVisor('/factura_visor.html?uid=${c.FacturaUuid}', 'Factura ${c.NroFactura}')" style="color:#2563eb; font-size:0.72rem; text-decoration:underline;">📄 ${c.NroFactura}</a>`;
                }
            }

            // Proveedor
            const provHtml = `${c.Proveedor || '-'}<br><small style="color:#64748b;">${c.RucProveedor || '-'}</small>`;

            // Trazabilidad
            let trazaHtml = '<span style="color:#cbd5e1;">—</span>';
            const nro_oc = (c.NroOrdenCompra || '').trim();
            const nro_fac = (c.NroFactura || '').trim();
            if (tipoDoc === 'Factura' && nro_oc && nro_oc !== '-') {
                const ocUrl2 = '/oc_visor.html?nrodoc=' + encodeURIComponent(nro_oc) + '&codcia=' + encodeURIComponent(codcia) + '&tipooc=' + encodeURIComponent(c.TipoOc || 'O');
                trazaHtml = `<a href="javascript:void(0)" onclick="openVisor('${ocUrl2}', 'OC ${nro_oc}')" style="font-size:0.75rem; color:#8b5cf6; text-decoration:underline;">📦 OC: ${nro_oc}</a>`;
            } else if (tipoDoc === 'OC' && nro_fac && nro_fac !== '-') {
                if (c.FacturaUuid) {
                    trazaHtml = `<a href="javascript:void(0)" onclick="openVisor('/factura_visor.html?uid=${c.FacturaUuid}', 'Factura ${nro_fac}')" style="font-size:0.75rem; color:#2563eb; text-decoration:underline;">📄 Fact: ${nro_fac}</a>`;
                } else {
                    trazaHtml = `<span style="font-size:0.75rem; color:#64748b;">📄 Fact: <b>${nro_fac}</b></span>`;
                }
            } else if (tipoDoc === 'Rendición' && nro_oc) {
                const ocUrl3 = '/oc_visor.html?nrodoc=' + encodeURIComponent(nro_oc) + '&codcia=' + encodeURIComponent(codcia) + '&tipooc=' + encodeURIComponent(c.TipoOc || 'O');
                trazaHtml = `<a href="javascript:void(0)" onclick="openVisor('${ocUrl3}', 'OC ${nro_oc}')" style="font-size:0.75rem; color:#8b5cf6; text-decoration:underline;">📦 OC: ${nro_oc}</a>`;
            }

            // Formato importes
            const fmtMonto = (v) => `<span style="${v < 0 ? 'color:#ef4444; font-weight:700;' : ''}">${simbolo} ${v.toLocaleString('es-PE', {minimumFractionDigits: 2})}</span>`;

            // Botones — escapar comillas simples del proveedor
            const provEsc = (c.Proveedor || '').replace(/'/g, "\\'");
            let btnHtml = '';
            if (isNC) {
                btnHtml = `<button class="btn-action" style="padding:0.25rem 0.5rem; font-size:0.7rem; background:#ef4444; color:white;" onclick="abrirModalAplicarNC('${c.DetalleId}', '${provEsc}', '${c.NroFactura||''}', ${importePagar}, '${moneda}', '${codcia}')">✅ Aplicar NC</button>`;
            } else {
                btnHtml = `<button class="btn-action primary" style="padding:0.25rem 0.5rem; font-size:0.7rem;" onclick="openModalPagoFlexible('${c.DetalleId}', '${c.TipoDocumento||'OC'}', '${codcia}', '${c.NroOrdenCompra||''}', '${c.TipoOc||''}', '${provEsc}', '${c.NroFactura||''}', ${importePagar}, '${moneda}')">💸 Pagar</button>`;
                btnHtml += `<br><button class="btn-action" style="padding:0.2rem 0.4rem; font-size:0.65rem; background:#10b981; color:white; margin-top:2px;" onclick="openModalPagoFlexible('${c.DetalleId}', '${c.TipoDocumento||'OC'}', '${codcia}', '${c.NroOrdenCompra||''}', '${c.TipoOc||''}', '${provEsc}', '${c.NroFactura||''}', 0, '${moneda}', true)">✅ Aplicar</button>`;
            }

            // 13 columnas
            return [
                `<input type="checkbox" class="chk-pago" data-id="${c.DetalleId}" data-moneda="${moneda}" data-monto="${importePagar}" style="transform:scale(1.2); cursor:pointer;">`,
                `<span class="${tipoClass}">${tipoLabel}</span>`,
                docHtml,
                fechaEmision ? `<span style="font-size:0.78rem;">${fechaEmision}</span>` : '<span style="color:#cbd5e1;">—</span>',
                fechaVencimiento ? `<span style="font-size:0.78rem;">${fechaVencimiento}</span>` : '<span style="color:#cbd5e1;">—</span>',
                diasVencHtml,
                provHtml,
                `<span style="font-weight:700; color:${moneda === 'USD' ? '#d97706' : '#1e40af'}">${moneda === 'USD' ? 'Dólares' : 'Soles'}</span>`,
                fmtMonto(importePagar),
                fmtMonto(saldo),
                trazaHtml,
                `<span class="badge pending">${c.NroCargo || '-'}</span>`,
                btnHtml
            ];
        });

        pendientesDT = $('#pendientesTable').DataTable({
            data: dtData, destroy: true,
            deferRender: true, order: [[4, 'asc']], pageLength: 15,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: '<"top-controls"Bf>rtip',
            buttons: [
                { extend: 'excelHtml5', text: '📊 Exportar', className: 'dt-button', exportOptions: { columns: [1,2,3,4,5,6,7,8,9,10,11] } },
                { text: '💸 Pagar Seleccionados', className: 'dt-button btn-pay-multi', action: function() { abrirPagoMultiple(); } }
            ],
            columnDefs: [
                { targets: [0, 12], orderable: false, width: '40px' },
                { targets: [5], className: 'dt-center' },
                { targets: [8, 9], className: 'dt-right' }
            ]
        });
        $('.btn-pay-multi').css({'background': '#10b981', 'color': 'white', 'border': 'none', 'font-weight': '700'});

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="13" style="color:#ef4444; text-align:center; padding:2rem;">${err}</td></tr>`;
    }
}

// ════════════════════════════════════════════════════════════
//  TAB 2: HISTORIAL DE PAGOS
// ════════════════════════════════════════════════════════════

async function loadHistorialPagos() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) return;

    if (historialPagosDT) { historialPagosDT.destroy(); historialPagosDT = null; }
    const tbody = document.getElementById('historialPagosTbody');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:2rem; color:#94a3b8;">Cargando...</td></tr>';

    try {
        const res = await axios.get(`/api/cargos/pagos/historial?codcia=${encodeURIComponent(codcia)}`);
        const items = res.data;

        // Stats — separar por moneda
        document.getElementById('statPagados').textContent = items.length;
        let totalPagPEN = 0, totalPagUSD = 0;
        items.forEach(i => {
            const m = parseFloat(i.MontoPago || 0);
            if (i.Moneda === 'USD') totalPagUSD += m;
            else totalPagPEN += m;
        });
        let montoText = '';
        if (totalPagPEN !== 0) montoText += `S/ ${totalPagPEN.toLocaleString('es-PE', {minimumFractionDigits: 2})}`;
        if (totalPagUSD !== 0) {
            if (montoText) montoText += ' + ';
            montoText += `$ ${totalPagUSD.toLocaleString('es-PE', {minimumFractionDigits: 2})}`;
        }
        if (!montoText) montoText = 'S/ 0.00';
        document.getElementById('statMontoPagado').textContent = montoText;

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:2rem; color:#94a3b8;">No hay pagos registrados.</td></tr>';
            return;
        }

        const tipoDocMap = { '01': 'Factura', '03': 'Boleta', '07': 'Nota Crédito', '87': 'NC Especial', '08': 'Nota Débito', '02': 'Rec. Hon.', '00': 'Otros' };

        const dtData = items.map(p => {
            let adjBadge = '<span style="color:#94a3b8; font-size:0.75rem;">Sin adjuntos</span>';
            if (p.Adjuntos && p.Adjuntos.length > 0) {
                const links = p.Adjuntos.map(a => {
                    const url = `/api/cargos/pagos/adjunto/${a.AdjuntoId}`;
                    return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px;" title="${a.ArchivoNombre}">📄 ${a.ArchivoNombre}</span>
                                <a href="javascript:void(0)" onclick="openVisor('${url}', '${a.ArchivoNombre.replace(/'/g, "\\'")}')" style="background:#f1f5f9; color:#2563eb; padding:2px 8px; border-radius:4px; text-decoration:none; font-size:0.7rem; font-weight:600; border:1px solid #cbd5e1;">Ver 👁</a>
                            </div>`;
                }).join('');
                adjBadge = `<div style="font-size:0.75rem;">${links}</div>`;
            }
            const simbolo = p.Moneda === 'USD' ? '$' : 'S/';
            const isNC = (p.TipoComprobante === '07' || p.TipoComprobante === '87');
            const tipLabel = tipoDocMap[p.TipoComprobante] || (p.TipoDocumento === 'RENDICION' ? 'Rendición' : 'OC');
            const montoVal = parseFloat(p.MontoPago || 0);
            const montoColor = montoVal < 0 ? '#ef4444' : 'inherit';

            return [
                `<strong>${p.NroOrdenCompra || '-'}</strong>`,
                `${p.Proveedor || '-'}<br><small style="color:#64748b;">${p.RucProveedor || '-'}</small>`,
                `<span style="font-size:0.7rem; color:#64748b;">${tipLabel}</span><br><strong>${p.NroFactura || '-'}</strong>`,
                `<span style="font-weight:600;">${p.BancoPago || '-'}</span>`,
                p.TipoPago || '-',
                `<span style="font-size:0.8rem;">${p.ConceptoPago || '-'}</span>`,
                `<code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${p.NroOperacion || '-'}</code>`,
                p.FechaPago || '-',
                `<span style="font-weight:700; color:${p.Moneda === 'USD' ? '#d97706' : '#1e40af'}">${p.Moneda === 'USD' ? 'Dólares' : 'Soles'}</span>`,
                `<span style="font-weight:700; color:${montoColor};">${simbolo} ${montoVal.toLocaleString('es-PE', {minimumFractionDigits: 2})}</span>`,
                p.UsuarioRegistro || '-',
                adjBadge
            ];
        });

        historialPagosDT = $('#historialPagosTable').DataTable({
            data: dtData, destroy: true,
            deferRender: true, order: [[7, 'desc']], pageLength: 15,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: 'Bfrtip',
            buttons: [{ extend: 'excelHtml5', text: '📊 Exportar Pagos', className: 'dt-button', exportOptions: { columns: [0,1,2,3,4,5,6,7,8,9,10] } }],
            columnDefs: [
                { targets: [9], className: 'dt-right font-semibold text-slate-800' }
            ]
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" style="color:#ef4444; text-align:center; padding:2rem;">${err}</td></tr>`;
    }
}

// ════════════════════════════════════════════════════════════
//  VISOR DE DOCUMENTOS
// ════════════════════════════════════════════════════════════
function abrirVisor(url, filename) {
    const modal = document.getElementById('modalVisor');
    const iframe = document.getElementById('visorIframe');
    const title = document.getElementById('modalVisorTitle');
    
    if (modal && iframe) {
        title.textContent = filename ? `Visor - ${filename}` : 'Visor de Documento';
        
        // If it's an image, we might want to wrap it or just rely on the browser's default behavior in the iframe.
        // For simplicity, assigning the URL directly to the iframe works for PDFs and images.
        iframe.src = url;
        modal.classList.add('active');
    }
}


// ════════════════════════════════════════════════════════════
//  MODAL DE PAGO
// ════════════════════════════════════════════════════════════

function openModalPago(detalleId, codcia, nrodoc, tipooc, proveedor, factura, monto, moneda) {
    document.getElementById('pago_idDetalle').value = detalleId;
    document.getElementById('pago_codcia').value = codcia;
    document.getElementById('pago_nrodoc').value = nrodoc;
    document.getElementById('pago_tipooc').value = tipooc || 'O';

    // Fill form defaults
    document.getElementById('pago_fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('pago_moneda').value = moneda || 'PEN';
    document.getElementById('pago_banco').value = 'BCP';
    document.getElementById('pago_tipo').value = 'TRANSFERENCIA';
    document.getElementById('pago_nro_operacion').value = '';
    document.getElementById('pago_monto').value = monto || '';
    document.getElementById('pago_adjuntos').value = '';
    document.getElementById('pago_notas').value = '';

    // Show summary
    document.getElementById('modalPagoTitle').textContent = `Pago — OC ${nrodoc}`;
    document.getElementById('pagoResumen').innerHTML = `
        <div style="display:grid; grid-template-columns: 80px 1fr; gap:0.2rem 0.75rem;">
            <span style="font-weight:600; color:#64748b;">OC:</span><span style="font-weight:700;">${nrodoc}</span>
            <span style="font-weight:600; color:#64748b;">Proveedor:</span><span>${proveedor}</span>
            <span style="font-weight:600; color:#64748b;">Factura:</span><span>${factura || '-'}</span>
            <span style="font-weight:600; color:#64748b;">Monto:</span><span style="font-weight:700; color:var(--primary);">S/ ${parseFloat(monto||0).toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
        </div>`;

    document.getElementById('modalPago').classList.add('active');
}

async function submitPago() {
    const idDetalle = document.getElementById('pago_idDetalle').value; // puede ser varios IDs por comas
    const codcia = document.getElementById('filterCia').value;
    if (!document.getElementById('pago_banco').value) {
        Swal.fire('Atención', 'Debe seleccionar una cuenta bancaria.', 'warning');
        return;
    }
    if (!document.getElementById('pago_tipo').value) {
        Swal.fire('Atención', 'Debe seleccionar un medio de pago.', 'warning');
        return;
    }

    let formData = new FormData();
    formData.append('usuario', currentUser);
    formData.append('moneda', document.getElementById('pago_moneda').value);
    formData.append('monto', document.getElementById('pago_monto').value);
    formData.append('banco', document.getElementById('pago_banco').value);
    formData.append('tipo', document.getElementById('pago_tipo').value);
    formData.append('fecha', document.getElementById('pago_fecha').value);
    formData.append('nro_operacion', document.getElementById('pago_nro_operacion').value);
    formData.append('notas', document.getElementById('pago_notas').value);
    
    const conceptoEl = document.getElementById('pago_concepto');
    if(conceptoEl) formData.append('concepto_pago', conceptoEl.value);

    // Usar uploadedFiles[] en vez del input file
    for (let i = 0; i < uploadedFiles.length; i++) {
        formData.append('archivos', uploadedFiles[i]);
    }

    formData.append('detalle_ids', idDetalle);
    formData.append('codcia', codcia);

    try {
        document.getElementById('modalPago').classList.remove('active');
        Swal.fire({title: 'Registrando Pago...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});

        await axios.post(`/api/cargos/pagos/registrar_multiples`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        Swal.fire({
            icon: 'success',
            title: '¡Pago Registrado!',
            text: 'El pago ha sido registrado exitosamente.',
            timer: 2500,
            showConfirmButton: false
        });
        uploadedFiles = [];
        loadPendientes();
        loadHistorialPagos();
    } catch (err) {
        Swal.fire('Error', String(err), 'error');
    }
}

async function openModalPagoFlexible(detalleIds, tipoDocumento, codcia, nrodoc, tipooc, proveedor, factura, montoPagar, moneda, isRegularizacion = false) {
    document.getElementById('pago_idDetalle').value = detalleIds;
    document.getElementById('pago_codcia').value = codcia;
    document.getElementById('pago_nrodoc').value = nrodoc;
    document.getElementById('pago_tipooc').value = tipooc || 'O';

    // Reset archivos
    uploadedFiles = [];
    renderFilePreview();

    // Cargar parámetros si no están cargados
    if (paramBancos.length === 0) await loadParametros();

    // Fill form defaults
    document.getElementById('pago_fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('pago_nro_operacion').value = '';
    document.getElementById('pago_notas').value = '';

    // Set moneda
    document.getElementById('pago_moneda').value = moneda || 'PEN';

    // Pre-seleccionar primer banco que coincida con la moneda del documento
    const bancoSelect = document.getElementById('pago_banco');
    bancoSelect.value = '';
    const targetCodMon = moneda === 'USD' ? '2' : '1';
    for (let i = 0; i < bancoSelect.options.length; i++) {
        const opt = bancoSelect.options[i];
        if (opt.getAttribute('data-codmon') === targetCodMon) {
            bancoSelect.value = opt.value;
            break;
        }
    }
    onBancoChange();

    // Tipo de pago: default Transferencia
    const tipoSelect = document.getElementById('pago_tipo');
    if (tipoSelect) tipoSelect.value = 'TRANSFERENCIA';

    // Determinar label
    let docLabel = tipoDocumento, docNro = nrodoc;
    const sim = moneda === 'USD' ? '$' : 'S/';

    if (tipoDocumento === 'OC') { docLabel = 'OC'; docNro = nrodoc; }
    else if (tipoDocumento === 'FACTURA_SIN_OC' || tipoDocumento === 'FACTURA') { docLabel = 'Factura'; docNro = factura || nrodoc; }
    else if (tipoDocumento === 'RENDICION') { docLabel = 'Rendición'; docNro = nrodoc; }
    else if (tipoDocumento === 'MULTI') { docLabel = 'Múltiples Documentos'; docNro = nrodoc; }

    if (isRegularizacion) {
        montoPagar = 0;
        docLabel = 'Regularización';
    }

    document.getElementById('pago_monto').value = montoPagar || '';

    // Show summary
    const fmtMonto = (v) => `<span style="${v<0?'color:#ef4444;':''}">${sim} ${parseFloat(v||0).toLocaleString('es-PE',{minimumFractionDigits:2})}</span>`;
    let resumenHtml = `<div style="display:grid; grid-template-columns: 95px 1fr; gap:0.15rem 0.75rem;">`;
    resumenHtml += `<span style="font-weight:600; color:#64748b;">Tipo:</span><span class="badge ${tipoDocumento==='OC'?'pending':'success'}" style="justify-self:start;">${docLabel}</span>`;
    resumenHtml += `<span style="font-weight:600; color:#64748b;">Documento:</span><span style="font-weight:700;">${docNro}</span>`;
    resumenHtml += `<span style="font-weight:600; color:#64748b;">Proveedor:</span><span>${proveedor}</span>`;
    const monedaLabel = moneda === 'USD' ? 'Dólares' : 'Soles';
    resumenHtml += `<span style="font-weight:600; color:#64748b;">Moneda:</span><span style="font-weight:700; color:${moneda==='USD'?'#d97706':'#1e40af'};">${monedaLabel}</span>`;

    if (tipoDocumento === 'OC') {
        if (factura) resumenHtml += `<span style="font-weight:600; color:#64748b;">Factura:</span><span>${factura}</span>`;
        resumenHtml += `<span style="font-weight:600; color:#64748b;">A Pagar:</span><span style="font-weight:700; color:var(--primary);">${fmtMonto(montoPagar)}</span>`;
    } else if (tipoDocumento === 'FACTURA_SIN_OC' || tipoDocumento === 'FACTURA') {
        resumenHtml += `<span style="font-weight:600; color:#64748b;">Importe:</span><span style="font-weight:700; color:var(--primary);">${fmtMonto(montoPagar)}</span>`;
    } else if (tipoDocumento === 'RENDICION') {
        resumenHtml += `<span style="font-weight:600; color:#64748b;">Reembolso:</span><span style="font-weight:700; color:var(--primary);">${fmtMonto(montoPagar)}</span>`;
    } else {
        resumenHtml += `<span style="font-weight:600; color:#64748b;">A Pagar:</span><span style="font-weight:700; color:var(--primary);">${fmtMonto(montoPagar)}</span>`;
    }
    resumenHtml += `</div>`;

    document.getElementById('modalPagoTitle').textContent = `💳 Pago — ${docLabel} ${docNro}`;
    document.getElementById('pagoResumen').innerHTML = resumenHtml;

    // Campo oculto tipo documento
    if (!document.getElementById('pago_tipo_documento')) {
        const inputHidden = document.createElement('input');
        inputHidden.type = 'hidden';
        inputHidden.id = 'pago_tipo_documento';
        inputHidden.name = 'tipo_documento';
        document.getElementById('formPago').appendChild(inputHidden);
    }
    document.getElementById('pago_tipo_documento').value = tipoDocumento;

    document.getElementById('modalPago').classList.add('active');
}

function abrirPagoMultiple() {
    const seleccionados = $('.chk-pago:checked');
    if (seleccionados.length === 0) {
        Swal.fire('Atención', 'Seleccione al menos un documento para pagar', 'warning');
        return;
    }
    let monedaUnica = null;
    let errorMoneda = false;
    let sumaPagar = 0;
    let ids = [];

    seleccionados.each(function() {
        const id = $(this).data('id');
        const mon = $(this).data('moneda');
        const monto = parseFloat($(this).data('monto') || 0);

        if (monedaUnica === null) monedaUnica = mon;
        else if (monedaUnica !== mon) errorMoneda = true;

        ids.push(id);
        sumaPagar += monto;
    });

    if (errorMoneda) {
        Swal.fire('Error', 'Todos los documentos seleccionados deben tener la misma moneda para el pago por lote.', 'error');
        return;
    }

    openModalPagoFlexible(ids.join(','), 'MULTI', document.getElementById('filterCia').value, seleccionados.length + ' Docs', 'MULTI', 'Múltiples Proveedores', '', sumaPagar, monedaUnica);
}

// ════════════════════════════════════════════════════════════
//  VISOR MODAL (IFRAME)
// ════════════════════════════════════════════════════════════
function openVisor(url, title) {
    document.getElementById('modalVisorTitle').textContent = `Visor — ${title}`;
    document.getElementById('visorIframe').src = url;
    document.getElementById('modalVisor').classList.add('active');
}

// ════════════════════════════════════════════════════════════
//  APLICAR NOTA DE CRÉDITO A FACTURA
// ════════════════════════════════════════════════════════════
async function abrirModalAplicarNC(detalleId, proveedor, facturaNC, montoNC, moneda, codcia) {
    document.getElementById('ncDetalleId').value = detalleId;
    document.getElementById('ncMonto').value = montoNC;
    document.getElementById('ncMoneda').value = moneda;
    document.getElementById('ncCodCia').value = codcia;

    document.getElementById('ncInfoCard').innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <span style="font-size:0.75rem; color:#64748b; font-weight:700;">NOTA DE CRÉDITO</span><br>
                <span style="font-size:1rem; font-weight:700; color:#1e293b;">${facturaNC || 'S/N'}</span>
            </div>
            <div style="text-align:right;">
                <span style="font-size:0.75rem; color:#64748b;">Monto a Favor</span><br>
                <span style="font-size:1.1rem; font-weight:700; color:#ef4444;">${moneda === 'USD' ? '$' : 'S/'} ${Math.abs(montoNC).toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
            </div>
        </div>
        <div style="margin-top:0.5rem; font-size:0.8rem; color:#475569;">
            <strong>Proveedor:</strong> ${proveedor}
        </div>
    `;

    document.getElementById('ncFacturasTbody').innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem; color:#64748b;">Cargando facturas...</td></tr>';
    document.getElementById('modalAplicarNC').classList.add('active');

    try {
        const res = await axios.get(`/api/cargos/pagos/pendientes?codcia=${encodeURIComponent(codcia)}`);
        const items = res.data;
        
        let html = '';
        items.forEach(c => {
            // Filtrar solo facturas (no NC) del mismo proveedor y misma moneda
            const isNC = (c.TipoComprobante === '07' || c.TipoComprobante === '87');
            // Regex to compare provider avoiding escaping issues
            if (!isNC && c.Proveedor === proveedor && c.Moneda === moneda) {
                const importeFactura = parseFloat(c.ImportePrincipal || 0);
                html += `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:0.75rem; text-align:center;">
                        <input type="checkbox" class="chk-nc-factura" data-id="${c.DetalleId}" data-monto="${importeFactura}" style="transform:scale(1.2); cursor:pointer;">
                    </td>
                    <td style="padding:0.75rem;">
                        <strong>${c.NroDocPrincipal || '-'}</strong><br>
                        <span style="font-size:0.7rem; color:#64748b;">Factura ${c.NroFactura || ''}</span>
                    </td>
                    <td style="padding:0.75rem; color:#475569;">${c.Moneda}</td>
                    <td style="padding:0.75rem; text-align:right; font-weight:700; color:#1e40af;">
                        ${moneda === 'USD' ? '$' : 'S/'} ${importeFactura.toLocaleString('es-PE',{minimumFractionDigits:2})}
                    </td>
                </tr>
                `;
            }
        });
        
        if (!html) html = '<tr><td colspan="4" style="text-align:center; padding:1rem; color:#ef4444;">No se encontraron facturas pendientes para este proveedor.</td></tr>';
        document.getElementById('ncFacturasTbody').innerHTML = html;

    } catch (err) {
        document.getElementById('ncFacturasTbody').innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1rem; color:#ef4444;">${err.message}</td></tr>`;
    }
}

function confirmarAplicacionNC() {
    const seleccionados = $('.chk-nc-factura:checked');
    if (seleccionados.length === 0) {
        Swal.fire('Atención', 'Seleccione al menos una factura para aplicar la nota de crédito.', 'warning');
        return;
    }
    
    let sumaPagar = parseFloat(document.getElementById('ncMonto').value);
    let ids = [document.getElementById('ncDetalleId').value];
    
    seleccionados.each(function() {
        ids.push($(this).data('id'));
        sumaPagar += parseFloat($(this).data('monto') || 0);
    });
    
    document.getElementById('modalAplicarNC').classList.remove('active');
    
    // Abrir el modal flexible con la suma neta para pagar (o 0 si se cancelan)
    openModalPagoFlexible(ids.join(','), 'MULTI', document.getElementById('ncCodCia').value, seleccionados.length + ' Facturas + NC', 'MULTI', 'Múltiples', '', sumaPagar, document.getElementById('ncMoneda').value, sumaPagar === 0);
}
