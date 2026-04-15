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
        loadPendientes();
        loadHistorialPagos();
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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:#94a3b8;">Cargando...</td></tr>';

    try {
        const res = await axios.get(`/api/cargos/pagos/pendientes?codcia=${encodeURIComponent(codcia)}`);
        const items = res.data;

        // Stats
        document.getElementById('statPendientes').textContent = items.length;
        const montoTotal = items.reduce((s, i) => s + parseFloat(i.MontoFactura || 0), 0);
        document.getElementById('statMontoPend').textContent = `S/ ${montoTotal.toLocaleString('es-PE', {minimumFractionDigits: 2})}`;

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:#94a3b8;">No hay OCs pendientes de pago.</td></tr>';
            return;
        }

        const dtData = items.map(c => {
            let facturaCell = c.NroFactura || '-';
            if (c.FacturaUuid && c.NroFactura) {
                facturaCell = `<a href="/factura_visor.html?uid=${c.FacturaUuid}" target="_blank" style="color:#2563eb; text-decoration:underline;">${c.NroFactura}</a>`;
            }

            const btnPagar = `<button class="btn-action primary" style="padding:0.3rem 0.75rem; font-size:0.75rem; display:inline-flex; align-items:center; gap:0.3rem;" onclick="openModalPago(${c.DetalleId}, '${c.CodCiaOc||''}', '${c.NroOrdenCompra||''}', '${c.TipoOc||''}', '${(c.Proveedor||'').replace(/'/g,"\\'")}', '${c.NroFactura||''}', ${c.MontoFactura||0}, '${c.Moneda||'PEN'}')">
                💸 Registrar Pago
            </button>`;

            return [
                `<strong>${c.NroOrdenCompra || '-'}</strong>`,
                c.TipoOc || '-',
                `${c.Proveedor || '-'}<br><small style="color:#64748b;">${c.RucProveedor || '-'}</small>`,
                facturaCell,
                c.FechaOC || '-',
                `<span class="badge pending">${c.NroCargo || '-'}</span>`,
                `S/ ${parseFloat(c.MontoFactura || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}`,
                btnPagar
            ];
        });

        pendientesDT = $('#pendientesTable').DataTable({
            data: dtData, destroy: true, order: [[4, 'desc']], pageLength: 15,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
            dom: 'Bfrtip',
            buttons: [{ extend: 'excelHtml5', text: '📊 Exportar', className: 'dt-button', exportOptions: { columns: [0,1,2,3,4,5,6] } }],
            columnDefs: [
                { targets: [7], orderable: false },
                { targets: [6], className: 'dt-right font-semibold text-slate-800' }
            ]
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444; text-align:center; padding:2rem;">${err}</td></tr>`;
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
            data: dtData, destroy: true, order: [[6, 'desc']], pageLength: 15,
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
        Swal.fire('Error', String(err), 'error');
    }
}
