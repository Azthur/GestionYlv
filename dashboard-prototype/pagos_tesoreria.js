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
        const defaultCia = cached || cu.codcia || (companies.length > 0 ? companies[0].codcia : '');

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
        if (uploadedFiles.length >= 5) break;
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
            if (i.Moneda === 'USD') {
                totalUSD += monto;
            } else {
                totalPEN += monto;
            }
        });

        document.getElementById('statPendientes').textContent = items.length;
        let montoTexto = '';
        if (totalPEN > 0) montoTexto += `S/ ${totalPEN.toLocaleString('es-PE', {minimumFractionDigits: 2})}`;
        if (totalUSD > 0) {
            if (montoTexto) montoTexto += ' + ';
            montoTexto += `$ ${totalUSD.toLocaleString('es-PE', {minimumFractionDigits: 2})}`;
        }
        if (!montoTexto) montoTexto = 'S/ 0.00';
        document.getElementById('statMontoPend').textContent = montoTexto;

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="16" style="text-align:center; padding:2rem; color:#94a3b8;">No hay documentos pendientes de pago.</td></tr>';
            return;
        }

        const dtData = items.map(c => {
            // Datos del backend
            const tipoDoc = c.TipoDocDesc || 'OC';
            const moneda = c.Moneda || 'PEN';
            const simbolo = moneda === 'USD' ? '$' : 'S/';

            // Fechas formateadas — limpiar fechas nulas o 1900-01-01
            const cleanDate = (d) => {
                if (!d || d === '-' || d === 'None') return '';
                const s = String(d).trim();
                if (s.startsWith('1900') || s.startsWith('0001') || s.startsWith('1899')) return '';
                return s;
            };
            const fechaOC = cleanDate(c.FechaOC);
            const fechaEmision = cleanDate(c.FechaEmision);
            const fechaVencimiento = cleanDate(c.FechaVencimiento);
            const fechaRendicion = cleanDate(c.FechaRendicion);

            // Importes
            const importeOC = parseFloat(c.MontoOC || 0);
            const importeFactura = parseFloat(c.MontoFactura || 0);
            const importeRendicion = parseFloat(c.MontoRendicion || c.TotalReembolso || 0);

            // Badge color según tipo
            let tipoClass = 'badge pending';
            if (tipoDoc === 'Factura') tipoClass = 'badge success';
            if (tipoDoc === 'Rendición') tipoClass = 'badge success';

            // Enlaces a documentos
            let linksHtml = '';
            if (c.FacturaUuid) {
                linksHtml += ` <a href="javascript:void(0)" onclick="openVisor('/factura_visor.html?uid=${c.FacturaUuid}', 'Factura')" title="Ver Factura" style="color:#2563eb; font-size:0.8rem;">📄</a>`;
            }
            if (c.RendicionUuid) {
                linksHtml += ` <a href="javascript:void(0)" onclick="openVisor('/visor_rendicion.html?uuid=${c.RendicionUuid}', 'Rendición')" title="Ver Rendición" style="color:#059669; font-size:0.8rem;">📋</a>`;
            }

            // Botón de pago
            const btnPagar = `<button class="btn-action primary" style="padding:0.25rem 0.5rem; font-size:0.7rem;" onclick="openModalPagoFlexible(${c.DetalleId}, '${c.TipoDocumento||'OC'}', '${c.CodCiaOc||''}', '${c.NroOrdenCompra||''}', '${c.TipoOc||''}', '${(c.Proveedor||'').replace(/'/g,"\\'")}', '${c.NroFactura||''}', ${importeOC}, ${importeFactura}, ${importeRendicion}, '${moneda||'PEN'}')">💸 Pagar</button>`;

            // Formatear importes
            const fmt = (val) => val > 0 ? `${simbolo} ${val.toLocaleString('es-PE', {minimumFractionDigits: 2})}` : '-';

            // 9 columnas consolidadas
            const codcia = c.CodCiaOc || document.getElementById('filterCia').value || '';
            
            // 1. Tipo Doc + enlaces — todos abren en visor modal iframe
            let docPrincipal = `<strong>${c.NroDocPrincipal || '-'}</strong>`;
            if (tipoDoc === 'Factura' && c.FacturaUuid) {
                docPrincipal = `<a href="javascript:void(0)" onclick="openVisor('/factura_visor.html?uid=${c.FacturaUuid}', 'Factura ${c.NroDocPrincipal}')" style="color:#2563eb; text-decoration:underline; font-weight:700;" title="Ver Factura">📄 ${c.NroDocPrincipal}</a>`;
            } else if (tipoDoc === 'Rendición') {
                if (c.RendicionUuid) {
                    docPrincipal = `<a href="javascript:void(0)" onclick="openVisor('/visor_rendicion.html?uuid=${c.RendicionUuid}', 'Rendición ${c.NroDocPrincipal}')" style="color:#059669; text-decoration:underline; font-weight:700;" title="Ver Rendición">📋 ${c.NroDocPrincipal || c.NroRendicion}</a>`;
                } else {
                    docPrincipal = `<strong>📋 ${c.NroDocPrincipal || c.NroRendicion || '-'}</strong>`;
                }
            } else if (tipoDoc === 'OC' && c.NroOrdenCompra) {
                // OC: abrir visor OC en iframe modal
                const ocUrl = `/oc_visor.html?nrodoc=${encodeURIComponent(c.NroOrdenCompra)}&codcia=${encodeURIComponent(codcia)}&tipooc=${encodeURIComponent(c.TipoOc || 'O')}`;
                docPrincipal = `<a href="javascript:void(0)" onclick="openVisor('${ocUrl}', 'OC ${c.NroOrdenCompra}')" style="color:#8b5cf6; text-decoration:underline; font-weight:700;" title="Ver Orden de Compra">📦 ${c.NroDocPrincipal}</a>`;
            }

            // 2. Fechas — priorizar Emisión y Vencimiento para gestión de pago
            let fechasHtml = '';
            if (fechaEmision) fechasHtml += `<div style="font-size:0.72rem;">📅 Em: <b>${fechaEmision}</b></div>`;
            if (fechaVencimiento) {
                const hoy = new Date(); hoy.setHours(0,0,0,0);
                const fv = new Date(fechaVencimiento + 'T00:00:00');
                const diffDias = Math.ceil((fv - hoy) / (1000*60*60*24));
                let vcColor = '#64748b'; let vcIcon = '📆';
                if (diffDias < 0) { vcColor = '#dc2626'; vcIcon = '🔴'; }
                else if (diffDias <= 7) { vcColor = '#f59e0b'; vcIcon = '🟡'; }
                else { vcColor = '#059669'; vcIcon = '🟢'; }
                fechasHtml += `<div style="font-size:0.72rem; color:${vcColor}; font-weight:700;">${vcIcon} Vc: ${fechaVencimiento}</div>`;
            }
            if (fechaOC) fechasHtml += `<div style="font-size:0.68rem; color:#94a3b8;">OC: ${fechaOC}</div>`;
            if (fechaRendicion) fechasHtml += `<div style="font-size:0.68rem; color:#94a3b8;">Rn: ${fechaRendicion}</div>`;
            if (!fechasHtml) fechasHtml = '<span style="color:#cbd5e1;">—</span>';

            const sortDateVc = fechaVencimiento || '9999-12-31';

            // 3. Proveedor / Beneficiario
            let proveedorHtml = `${c.Proveedor || '-'}<br><small style="color:#64748b;">${c.RucProveedor || '-'}</small>`;

            // 4. Trazabilidad — con enlaces clickeables en visor iframe
            let trazaHtml = '';
            if (tipoDoc === 'Factura' && c.NroOrdenCompra && c.NroOrdenCompra !== '-') {
                // Factura → ver OC en iframe
                const ocUrl = `/oc_visor.html?nrodoc=${encodeURIComponent(c.NroOrdenCompra)}&codcia=${encodeURIComponent(codcia)}&tipooc=${encodeURIComponent(c.TipoOc || 'O')}`;
                trazaHtml = `<a href="javascript:void(0)" onclick="openVisor('${ocUrl}', 'OC ${c.NroOrdenCompra}')" style="font-size:0.75rem; color:#8b5cf6; text-decoration:underline; cursor:pointer;" title="Ver OC">📦 OC: ${c.NroOrdenCompra}</a>`;
            } else if (tipoDoc === 'OC' && c.NroFactura && c.NroFactura !== '-') {
                if (c.FacturaUuid) {
                    trazaHtml = `<a href="javascript:void(0)" onclick="openVisor('/factura_visor.html?uid=${c.FacturaUuid}', 'Factura ${c.NroFactura}')" style="font-size:0.75rem; color:#2563eb; text-decoration:underline; cursor:pointer;" title="Ver Factura">📄 Fact: ${c.NroFactura}</a>`;
                } else {
                    trazaHtml = `<div style="font-size:0.75rem; color:#64748b;">📄 Fact: <b>${c.NroFactura}</b></div>`;
                }
            } else if (tipoDoc === 'Rendición' && c.NroOrdenCompra) {
                const ocUrl = `/oc_visor.html?nrodoc=${encodeURIComponent(c.NroOrdenCompra)}&codcia=${encodeURIComponent(codcia)}&tipooc=${encodeURIComponent(c.TipoOc || 'O')}`;
                trazaHtml = `<a href="javascript:void(0)" onclick="openVisor('${ocUrl}', 'OC ${c.NroOrdenCompra}')" style="font-size:0.75rem; color:#8b5cf6; text-decoration:underline; cursor:pointer;" title="Ver OC">📦 OC: ${c.NroOrdenCompra}</a>`;
            }
            if (!trazaHtml) trazaHtml = '<span style="color:#cbd5e1;">—</span>';

            const importePagar = c.ImportePrincipal || 0;

            return [
                `<span class="${tipoClass}">${tipoDoc}</span>`,
                docPrincipal,
                `<span style="display:none;">${sortDateVc}</span>${fechasHtml}`,
                proveedorHtml,
                `<span style="font-weight:700; color:${moneda === 'USD' ? '#d97706' : '#1e40af'}">${moneda}</span>`,
                fmt(importePagar),
                trazaHtml,
                `<span class="badge pending">${c.NroCargo || '-'}</span>`,
                btnPagar
            ];
        });

        pendientesDT = $('#pendientesTable').DataTable({
            data: dtData, destroy: true,
            deferRender: true, order: [[2, 'asc']], pageLength: 15,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: 'Bfrtip',
            buttons: [{ extend: 'excelHtml5', text: '📊 Exportar', className: 'dt-button', exportOptions: { columns: [0,1,2,3,4,5,6,7] } }],
            columnDefs: [
                { targets: [8], orderable: false, width: '80px' },
                { targets: [5], className: 'dt-right font-semibold text-slate-800' }
            ]
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="16" style="color:#ef4444; text-align:center; padding:2rem;">${err}</td></tr>`;
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

        // Stats
        document.getElementById('statPagados').textContent = items.length;
        const montoPagado = items.reduce((s, i) => s + parseFloat(i.MontoPago || 0), 0);
        document.getElementById('statMontoPagado').textContent = `S/ ${montoPagado.toLocaleString('es-PE', {minimumFractionDigits: 2})}`;

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:2rem; color:#94a3b8;">No hay pagos registrados.</td></tr>';
            return;
        }

        const dtData = items.map(p => {
            let adjBadge = '<span style="color:#94a3b8; font-size:0.75rem;">Sin adjuntos</span>';
            if (p.Adjuntos && p.Adjuntos.length > 0) {
                const links = p.Adjuntos.map(a => `<a href="/api/cargos/pagos/adjunto/${a.AdjuntoId}" target="_blank" style="color:#2563eb; text-decoration:none;" title="${a.ArchivoNombre}">📄 ${a.ArchivoNombre.substring(0, 15)}${a.ArchivoNombre.length > 15 ? '...' : ''}</a>`).join('<br>');
                adjBadge = `<div style="font-size:0.7rem;">${links}</div>`;
            }
            const simbolo = p.Moneda === 'USD' ? '$' : 'S/';

            return [
                `<strong>${p.NroOrdenCompra || '-'}</strong>`,
                `${p.Proveedor || '-'}<br><small style="color:#64748b;">${p.RucProveedor || '-'}</small>`,
                p.NroFactura || '-',
                `<span style="font-weight:600;">${p.BancoPago || '-'}</span>`,
                p.TipoPago || '-',
                `<code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${p.NroOperacion || '-'}</code>`,
                p.FechaPago || '-',
                `<span style="font-weight:700; color:${p.Moneda === 'USD' ? '#d97706' : '#1e40af'}">${p.Moneda || 'PEN'}</span>`,
                `${simbolo} ${parseFloat(p.MontoPago || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}`,
                p.UsuarioRegistro || '-',
                adjBadge
            ];
        });

        historialPagosDT = $('#historialPagosTable').DataTable({
            data: dtData, destroy: true,
            deferRender: true, order: [[6, 'desc']], pageLength: 15,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: 'Bfrtip',
            buttons: [{ extend: 'excelHtml5', text: '📊 Exportar Pagos', className: 'dt-button', exportOptions: { columns: [0,1,2,3,4,5,6,7,8,9] } }],
            columnDefs: [
                { targets: [8], className: 'dt-right font-semibold text-slate-800' }
            ]
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" style="color:#ef4444; text-align:center; padding:2rem;">${err}</td></tr>`;
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
    const detalleId = document.getElementById('pago_idDetalle').value;

    if (uploadedFiles.length > 5) {
        Swal.fire('Atención', 'Puede subir un máximo de 5 adjuntos.', 'warning');
        return;
    }
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

    // Usar uploadedFiles[] en vez del input file
    for (let i = 0; i < uploadedFiles.length; i++) {
        formData.append('archivos', uploadedFiles[i]);
    }

    try {
        document.getElementById('modalPago').classList.remove('active');
        Swal.fire({title: 'Registrando Pago...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});

        await axios.post(`/api/cargos/detalle/${detalleId}/pagar_completo`, formData, {
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

async function openModalPagoFlexible(detalleId, tipoDocumento, codcia, nrodoc, tipooc, proveedor, factura, importeOC, importeFactura, importeRendicion, moneda) {
    document.getElementById('pago_idDetalle').value = detalleId;
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

    // Determinar monto a pagar
    let montoPagar = 0, docLabel = '', docNro = '';
    const sim = moneda === 'USD' ? '$' : 'S/';

    if (tipoDocumento === 'OC') {
        montoPagar = importeFactura || importeOC;
        docLabel = 'OC'; docNro = nrodoc;
    } else if (tipoDocumento === 'FACTURA_SIN_OC') {
        montoPagar = importeFactura;
        docLabel = 'Factura'; docNro = factura;
    } else if (tipoDocumento === 'RENDICION') {
        montoPagar = importeRendicion;
        docLabel = 'Rendición'; docNro = nrodoc;
    }

    document.getElementById('pago_monto').value = montoPagar || '';

    // Show summary
    const fmtMonto = (v) => `${sim} ${parseFloat(v||0).toLocaleString('es-PE',{minimumFractionDigits:2})}`;
    let resumenHtml = `<div style="display:grid; grid-template-columns: 95px 1fr; gap:0.15rem 0.75rem;">`;
    resumenHtml += `<span style="font-weight:600; color:#64748b;">Tipo:</span><span class="badge ${tipoDocumento==='OC'?'pending':'success'}" style="justify-self:start;">${docLabel}</span>`;
    resumenHtml += `<span style="font-weight:600; color:#64748b;">Documento:</span><span style="font-weight:700;">${docNro}</span>`;
    resumenHtml += `<span style="font-weight:600; color:#64748b;">Proveedor:</span><span>${proveedor}</span>`;
    resumenHtml += `<span style="font-weight:600; color:#64748b;">Moneda:</span><span style="font-weight:700; color:${moneda==='USD'?'#d97706':'#1e40af'};">${moneda}</span>`;

    if (tipoDocumento === 'OC') {
        if (factura) resumenHtml += `<span style="font-weight:600; color:#64748b;">Factura:</span><span>${factura}</span>`;
        if (importeOC > 0) resumenHtml += `<span style="font-weight:600; color:#64748b;">Imp. OC:</span><span>${fmtMonto(importeOC)}</span>`;
        if (importeFactura > 0) resumenHtml += `<span style="font-weight:600; color:#64748b;">Imp. Factura:</span><span style="font-weight:700; color:var(--primary);">${fmtMonto(importeFactura)}</span>`;
    } else if (tipoDocumento === 'FACTURA_SIN_OC') {
        resumenHtml += `<span style="font-weight:600; color:#64748b;">Importe:</span><span style="font-weight:700; color:var(--primary);">${fmtMonto(importeFactura)}</span>`;
    } else if (tipoDocumento === 'RENDICION') {
        resumenHtml += `<span style="font-weight:600; color:#64748b;">Reembolso:</span><span style="font-weight:700; color:var(--primary);">${fmtMonto(importeRendicion)}</span>`;
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

// ════════════════════════════════════════════════════════════
//  VISOR MODAL (IFRAME)
// ════════════════════════════════════════════════════════════
function openVisor(url, title) {
    document.getElementById('modalVisorTitle').textContent = `Visor — ${title}`;
    document.getElementById('visorIframe').src = url;
    document.getElementById('modalVisor').classList.add('active');
}
