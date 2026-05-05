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
            const montoPagado = parseFloat(c.MontoPagado || 0);
            const saldo = importePagar - montoPagado;

            // Tipo OC Label
            let tipoOcBadge = '';
            const tOc = (c.TipoOc || '').trim();
            if (tOc === 'M') tipoOcBadge = `<span style="font-size:0.65rem; background:#eff6ff; color:#2563eb; padding:1px 6px; border-radius:12px; font-weight:600; border:1px solid #bfdbfe; margin-left:4px;">📦 Mercadería</span>`;
            else if (tOc === 'S') tipoOcBadge = `<span style="font-size:0.65rem; background:#f0fdf4; color:#16a34a; padding:1px 6px; border-radius:12px; font-weight:600; border:1px solid #bbf7d0; margin-left:4px;">⚙️ Servicios</span>`;
            else if (tOc === 'T') tipoOcBadge = `<span style="font-size:0.65rem; background:#faf5ff; color:#9333ea; padding:1px 6px; border-radius:12px; font-weight:600; border:1px solid #e9d5ff; margin-left:4px;">🗂️ Contable</span>`;

            // Badge
            let tipoClass = 'badge pending';
            if (tipoDoc === 'Factura' || tipoDoc === 'Boleta') tipoClass = 'badge success';
            if (tipoDoc === 'Rendición') tipoClass = 'badge success';
            if (isNC || tipoDoc === 'Nota Crédito' || tipoDoc === 'NC Especial') tipoClass = 'badge nc';
            
            // The backend is already translating TipoComprobante via AlmTabla 0006
            let tipoLabel = c.TipoComprobante || (isNC ? (tipoDocMap[c.TipoComprobante] || tipoDoc) : tipoDoc);
            if (c.TipoDocumento === 'RENDICION') tipoLabel = 'Rendición';

            let badgeHtml = `<span class="${tipoClass}" title="${c.TipoDocumento || ''}">${tipoLabel}</span>${tipoOcBadge ? '<br>'+tipoOcBadge : ''}`;

            // Documento principal con enlace
            let docHtml = `<strong>${c.NroDocPrincipal || '-'}</strong>`;
            const linkColor = isNC ? '#ef4444' : '#2563eb';
            if (c.FacturaUuid && tipoDoc !== 'OC' && tipoDoc !== 'Rendición') {
                docHtml = `<a href="javascript:void(0)" onclick="openVisor('/factura_visor.html?uid=${c.FacturaUuid}', '${tipoLabel} ${c.NroDocPrincipal}')" style="color:${linkColor}; text-decoration:underline; font-weight:700;">📄 ${c.NroDocPrincipal}</a>`;
            } else if (tipoDoc === 'Rendición' && c.RendicionUuid) {
                docHtml = `<a href="javascript:void(0)" onclick="openVisor('/visor_rendicion.html?uuid=${c.RendicionUuid}', 'Rendición ${c.NroDocPrincipal}')" style="color:#059669; text-decoration:underline; font-weight:700;">📋 ${c.NroDocPrincipal || c.NroRendicion}</a>`;
            } else if (tipoDoc === 'OC' && c.NroOrdenCompra) {
                const ocUrl = '/oc_visor.html?nrodoc=' + encodeURIComponent(c.NroOrdenCompra) + '&codcia=' + encodeURIComponent(codcia) + '&tipooc=' + encodeURIComponent(tOc || 'O');
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
            const esRendicionOC = nro_oc.startsWith('RG-') || nro_oc.startsWith('RE-') || tipoDoc === 'Rendición';
            
            if (esRendicionOC) {
                if (c.RendicionUuid) {
                    trazaHtml = `<a href="javascript:void(0)" onclick="openVisor('/visor_rendicion.html?uuid=${c.RendicionUuid}', 'Rendición ${nro_oc}')" style="font-size:0.75rem; color:#059669; text-decoration:underline;">📋 Rendición: ${nro_oc}</a>`;
                } else {
                    trazaHtml = `<span style="font-size:0.75rem; color:#059669;">📋 Rendición: ${nro_oc}</span>`;
                }
            } else if (nro_oc && nro_oc !== '-') {
                // Para OCs y Facturas provenientes de OC (doble botón)
                const ocUrl2 = '/oc_visor.html?nrodoc=' + encodeURIComponent(nro_oc) + '&codcia=' + encodeURIComponent(codcia) + '&tipooc=' + encodeURIComponent(tOc || 'O');
                const anosOc = c.AnosOc || '';
                trazaHtml = `
                <div style="display:flex; flex-direction:column; gap:4px; max-width:140px;">
                    <a href="javascript:void(0)" onclick="openVisor('${ocUrl2}', 'OC ${nro_oc}')" style="font-size:0.7rem; color:#8b5cf6; text-decoration:none; background:#f5f3ff; border:1px solid #ddd6fe; padding:2px 6px; border-radius:4px; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
                        <span>📦 OC: ${nro_oc}</span><span style="font-size:0.6rem;">📄</span>
                    </a>
                    <a href="javascript:void(0)" onclick="openTrazaModal('${codcia}', '${nro_oc}', '${tOc}', '${anosOc}')" style="font-size:0.7rem; color:#0f172a; text-decoration:none; background:#f8fafc; border:1px solid #cbd5e1; padding:2px 6px; border-radius:4px; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
                        <span>Trazabilidad</span><span style="font-size:0.6rem;">👁‍🗨</span>
                    </a>
                </div>`;
            } else if (tipoDoc === 'OC' && nro_fac && nro_fac !== '-') {
                if (c.FacturaUuid) {
                    trazaHtml = `<a href="javascript:void(0)" onclick="openVisor('/factura_visor.html?uid=${c.FacturaUuid}', 'Factura ${nro_fac}')" style="font-size:0.75rem; color:#2563eb; text-decoration:underline;">📄 Fact: ${nro_fac}</a>`;
                } else {
                    trazaHtml = `<span style="font-size:0.75rem; color:#64748b;">📄 Fact: <b>${nro_fac}</b></span>`;
                }
            }

            // Formato importes
            const fmtMonto = (v) => `<span style="${v < 0 ? 'color:#ef4444; font-weight:700;' : ''}">${simbolo} ${v.toLocaleString('es-PE', {minimumFractionDigits: 2})}</span>`;

            // Botones — escapar comillas simples del proveedor
            const provEsc = (c.Proveedor || '').replace(/'/g, "\'");
            let btnHtml = '';
            if (isNC) {
                btnHtml = `<button class="btn-action" style="padding:0.25rem 0.5rem; font-size:0.7rem; background:#ef4444; color:white;" onclick="abrirModalAplicarNC('${c.DetalleId}', '${provEsc}', '${c.NroFactura||''}', ${saldo}, '${moneda}', '${codcia}')">✅ Aplicar NC</button>`;
            } else {
                btnHtml = `<button class="btn-action primary" style="padding:0.25rem 0.5rem; font-size:0.7rem;" onclick="openModalPagoFlexible('${c.DetalleId}', '${c.TipoDocumento||'OC'}', '${codcia}', '${c.NroOrdenCompra||''}', '${tOc||''}', '${provEsc}', '${c.NroFactura||''}', ${saldo}, '${moneda}')">💸 Pagar</button>`;
                btnHtml += `<br><button class="btn-action" style="padding:0.2rem 0.4rem; font-size:0.65rem; background:#10b981; color:white; margin-top:2px;" onclick="openModalPagoFlexible('${c.DetalleId}', '${c.TipoDocumento||'OC'}', '${codcia}', '${c.NroOrdenCompra||''}', '${tOc||''}', '${provEsc}', '${c.NroFactura||''}', 0, '${moneda}', true)">✅ Aplicar</button>`;
            }

            // 13 columnas
            return [
                `<input type="checkbox" class="chk-pago" data-id="${c.DetalleId}" data-moneda="${moneda}" data-monto="${saldo}" data-tipo-comp="${c.TipoComprobante || ''}" data-proveedor="${(c.Proveedor || '').replace(/"/g, '&quot;')}" data-ruc="${c.RucProveedor || ''}" data-nro-doc="${c.NroDocPrincipal || ''}" style="transform:scale(1.2); cursor:pointer;">`,
                `<span class="${tipoClass}">${tipoLabel}</span>${tipoOcBadge ? '<br>'+tipoOcBadge : ''}`,
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
                { text: '💸 Pagar Seleccionados', className: 'dt-button btn-pay-multi', action: function() { abrirPagoMultiple(); } },
                { text: '🔄 Aplicar Seleccionados', className: 'dt-button btn-apply-multi', action: function() { abrirAplicarSeleccionados(); } }
            ],
            columnDefs: [
                { targets: [0, 12], orderable: false, width: '40px' },
                { targets: [5], className: 'dt-center' },
                { targets: [8, 9], className: 'dt-right' }
            ]
        });
        $('.btn-pay-multi').css({'background': '#10b981', 'color': 'white', 'border': 'none', 'font-weight': '700'});
        $('.btn-apply-multi').css({'background': '#8b5cf6', 'color': 'white', 'border': 'none', 'font-weight': '700'});

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="13" style="color:#ef4444; text-align:center; padding:2rem;">${err}</td></tr>`;
    }
}

// ════════════════════════════════════════════════════════════
//  TAB 2: HISTORIAL DE PAGOS
// ════════════════════════════════════════════════════════════

window.filtrarPorLote = function(grupo) {
    if (historialPagosDT) {
        historialPagosDT.search(grupo).draw();
        
        // Agregar un mensaje de limpieza de filtro visual
        Swal.fire({
            toast: true,
            position: 'bottom-end',
            icon: 'info',
            title: 'Filtrando por Lote de Aplicación',
            text: 'Borra el texto en el buscador de la tabla para ver todos los pagos.',
            showConfirmButton: false,
            timer: 4000
        });
    }
};

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
            const tipLabel = p.TipoComprobanteDesc || p.TipoComprobante || (p.TipoDocumento === 'RENDICION' ? 'Rendición' : 'OC');
            const montoVal = parseFloat(p.MontoPago || 0);
            const montoColor = montoVal < 0 ? '#ef4444' : 'inherit';

            // Banco display: show code + name from backend
            const bancoHtml = p.BancoDisplay
                ? `<span style="font-weight:600; font-size:0.78rem;">${p.BancoDisplay}</span>`
                : `<span style="color:#94a3b8;">—</span>`;

            // Concepto display: show code + name from backend
            const conceptoHtml = p.ConceptoDisplay
                ? `<span style="font-size:0.78rem;">${p.ConceptoDisplay}</span>`
                : `<span style="color:#94a3b8;">—</span>`;

            // Action buttons: Edit + Delete + Visor
            const pagoId = p.PagoId;
            const safeProveedor = (p.Proveedor || '').replace(/'/g, "\\'");
            let actionBtns = '';
            actionBtns += `<div style="display:flex; gap:4px; align-items:center; justify-content:center; flex-wrap:nowrap;">`;
            if (p.PagoUuid) {
                actionBtns += `<a href="/pago_visor.html?uid=${p.PagoUuid}" target="_blank" title="Ver constancia" style="display:inline-flex;align-items:center;padding:4px 8px;background:linear-gradient(135deg,#059669,#10b981);color:white;border-radius:6px;text-decoration:none;font-size:0.68rem;font-weight:600;gap:3px;border:none;cursor:pointer;">🔗</a>`;
            }
            actionBtns += `<button onclick="editarPago('${p.PagoUuid}', ${pagoId})" title="Editar pago" style="display:inline-flex;align-items:center;padding:4px 8px;background:linear-gradient(135deg,#2563eb,#3b82f6);color:white;border-radius:6px;font-size:0.68rem;font-weight:600;border:none;cursor:pointer;gap:3px;">✏️</button>`;
            actionBtns += `<button onclick="eliminarPago(${pagoId}, '${safeProveedor}', ${montoVal})" title="Eliminar pago" style="display:inline-flex;align-items:center;padding:4px 8px;background:linear-gradient(135deg,#dc2626,#ef4444);color:white;border-radius:6px;font-size:0.68rem;font-weight:600;border:none;cursor:pointer;gap:3px;">🗑️</button>`;
            actionBtns += `</div>`;

            return [
                `<div style="font-size:0.7rem; color:#94a3b8; margin-bottom:2px;">#${pagoId}</div><strong>${p.NroOrdenCompra || '-'}</strong>`,
                `${p.Proveedor || '-'}<br><small style="color:#64748b;">${p.RucProveedor || '-'}</small>`,
                `<span style="font-size:0.7rem; color:#64748b;">${tipLabel}</span><br><strong>${p.NroFactura || '-'}</strong>${p.GrupoAplicacion ? '<br><div style="display:flex;gap:4px;margin-top:2px;align-items:center;"><a href="/pago_visor.html?uid='+p.PagoUuid+'" target="_blank" style="font-size:0.65rem; background:#8b5cf6; color:white; padding:2px 5px; border-radius:4px; text-decoration:none;" title="Ver constancia de aplicación conjunta">🔗 Constancia</a><button onclick="filtrarPorLote(\''+p.GrupoAplicacion+'\')" style="font-size:0.65rem; background:#f3f4f6; color:#4b5563; padding:2px 5px; border:1px solid #d1d5db; border-radius:4px; cursor:pointer;" title="Filtrar tabla por este lote">🔍 Filtrar Tabla</button><span style="display:none;">' + p.GrupoAplicacion + '</span></div>' : ''}`,
                bancoHtml,
                p.TipoPago || '-',
                conceptoHtml,
                `<code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${p.NroOperacion || '-'}</code>`,
                p.FechaPago || '-',
                `<span style="font-weight:700; color:${p.Moneda === 'USD' ? '#d97706' : '#1e40af'}">${p.Moneda === 'USD' ? 'Dólares' : 'Soles'}</span>`,
                `<span style="font-weight:700; color:${montoColor};">${simbolo} ${montoVal.toLocaleString('es-PE', {minimumFractionDigits: 2})}</span>`,
                p.UsuarioRegistro || '-',
                adjBadge,
                actionBtns
            ];
        });

        historialPagosDT = $('#historialPagosTable').DataTable({
            data: dtData, destroy: true,
            deferRender: true, order: [[7, 'desc']], pageLength: 15,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: 'Bfrtip',
            buttons: [{ extend: 'excelHtml5', text: '📊 Exportar Pagos', className: 'dt-button', exportOptions: { columns: [0,1,2,3,4,5,6,7,8,9,10] } }],
            columnDefs: [
                { targets: [9], className: 'dt-right font-semibold text-slate-800' },
                { targets: [12], orderable: false, className: 'dt-center' }
            ]
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" style="color:#ef4444; text-align:center; padding:2rem;">${err}</td></tr>`;
    }
}

// ════════════════════════════════════════════════════════════
//  EDITAR / ELIMINAR PAGOS
// ════════════════════════════════════════════════════════════

async function editarPago(pagoUuid, pagoId) {
    if (!pagoUuid || pagoUuid === 'undefined') {
        Swal.fire('Error', 'Este pago no tiene UUID público asociado.', 'error');
        return;
    }
    try {
        // Obtenemos los datos actuales del pago
        const res = await axios.get(`/api/cargos/pagos/public/${pagoUuid}`);
        const pago = res.data;

        // Necesitamos asegurarnos que los parámetros estén cargados
        if (paramBancos.length === 0) await loadParametros();

        let formHtml = `
            <div style="text-align:left; font-size:0.85rem;">
                <div style="margin-bottom:1rem;">
                    <label style="font-weight:600; display:block; margin-bottom:0.25rem;">Banco / Cuenta</label>
                    <select id="editPagoBanco" class="swal2-select" style="width:100%; max-width:100%; margin:0; padding:0.5rem; font-size:0.85rem;">
                        <option value="">Seleccione...</option>
                        ${paramBancos.map(b => `<option value="${b.Codigo}" ${b.Codigo.trim() === (pago.BancoPago||'').trim() ? 'selected' : ''}>${b.Descripcion}</option>`).join('')}
                    </select>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-weight:600; display:block; margin-bottom:0.25rem;">Medio de Pago</label>
                    <select id="editPagoTipo" class="swal2-select" style="width:100%; max-width:100%; margin:0; padding:0.5rem; font-size:0.85rem;">
                        <option value="">Seleccione...</option>
                        ${paramTiposPago.map(t => `<option value="${t.Codigo}" ${t.Codigo.trim() === (pago.TipoPago||'').trim() ? 'selected' : ''}>${t.Descripcion}</option>`).join('')}
                    </select>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-weight:600; display:block; margin-bottom:0.25rem;">Concepto de Pago</label>
                    <select id="editPagoConcepto" class="swal2-select" style="width:100%; max-width:100%; margin:0; padding:0.5rem; font-size:0.85rem;">
                        <option value="">Seleccione...</option>
                        ${paramConceptos.map(c => `<option value="${c.Codigo}" ${c.Codigo.trim() === (pago.ConceptoPago||'').trim() ? 'selected' : ''}>${c.Descripcion}</option>`).join('')}
                    </select>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-weight:600; display:block; margin-bottom:0.25rem;">Nro Operación / Referencia</label>
                    <input type="text" id="editPagoNroOp" class="swal2-input" style="width:100%; max-width:100%; margin:0; font-size:0.85rem; height:auto; padding:0.5rem;" value="${pago.NroOperacion || ''}">
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-weight:600; display:block; margin-bottom:0.25rem;">Fecha de Pago</label>
                    <input type="date" id="editPagoFecha" class="swal2-input" style="width:100%; max-width:100%; margin:0; font-size:0.85rem; height:auto; padding:0.5rem;" value="${(pago.FechaPago || '').substring(0, 10)}">
                </div>
                <div>
                    <label style="font-weight:600; display:block; margin-bottom:0.25rem;">Monto a Pagar (${pago.Moneda})</label>
                    <input type="number" step="0.01" id="editPagoMonto" class="swal2-input" style="width:100%; max-width:100%; margin:0; font-size:0.85rem; height:auto; padding:0.5rem;" value="${pago.MontoPago || ''}">
                </div>
            </div>
        `;

        const { value: formValues } = await Swal.fire({
            title: `Editar Pago #${pagoId}`,
            html: formHtml,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Guardar Cambios',
            cancelButtonText: 'Cancelar',
            customClass: { confirmButton: 'btn-action primary', cancelButton: 'btn-action outline' },
            preConfirm: () => {
                const banco = document.getElementById('editPagoBanco').value;
                const tipo = document.getElementById('editPagoTipo').value;
                const concepto = document.getElementById('editPagoConcepto').value;
                const nroOp = document.getElementById('editPagoNroOp').value;
                const fecha = document.getElementById('editPagoFecha').value;
                const monto = document.getElementById('editPagoMonto').value;
                if (!banco || !tipo || !monto || !fecha) {
                    Swal.showValidationMessage('Banco, Tipo, Fecha y Monto son obligatorios');
                    return false;
                }
                return { banco, tipo, concepto_pago: concepto, nro_operacion: nroOp, fecha, monto: parseFloat(monto) };
            }
        });

        if (formValues) {
            Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            await axios.put(`/api/cargos/pagos/${pagoId}`, formValues);
            Swal.fire({ icon: 'success', title: 'Pago actualizado', timer: 1500, showConfirmButton: false });
            loadHistorialPagos();
        }

    } catch (err) {
        Swal.fire('Error', String(err), 'error');
    }
}

async function eliminarPago(pagoId, proveedor, monto) {
    const result = await Swal.fire({
        title: '¿Eliminar Pago?',
        html: `Está a punto de eliminar el pago <strong>#${pagoId}</strong>.<br><br>
               <strong>Proveedor:</strong> ${proveedor}<br>
               <strong>Monto:</strong> ${monto}<br><br>
               <span style="color:#ef4444;font-size:0.85rem;">⚠️ Esta acción eliminará permanentemente la constancia y sus adjuntos. El documento volverá al estado "PENDIENTE".</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar pago',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            Swal.fire({ title: 'Eliminando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            // Pasamos usuario (ej. currentUser)
            await axios.delete(`/api/cargos/pagos/${pagoId}?usuario=${encodeURIComponent(currentUser)}`);
            Swal.fire({ icon: 'success', title: 'Eliminado', text: 'El pago ha sido eliminado correctamente.', timer: 2000, showConfirmButton: false });
            
            // Refrescar ambas tablas
            loadHistorialPagos();
            loadPendientes();
        } catch (err) {
            Swal.fire('Error', String(err), 'error');
        }
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
//  APLICAR SELECCIONADOS (NC/Anticipo + Facturas)
// ════════════════════════════════════════════════════════════

let aplicarDocsData = { docsNC: [], docsFact: [], allDocs: [], ids: [], moneda: 'PEN', neto: 0 };
let aplicarDocsFiles = [];

function addAplicarFiles(fileList) {
    for (let i = 0; i < fileList.length; i++) {
        aplicarDocsFiles.push(fileList[i]);
    }
    renderAplicarFileList();
}

function removeAplicarFile(idx) {
    aplicarDocsFiles.splice(idx, 1);
    renderAplicarFileList();
}

function renderAplicarFileList() {
    const container = document.getElementById('aplicarDocsFileList');
    if (!container) return;
    if (aplicarDocsFiles.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = aplicarDocsFiles.map((f, i) => {
        const sizeKB = (f.size / 1024).toFixed(1);
        const icon = f.type.includes('pdf') ? '📄' : f.type.includes('image') ? '🖼️' : '📎';
        return `<div style="display:flex; align-items:center; gap:0.5rem; padding:0.35rem 0.5rem; background:#f1f5f9; border-radius:6px; margin-bottom:0.25rem; font-size:0.75rem;">
            <span>${icon}</span>
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</span>
            <span style="color:#94a3b8;">${sizeKB} KB</span>
            <button type="button" onclick="removeAplicarFile(${i})" style="background:none; border:none; cursor:pointer; color:#ef4444; font-weight:700; font-size:0.85rem;" title="Quitar">✕</button>
        </div>`;
    }).join('');
}

function recalcularAplicarNeto() {
    const sim = aplicarDocsData.moneda === 'USD' ? '$' : 'S/';
    let sumaNC = 0, sumaFact = 0;
    
    // Re-classify based on anticipo toggles
    aplicarDocsData.docsNC = [];
    aplicarDocsData.docsFact = [];
    
    aplicarDocsData.allDocs.forEach(d => {
        const toggleEl = document.getElementById(`anticipo_toggle_${d.id}`);
        const isAnticipo = toggleEl ? toggleEl.checked : false;
        const isNCOriginal = d.isNCOriginal;
        
        // Es NC/Anticipo si: es NC original O fue marcado como anticipo
        if (isNCOriginal || isAnticipo) {
            const montoNeg = isAnticipo ? -Math.abs(d.monto) : d.monto;
            aplicarDocsData.docsNC.push({ ...d, monto: montoNeg, esAnticipo: isAnticipo });
            sumaNC += montoNeg;
        } else {
            aplicarDocsData.docsFact.push(d);
            sumaFact += d.monto;
        }
    });
    
    const neto = sumaNC + sumaFact;
    aplicarDocsData.neto = neto;
    
    const netoColor = neto <= 0 ? '#10b981' : '#f59e0b';
    const netoLabel = neto <= 0 ? 'Se compensa totalmente (saldo a favor o cero)' : 'Queda un saldo pendiente por pagar';
    
    document.getElementById('aplicarDocsResumen').innerHTML = `
        <div style="display:flex; justify-content:space-around; margin-bottom:0.5rem;">
            <div><span style="font-size:0.7rem; color:#dc2626;">NC/Anticipos</span><br><strong style="color:#dc2626;">${sim} ${Math.abs(sumaNC).toLocaleString('es-PE', {minimumFractionDigits: 2})}</strong></div>
            <div style="font-size:1.2rem; color:#64748b; align-self:center;">→</div>
            <div><span style="font-size:0.7rem; color:#059669;">Facturas</span><br><strong style="color:#059669;">${sim} ${sumaFact.toLocaleString('es-PE', {minimumFractionDigits: 2})}</strong></div>
        </div>
        <div style="font-size:0.75rem; color:#64748b; margin-bottom:0.25rem;">Monto Neto Resultante</div>
        <div style="font-size:1.3rem; font-weight:800; color:${netoColor};">${sim} ${neto.toLocaleString('es-PE', {minimumFractionDigits: 2})}</div>
        <div style="font-size:0.7rem; color:#64748b; margin-top:0.25rem;">${netoLabel}</div>
    `;
    
    // Update document lists visual
    renderAplicarDocsLists();
}

function renderAplicarDocsLists() {
    const sim = aplicarDocsData.moneda === 'USD' ? '$' : 'S/';
    const fmtM = (v) => `${sim} ${Math.abs(v).toLocaleString('es-PE', {minimumFractionDigits: 2})}`;
    
    // NC List
    let ncHtml = '';
    if (aplicarDocsData.docsNC.length === 0) {
        ncHtml = '<div style="padding:0.5rem; text-align:center; color:#94a3b8; font-size:0.8rem; background:#fef2f2; border-radius:6px;">Sin documentos a favor. Active el toggle "Anticipo" en los documentos que desee usar como abono.</div>';
    } else {
        aplicarDocsData.docsNC.forEach(d => {
            const label = d.esAnticipo ? '⚡ ANTICIPO' : '📄 NC';
            const labelColor = d.esAnticipo ? '#d97706' : '#dc2626';
            ncHtml += `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0.6rem; background:#fef2f2; border-radius:6px; margin-bottom:4px; font-size:0.8rem;">
                <span style="font-weight:600; color:${labelColor};">${label}: ${d.nroDoc}</span>
                <span style="font-weight:700; color:#dc2626;">- ${fmtM(d.monto)}</span>
            </div>`;
        });
    }
    document.getElementById('aplicarDocsNCList').innerHTML = ncHtml;
    
    // Fact List
    let factHtml = '';
    if (aplicarDocsData.docsFact.length === 0) {
        factHtml = '<div style="padding:0.5rem; text-align:center; color:#94a3b8; font-size:0.8rem; background:#f0fdf4; border-radius:6px;">No hay facturas para compensar.</div>';
    } else {
        aplicarDocsData.docsFact.forEach(d => {
            factHtml += `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0.6rem; background:#f0fdf4; border-radius:6px; margin-bottom:4px; font-size:0.8rem;">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-weight:600; color:#059669;">📄 ${d.nroDoc}</span>
                    ${!d.isNCOriginal ? `<label class="anticipo-toggle" title="Marcar como anticipo">
                        <input type="checkbox" id="anticipo_toggle_${d.id}" onchange="recalcularAplicarNeto()">
                        <span class="slider"></span>
                    </label>
                    <span style="font-size:0.65rem; color:#d97706;">Anticipo?</span>` : ''}
                </div>
                <span style="font-weight:700; color:#059669;">${fmtM(d.monto)}</span>
            </div>`;
        });
    }
    document.getElementById('aplicarDocsFactList').innerHTML = factHtml;
}

function abrirAplicarSeleccionados() {
    const seleccionados = $('.chk-pago:checked');
    if (seleccionados.length < 2) {
        Swal.fire('Atención', 'Seleccione al menos 2 documentos para aplicar.', 'warning');
        return;
    }

    let monedaUnica = null;
    let rucUnico = null;
    let errorMoneda = false;
    let errorRuc = false;
    let allDocs = [];

    seleccionados.each(function() {
        const id = $(this).data('id');
        const mon = $(this).data('moneda');
        const monto = parseFloat($(this).data('monto') || 0);
        const tipoComp = String($(this).data('tipo-comp') || '').trim();
        const proveedor = $(this).data('proveedor') || '';
        const ruc = String($(this).data('ruc') || '').trim();
        const nroDoc = $(this).data('nro-doc') || '';

        if (monedaUnica === null) monedaUnica = mon;
        else if (monedaUnica !== mon) errorMoneda = true;

        if (rucUnico === null && ruc !== '') rucUnico = ruc;
        else if (ruc !== '' && rucUnico !== ruc) errorRuc = true;

        // Detectar NC por código, texto descriptivo, o monto negativo
        const isNCOriginal = (tipoComp === '07' || tipoComp === '87' 
                     || tipoComp.toUpperCase().includes('CREDITO') 
                     || tipoComp.toUpperCase().includes('NC')
                     || monto < 0);

        allDocs.push({ id, monto, proveedor, ruc, nroDoc, tipoComp, isNCOriginal });
    });

    if (errorMoneda) {
        Swal.fire('Error', 'Todos los documentos seleccionados deben tener la misma moneda.', 'error');
        return;
    }

    if (errorRuc) {
        Swal.fire('Error', 'Todos los documentos seleccionados deben pertenecer al mismo Proveedor (Mismo RUC/Documento).', 'error');
        return;
    }

    // Store data for the modal
    aplicarDocsData = {
        docsNC: [],
        docsFact: [],
        allDocs: allDocs,
        ids: allDocs.map(d => d.id),
        moneda: monedaUnica,
        neto: 0
    };
    
    // Reset files and notes
    aplicarDocsFiles = [];
    renderAplicarFileList();
    document.getElementById('aplicarDocsNotas').value = '';
    
    // Open modal and populate
    document.getElementById('modalAplicarDocs').classList.add('active');
    
    // Initial classification and render
    recalcularAplicarNeto();
}

async function confirmarAplicarDocs() {
    const { docsNC, docsFact, ids, moneda, neto } = aplicarDocsData;
    const codcia = document.getElementById('filterCia').value;
    const notas = document.getElementById('aplicarDocsNotas').value || '';
    
    // Calcular el monto a aplicar a cada documento (distribuir NC a Facturas)
    let totalNC = Math.abs(docsNC.reduce((sum, d) => sum + parseFloat(d.monto), 0));
    const montosMap = {};
    
    // NCs/Anticipos se aplican completos
    docsNC.forEach(d => {
        montosMap[d.id] = -Math.abs(d.monto);
    });
    
    // Distribuir el totalNC entre las facturas
    let saldoAbono = totalNC;
    docsFact.forEach(d => {
        const deuda = parseFloat(d.monto);
        if (saldoAbono >= deuda) {
            montosMap[d.id] = deuda;
            saldoAbono -= deuda;
        } else if (saldoAbono > 0) {
            montosMap[d.id] = saldoAbono;
            saldoAbono = 0;
        } else {
            montosMap[d.id] = 0;
        }
    });

    const execApply = async (irAPago = false) => {
        try {
            document.getElementById('modalAplicarDocs').classList.remove('active');
            
            if (irAPago) {
                // Si va a pagar, cerramos el modal actual y abrimos el de pago para el NETO
                // Como va a pagar todo, NO le pasamos montos_aplicados para que se pague la totalidad de una vez
                openModalPagoFlexible(
                    ids.join(','),
                    'MULTI',
                    codcia,
                    `${docsNC.length} NC/Ant + ${docsFact.length} Fact`,
                    'MULTI',
                    'Aplicación NC/Factura',
                    '',
                    neto,
                    moneda
                );
                return;
            }

            Swal.fire({ title: 'Registrando aplicación...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const formData = new FormData();
            formData.append('detalle_ids', ids.join(','));
            formData.append('codcia', codcia);
            formData.append('usuario', currentUser);
            formData.append('moneda', moneda);
            formData.append('monto', '0');
            formData.append('banco', '');
            
            // Determinar tipo según si hay anticipos
            const tieneAnticipos = docsNC.some(d => d.esAnticipo);
            formData.append('tipo', tieneAnticipos ? 'APLICACION_ANTICIPO' : 'APLICACION_NC');
            
            formData.append('fecha', new Date().toISOString().split('T')[0]);
            formData.append('nro_operacion', '');
            formData.append('concepto_pago', '');
            
            // Adjuntar el JSON de montos a aplicar parcialmente
            formData.append('montos_aplicados', JSON.stringify(montosMap));

            // Build descriptive note
            const ncDesc = docsNC.map(d => `${d.esAnticipo ? 'ANT' : 'NC'}:${d.nroDoc}(${d.monto})`).join(', ');
            const factDesc = docsFact.map(d => `FACT:${d.nroDoc}(${d.monto})`).join(', ');
            const notaFull = notas ? `${notas} | Aplicación Parcial: ${ncDesc} → ${factDesc}` : `Aplicación Parcial: ${ncDesc} → ${factDesc}`;
            formData.append('notas', notaFull);
            
            // Grupo de aplicación para relacionar documentos
            formData.append('grupo_aplicacion', '');

            // Adjuntos
            for (let i = 0; i < aplicarDocsFiles.length; i++) {
                formData.append('archivos', aplicarDocsFiles[i]);
            }

            await axios.post('/api/cargos/pagos/registrar_multiples', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            Swal.fire({
                icon: 'success',
                title: '¡Aplicación Registrada!',
                html: `Se aplicaron <strong>${docsNC.length}</strong> NC/Anticipos con <strong>${docsFact.length}</strong> Facturas correctamente.<br>
                       <span style="font-size:0.8rem; color:#64748b;">El saldo pendiente de la factura ha sido actualizado.</span>`,
                timer: 3500,
                showConfirmButton: false
            });

            aplicarDocsFiles = [];
            loadPendientes();
            loadHistorialPagos();
        } catch (err) {
            Swal.fire('Error', String(err), 'error');
        }
    };
    
    // Si el neto es positivo, preguntar qué desea hacer
    if (neto > 0) {
        document.getElementById('modalAplicarDocs').classList.remove('active');
        
        const sim = moneda === 'USD' ? '$' : 'S/';
        Swal.fire({
            title: 'Saldo Pendiente',
            html: `Queda un saldo de <strong>${sim} ${neto.toLocaleString('es-PE', {minimumFractionDigits:2})}</strong>.<br><br>¿Qué desea hacer con los documentos seleccionados?`,
            icon: 'question',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: '💸 Aplicar Anticipo y Pagar Saldo',
            denyButtonText: '✅ Solo Aplicar Anticipo (Dejar Pendiente)',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#2563eb',
            denyButtonColor: '#10b981',
            width: 500
        }).then((result) => {
            if (result.isConfirmed) {
                execApply(true); // Pagar todo
            } else if (result.isDenied) {
                execApply(false); // Solo aplicar
            }
        });
        return;
    }

    // Neto <= 0: registrar directamente como aplicación parcial/total
    execApply(false);
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
                const facturaUrl = f.Uuid ? `/factura_visor.html?uid=${f.Uuid}` : '#';
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

        content.innerHTML = html;
    } catch(err) {
        content.innerHTML = `<div style="text-align:center; padding:3rem; color:#ef4444; font-weight:500;">❌ Error: ${err.message}</div>`;
    }
}
