// ════════════════════════════════════════════════════════════
//  PAGOS TESORERÍA - Frontend JS
// ════════════════════════════════════════════════════════════

let currentUser = '';
let pendientesDT = null;
let historialPagosDT = null;

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
let paramTiposPago = [];

async function loadParametros() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) return;

    try {
        const [resMonedas, resBancos, resTipos] = await Promise.all([
            axios.get(`/api/cargos/parametros/monedas?codcia=${codcia}`).catch(() => ({data: paramMonedas})),
            axios.get(`/api/cargos/parametros/bancos?codcia=${codcia}`).catch(() => ({data: []})),
            axios.get(`/api/cargos/parametros/tipos-pago?codcia=${codcia}`).catch(() => ({data: []}))
        ]);

        paramMonedas = resMonedas.data;
        paramBancos = resBancos.data;
        paramTiposPago = resTipos.data;

        // Actualizar selects del modal de pago
        updateSelectMonedas();
        updateSelectBancos();
        updateSelectTiposPago();
    } catch (err) {
        console.error('Error cargando parámetros:', err);
    }
}

function updateSelectMonedas() {
    const select = document.getElementById('pago_moneda');
    if (!select || paramMonedas.length === 0) return;

    select.innerHTML = paramMonedas.map(m => {
        const codigo = m.Simbolo || m.Codigo;
        const desc = m.Descripcion;
        return `<option value="${codigo}">${desc} (${codigo})</option>`;
    }).join('');
}

function updateSelectBancos() {
    const select = document.getElementById('pago_banco');
    if (!select) return;

    if (paramBancos.length > 0) {
        select.innerHTML = paramBancos.map(b =>
            `<option value="${b.Codigo}">${b.Descripcion}</option>`
        ).join('');
    } else {
        // Fallback
        select.innerHTML = `
            <option value="BCP">BANCO DE CREDITO DEL PERU</option>
            <option value="BBVA">BBVA PERU</option>
            <option value="SCOTIABANK">SCOTIABANK PERU</option>
            <option value="INTERBANK">INTERBANK</option>
            <option value="BANBIF">BANBIF</option>
            <option value="EFECTIVO">CAJA / EFECTIVO</option>
        `;
    }
}

function updateSelectTiposPago() {
    const select = document.getElementById('pago_tipo');
    if (!select) return;

    if (paramTiposPago.length > 0) {
        select.innerHTML = paramTiposPago.map(t =>
            `<option value="${t.Codigo}">${t.Descripcion}</option>`
        ).join('');
    } else {
        // Fallback
        select.innerHTML = `
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="CHEQUE">Cheque</option>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TARJETA">Tarjeta</option>
        `;
    }
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

            // Fechas formateadas
            const fechaOC = c.FechaOC || '-';
            const fechaEmision = c.FechaEmision || '-';
            const fechaVencimiento = c.FechaVencimiento || '-';
            const fechaRendicion = c.FechaRendicion || '-';

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
                linksHtml += ` <a href="/factura_visor.html?uid=${c.FacturaUuid}" target="_blank" title="Ver Factura" style="color:#2563eb; font-size:0.7rem;">📄</a>`;
            }
            if (c.RendicionUuid) {
                linksHtml += ` <a href="/rendicion_visor.html?uid=${c.RendicionUuid}" target="_blank" title="Ver Rendición" style="color:#059669; font-size:0.7rem;">📋</a>`;
            }

            // Botón de pago
            const btnPagar = `<button class="btn-action primary" style="padding:0.25rem 0.5rem; font-size:0.7rem;" onclick="openModalPagoFlexible(${c.DetalleId}, '${c.TipoDocumento||'OC'}', '${c.CodCiaOc||''}', '${c.NroOrdenCompra||''}', '${c.TipoOc||''}', '${(c.Proveedor||'').replace(/'/g,"\\'")}', '${c.NroFactura||''}', ${importeOC}, ${importeFactura}, ${importeRendicion}, '${moneda||'PEN'}')">💸 Pagar</button>`;

            // Formatear importes
            const fmt = (val) => val > 0 ? `${simbolo} ${val.toLocaleString('es-PE', {minimumFractionDigits: 2})}` : '-';

            // 16 columnas según headers
            return [
                `<span class="${tipoClass}">${tipoDoc}</span>`,                          // 0: Tipo
                `<strong>${c.NroOrdenCompra || '-'}</strong>`,                              // 1: N° OC
                c.TipoOc || '-',                                                          // 2: Tipo OC
                c.NroFactura || '-',                                                      // 3: N° Comprobante
                c.TipoComprobante || '-',                                                 // 4: Tipo Comp
                fechaOC,                                                                  // 5: Fecha OC
                fechaEmision,                                                             // 6: Fecha Emisión
                fechaVencimiento,                                                         // 7: Fecha Venc.
                `${c.Proveedor || '-'}${linksHtml}<br><small style="color:#64748b;">${c.RucProveedor || '-'}</small>`, // 8: Proveedor
                `<span style="font-weight:600; color:${moneda === 'USD' ? '#d97706' : '#1e40af'}">${moneda}</span>`, // 9: Mon
                fmt(importeOC),                                                           // 10: Importe OC
                fmt(importeFactura),                                                      // 11: Importe Factura
                c.NroRendicion || (c.TipoDocumento === 'RENDICION' ? c.NroOrdenCompra : '-'), // 12: N° Rendición
                fmt(importeRendicion),                                                    // 13: Importe Rendición
                `<span class="badge pending">${c.NroCargo || '-'}</span>`,               // 14: N° Cargo
                btnPagar                                                                  // 15: Acción
            ];
        });

        pendientesDT = $('#pendientesTable').DataTable({
            data: dtData, destroy: true,
            deferRender: true, order: [[5, 'desc']], pageLength: 15,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: 'Bfrtip',
            buttons: [{ extend: 'excelHtml5', text: '📊 Exportar', className: 'dt-button', exportOptions: { columns: ':visible' } }],
            columnDefs: [
                { targets: [15], orderable: false, width: '80px' },
                { targets: [10, 11, 13], className: 'dt-right font-semibold' }
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
            const adjBadge = p.NumAdjuntos > 0
                ? `<span class="badge success">${p.NumAdjuntos} archivo(s)</span>`
                : '<span style="color:#94a3b8; font-size:0.75rem;">Sin adjuntos</span>';

            return [
                `<strong>${p.NroOrdenCompra || '-'}</strong>`,
                `${p.Proveedor || '-'}<br><small style="color:#64748b;">${p.RucProveedor || '-'}</small>`,
                p.NroFactura || '-',
                `<span style="font-weight:600;">${p.BancoPago || '-'}</span>`,
                p.TipoPago || '-',
                `<code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${p.NroOperacion || '-'}</code>`,
                p.FechaPago || '-',
                `S/ ${parseFloat(p.MontoPago || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}`,
                p.UsuarioRegistro || '-',
                adjBadge
            ];
        });

        historialPagosDT = $('#historialPagosTable').DataTable({
            data: dtData, destroy: true,
            deferRender: true, order: [[6, 'desc']], pageLength: 15,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: 'Bfrtip',
            buttons: [{ extend: 'excelHtml5', text: '📊 Exportar Pagos', className: 'dt-button', exportOptions: { columns: [0,1,2,3,4,5,6,7,8] } }],
            columnDefs: [
                { targets: [7], className: 'dt-right font-semibold text-slate-800' }
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
    const files = document.getElementById('pago_adjuntos').files;

    if (files.length > 3) {
        Swal.fire('Atención', 'Puede subir un máximo de 3 adjuntos.', 'warning');
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

    for (let i = 0; i < files.length; i++) {
        formData.append('archivos', files[i]);
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
        loadPendientes();
        loadHistorialPagos();
    } catch (err) {
        Swal.fire('Error', err, 'error');
    }
}

async function openModalPagoFlexible(detalleId, tipoDocumento, codcia, nrodoc, tipooc, proveedor, factura, importeOC, importeFactura, importeRendicion, moneda) {
    document.getElementById('pago_idDetalle').value = detalleId;
    document.getElementById('pago_codcia').value = codcia;
    document.getElementById('pago_nrodoc').value = nrodoc;
    document.getElementById('pago_tipooc').value = tipooc || 'O';

    // Cargar parámetros dinámicos si no están cargados
    if (paramBancos.length === 0 || paramTiposPago.length === 0) {
        await loadParametros();
    }

    // Fill form defaults
    document.getElementById('pago_fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('pago_nro_operacion').value = '';
    document.getElementById('pago_adjuntos').value = '';
    document.getElementById('pago_notas').value = '';

    // Set moneda (después de cargar parámetros)
    const monedaSelect = document.getElementById('pago_moneda');
    if (monedaSelect && moneda) {
        // Buscar la opción que corresponda a la moneda
        const options = Array.from(monedaSelect.options);
        const matchingOption = options.find(opt => opt.value === moneda);
        if (matchingOption) {
            monedaSelect.value = moneda;
        } else if (options.length > 0) {
            monedaSelect.value = options[0].value;
        }
    }

    // Set default banco y tipo (primeras opciones disponibles)
    const bancoSelect = document.getElementById('pago_banco');
    if (bancoSelect && bancoSelect.options.length > 0) {
        bancoSelect.value = bancoSelect.options[0].value;
    }

    const tipoSelect = document.getElementById('pago_tipo');
    if (tipoSelect && tipoSelect.options.length > 0) {
        tipoSelect.value = tipoSelect.options[0].value;
    }

    // Determinar monto a pagar según tipo de documento
    let montoPagar = 0;
    let docLabel = '';
    let docNro = '';

    if (tipoDocumento === 'OC') {
        montoPagar = importeFactura || importeOC;
        docLabel = 'OC';
        docNro = nrodoc;
    } else if (tipoDocumento === 'FACTURA_SIN_OC') {
        montoPagar = importeFactura;
        docLabel = 'Factura';
        docNro = factura;
    } else if (tipoDocumento === 'RENDICION') {
        montoPagar = importeRendicion;
        docLabel = 'Rendición';
        docNro = nrodoc;
    }

    document.getElementById('pago_monto').value = montoPagar || '';

    // Show summary con selección de documento a pagar
    let resumenHtml = `<div style="display:grid; grid-template-columns: 80px 1fr; gap:0.2rem 0.75rem;">`;
    
    if (tipoDocumento === 'OC') {
        resumenHtml += `
            <span style="font-weight:600; color:#64748b;">Tipo:</span><span style="font-weight:700;">${docLabel}</span>
            <span style="font-weight:600; color:#64748b;">OC:</span><span style="font-weight:700;">${nrodoc}</span>
            <span style="font-weight:600; color:#64748b;">Proveedor:</span><span>${proveedor}</span>
            <span style="font-weight:600; color:#64748b;">Factura:</span><span>${factura || '-'}</span>
            <span style="font-weight:600; color:#64748b;">Importe OC:</span><span style="font-weight:700;">S/ ${importeOC.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
            <span style="font-weight:600; color:#64748b;">Importe Factura:</span><span style="font-weight:700; color:var(--primary);">S/ ${importeFactura.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
        `;
    } else if (tipoDocumento === 'FACTURA_SIN_OC') {
        resumenHtml += `
            <span style="font-weight:600; color:#64748b;">Tipo:</span><span style="font-weight:700;">${docLabel}</span>
            <span style="font-weight:600; color:#64748b;">Factura:</span><span style="font-weight:700;">${factura}</span>
            <span style="font-weight:600; color:#64748b;">Proveedor:</span><span>${proveedor}</span>
            <span style="font-weight:600; color:#64748b;">Importe:</span><span style="font-weight:700; color:var(--primary);">S/ ${importeFactura.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
        `;
    } else if (tipoDocumento === 'RENDICION') {
        resumenHtml += `
            <span style="font-weight:600; color:#64748b;">Tipo:</span><span style="font-weight:700;">${docLabel}</span>
            <span style="font-weight:600; color:#64748b;">N° Rendición:</span><span style="font-weight:700;">${nrodoc}</span>
            <span style="font-weight:600; color:#64748b;">Proveedor:</span><span>${proveedor}</span>
            <span style="font-weight:600; color:#64748b;">Importe:</span><span style="font-weight:700; color:var(--primary);">S/ ${importeRendicion.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
        `;
    }
    
    resumenHtml += `</div>`;

    document.getElementById('modalPagoTitle').textContent = `Pago — ${docLabel} ${docNro}`;
    document.getElementById('pagoResumen').innerHTML = resumenHtml;

    // Agregar campo oculto para tipo de documento
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
