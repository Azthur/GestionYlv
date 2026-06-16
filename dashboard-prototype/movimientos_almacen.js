'use strict';

let dtInstance = null;
let currentCodCia = '';

function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) { window.location.href = 'login.html'; return null; }
    try {
        const user = JSON.parse(localStorage.getItem('yelave_user'));
        if (!user) throw new Error();
        return user;
    } catch(e) { window.location.href = 'login.html'; return null; }
}

const fmtNum = (val, dec = 2) => {
    if (val === null || val === undefined || isNaN(val)) return '0.00';
    return parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

function formatStatus(status) {
    const s = String(status || '').trim().toUpperCase();
    let watermark = '';
    let badge = '';

    if (s === 'A' || s === 'ANULADO') {
        watermark = '<div class="watermark-text wm-anulado">ANULADO</div>';
        badge = '<span class="badge canceled"><i class="fas fa-times-circle"></i> ANULADO</span>';
    } else if (s === 'C' || s === 'CERRADO') {
        watermark = '<div class="watermark-text wm-completo">CERRADO</div>';
        badge = '<span class="badge approved"><i class="fas fa-check-double"></i> CERRADO</span>';
    } else if (s === 'P' || s === 'PENDIENTE') {
        badge = '<span class="badge pending"><i class="fas fa-clock"></i> PENDIENTE</span>';
    } else {
        badge = `<span class="badge pending"><i class="fas fa-clock"></i> ${s || 'SIN ESTADO'}</span>`;
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
        if (sel) {
            sel.innerHTML = '<option value="" disabled selected>Seleccione Empresa...</option>';
            companies.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.codcia; opt.textContent = `${c.codcia} - ${c.nomcia}`;
                sel.appendChild(opt);
            });
        }

        // Restore default selection
        const cu = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        const defaultCia = cu.codcia || (companies.length > 0 ? companies[0].codcia : '');

        if (defaultCia && sel) {
            if (Array.from(sel.options).some(o => o.value === defaultCia)) {
                sel.value = defaultCia;
                currentCodCia = defaultCia;
            }
        }
    } catch(e) {
        console.error('Error loadCompanies:', e);
        document.getElementById('filterCia').innerHTML = '<option value="" disabled>Sin acceso a empresas</option>';
    }
}

async function loadMovements() {
    const cia = document.getElementById('filterCia').value;
    if (!cia) {
        Swal.fire('Atención', 'Seleccione una empresa primero', 'warning');
        return;
    }
    currentCodCia = cia;

    const year = document.getElementById('filterYear').value;
    const period = document.getElementById('filterPeriod').value;
    const type = document.getElementById('filterType').value;
    const search = document.getElementById('filterSearch').value.trim();

    $('#tableWrapper').show();
    $('#initialMessage').hide();

    const tbody = document.querySelector('#movementsTable tbody');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:3rem; color:var(--text-muted);">Cargando movimientos de almacén...</td></tr>';

    try {
        const token = localStorage.getItem('yelave_token');
        const params = new URLSearchParams({ codcia: cia });
        if (year && year !== '0') params.append('year', year);
        if (period && period !== '0') params.append('period', period);
        if (type) params.append('tipmov', type);
        if (search) params.append('search', search);

        const res = await fetch(`/api/logistics/warehouse-movements?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error al consultar movimientos de almacén');
        const data = await res.json();

        if (dtInstance) {
            dtInstance.destroy();
        }

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:3rem; color:var(--text-muted);">No se encontraron movimientos.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(m => {
            const isApproved = false; // AlmVMovm doesn't have an approved log generally
            const statusInfo = formatStatus(m.flgest);
            
            const btnView = `
                <button class="btn-ver-voucher" onclick="openWarehouseVoucher('${m.codcia}', '${m.almcen}', '${m.tipmov}', '${m.codmov}', '${m.nrodoc}')" title="Ver Detalle de Movimiento">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>
            `;

            return `
                <tr>
                    <td style="text-align: center; padding: 0.5rem !important;">${btnView}</td>
                    <td style="text-align: center;">${statusInfo.badge}</td>
                    <td style="font-family: monospace; font-weight: 600; color: var(--primary);">${m.nrodoc}</td>
                    <td>${m.fchdoc || ''}</td>
                    <td><span style="font-weight: 500;">${m.almcen}</span> <span style="color:var(--text-muted); font-size:0.75rem;">${m.des_almacen || ''}</span></td>
                    <td><span style="font-family: monospace; font-weight: 600; color: #16a34a;">${m.tipmov} ${m.codmov}</span> <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:500;">${m.des_movimiento || ''}</span></td>
                    <td style="font-size:0.775rem; white-space: normal; max-width: 250px; word-wrap: break-word;">${m.nomaux || '-'}</td>
                    <td style="font-family: monospace; font-weight: 600;">${m.ordcmp ? m.ordcmp.trim() : '-'}</td>
                    <td style="font-size: 0.75rem; font-weight: 500; color: var(--text-secondary);">${m.usuario || '-'}</td>
                    <td style="font-size:0.75rem; white-space: normal; max-width: 200px; word-wrap: break-word; color: var(--text-muted);">${m.glodoc || ''}</td>
                </tr>
            `;
        }).join('');

        // Initialize DataTable
        dtInstance = $('#movementsTable').DataTable({
            responsive: true,
            pageLength: 25,
            lengthMenu: [10, 25, 50, 100],
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json'
            },
            ordering: false
        });

    } catch(e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:3rem; color:var(--danger);">${e.message}</td></tr>`;
    }
}

async function openWarehouseVoucher(codcia, almcen, tipmov, codmov, nrodoc) {
    document.getElementById('voucherModal').classList.add('active');
    const contentDiv = document.getElementById('voucherPrintContent');
    contentDiv.innerHTML = '<div style="text-align:center; padding:4rem; color:var(--text-muted); font-size:0.9rem;">Consultando detalle del movimiento...</div>';
    window.currentVoucherPublicKey = null;

    try {
        const token = localStorage.getItem('yelave_token');
        const url = `/api/logistics/warehouse-movements/voucher?codcia=${codcia}&almcen=${almcen}&tipmov=${tipmov}&codmov=${codmov}&nrodoc=${nrodoc}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('Error al obtener el voucher de almacén');
        const data = await res.json();

        const h = data.header;
        const co = data.company;
        const isAnulado = h.estado && h.estado.trim().toUpperCase() === 'A';
        const statusInfo = formatStatus(h.estado);

        // Guardar public key para copiar enlace
        window.currentVoucherPublicKey = h.public_key;

        let html = `
            <div style="padding:1.5rem; background:#fff; font-family:'Inter',Arial,sans-serif; color:#1a1a1a; font-size:0.8125rem; position:relative;">
        `;

        if (statusInfo.watermark) {
            html += statusInfo.watermark;
        }

        // Header Band
        html += `
            <div style="text-align:center; font-weight:700; font-size:1.15rem; color:#1e3a5f; margin-bottom:1.5rem; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; justify-content:center; gap:0.5rem;">
                📦 Detalle de Movimiento de Almacén
            </div>
            <div class="report-header-band">
                <div class="report-company-info">
                    <h2>${co.nomcia || 'EMPRESA'}</h2>
                    <p>${co.dircia || ''}</p>
                    <p>RUC: <strong>${co.ruccia || ''}</strong></p>
                </div>
                <div class="report-oc-badge">
                    <div class="oc-label">DOCUMENTO N°</div>
                    <div class="oc-number">${h.nrodoc}</div>
                    <div class="oc-date">${h.fchdoc}</div>
                </div>
            </div>
        `;

        // Supplier/Warehouse Box
        html += `
            <div class="report-supplier-box">
                <span class="lbl">Almacén :</span><span class="val">${h.almacen} - ${h.des_almacen || ''}</span>
                <span class="lbl">Movimiento :</span><span class="val"><strong>${h.tipmov} ${h.codmov}</strong> &nbsp; ${h.des_movimiento || ''}</span>
                <span class="lbl">Auxiliar :</span><span class="val-full">${h.ruc_proveedor ? h.ruc_proveedor + ' &nbsp; ' : ''}${h.proveedor || '-'}</span>
                <span class="lbl">Moneda :</span><span class="val">${h.moneda}</span>
                <span class="lbl">T. Cambio :</span><span class="val">${fmtNum(h.tipo_cambio, 4)}</span>
                <span class="lbl">Usuario :</span><span class="val"><strong>${h.usuario}</strong></span>
                <span class="lbl">O. Compra :</span><span class="val">${h.ordcmp || '-'}</span>
            </div>
        `;

        // Referencias
        if (h.referencias && h.referencias.length > 0) {
            html += `
                <div style="font-size:0.775rem; padding:0.6rem 1rem; background:#f0f4ff; border:1px solid #c7d2fe; border-radius:6px; margin-bottom:1rem; display:flex; flex-wrap:wrap; gap:1.5rem;">
                    <strong>Documentos de Referencia:</strong>
                    ${h.referencias.map(r => `<span>${r}</span>`).join('')}
                </div>
            `;
        }

        // Observacion
        if (h.observacion) {
            html += `
                <div style="font-size:0.8rem; margin-bottom:1.25rem; background: #f8fafc; padding: 0.6rem 0.85rem; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <strong>Observación/Glosa:</strong> ${h.observacion}
                </div>
            `;
        }

        // Anulado Banner Visual
        if (isAnulado) {
            html += `
                <div style="text-align:center; padding:0.75rem; background:#fee2e2; border:2px solid #ef4444; border-radius:8px; margin-bottom:1.25rem; font-weight:700; color:#991b1b; font-size:1rem; letter-spacing:2px;">
                    ** MOVIMIENTO ANULADO **
                </div>
            `;
        }

        // Items Table
        html += `
            <table class="report-table">
                <thead>
                    <tr>
                        <th style="text-align:center;">Ite</th>
                        <th>Artículo</th>
                        <th>Descripción</th>
                        <th style="text-align:center;">Unidad</th>
                        <th>Nro. Lote</th>
                        <th style="text-align:center;">Fch. Vto</th>
                        <th style="text-align:right;">Cantidad</th>
                        <th style="text-align:right;">Precio</th>
                        <th style="text-align:right;">Total</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (data.items.length === 0) {
            html += '<tr><td colspan="9" style="text-align:center; color:#64748b; padding:2rem;">El movimiento no contiene ítems.</td></tr>';
        } else {
            data.items.forEach(it => {
                html += `
                    <tr>
                        <td style="text-align:center; font-weight:600; color:#475569;">${it.nroitm}</td>
                        <td style="font-family:monospace; font-size:0.725rem; font-weight:500;">${it.codmat}</td>
                        <td style="font-weight:500; color:#0f172a;">${it.desmat}</td>
                        <td style="text-align:center; font-size:0.75rem; color:#475569;">${it.undstk}</td>
                        <td style="font-family:monospace; font-size:0.725rem;">${it.nrolote || ''}</td>
                        <td style="font-size:0.75rem; text-align:center; color:#475569;">${it.fchlote || ''}</td>
                        <td style="text-align:right; font-weight:600;">${fmtNum(it.candes, 4)}</td>
                        <td style="text-align:right; color:#475569;">${fmtNum(it.preuni, 6)}</td>
                        <td style="text-align:right; font-weight:700; color:var(--primary);">${fmtNum(it.impcto, 6)}</td>
                    </tr>
                `;
            });
        }

        html += `
                </tbody>
                <tfoot>
                    <tr style="border-top:2px solid #1e3a5f; font-weight:bold; background:#f8fafc;">
                        <td colspan="6" style="text-align:right; font-weight:700; font-size:0.85rem; padding: 0.5rem 1rem; border-top:2px solid #1e3a5f !important;">TOTAL :</td>
                        <td style="text-align:right; font-weight:600; font-size:0.85rem; color:#1e293b; border-top:2px solid #1e3a5f !important;">${fmtNum(h.total_cantidad, 4)}</td>
                        <td style="text-align:right; font-weight:600; font-size:0.85rem; color:#1e293b; border-top:2px solid #1e3a5f !important;">${fmtNum(h.total_precio, 6)}</td>
                        <td style="text-align:right; font-weight:700; color:var(--primary); font-size:0.9rem; border-top:2px solid #1e3a5f !important; white-space:nowrap;">${h.moneda} ${fmtNum(h.total_importe, 6)}</td>
                    </tr>
                </tfoot>
            </table>
        `;

        html += `
            </div>
        `;

        contentDiv.innerHTML = html;

    } catch(err) {
        console.error(err);
        contentDiv.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--danger);">${err.message}</div>`;
    }
}

function closeVoucherModal() {
    document.getElementById('voucherModal').classList.remove('active');
    window.currentVoucherPublicKey = null;
}

function copyPublicUrl() {
    if (!window.currentVoucherPublicKey) {
        Swal.fire('Atención', 'No hay ningún voucher cargado o el movimiento no tiene clave pública asignada.', 'warning');
        return;
    }
    const publicUrl = `${window.location.origin}/public-movimiento.html?almv=${window.currentVoucherPublicKey}`;
    navigator.clipboard.writeText(publicUrl).then(() => {
        Swal.fire({
            title: '¡Enlace Copiado!',
            text: 'El enlace público del voucher ha sido copiado al portapapeles.',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
        });
    }).catch(err => {
        console.error('Error al copiar al portapapeles:', err);
        Swal.fire('Error', 'No se pudo copiar el enlace automáticamente. Cópielo de forma manual:\n' + publicUrl, 'error');
    });
}

function printVoucher() {
    const modalContent = document.getElementById('voucherPrintContent');
    if (!modalContent || modalContent.querySelector('#voucherLoading')) return;
    
    const printWin = window.open('', '_blank');
    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Voucher de Almacén</title>
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
                .report-supplier-box .val-full { color:#0f172a; grid-column: span 3; }
                .report-table { width:100%; border-collapse:collapse; margin-top:0.25rem; }
                .report-table th { background:#e2e8f0; font-weight:700; font-size:0.65rem; text-transform:uppercase; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; text-align:left; }
                .report-table td { border:1px solid #e2e8f0; padding:0.35rem 0.4rem; font-size:0.75rem; }
                .report-totals-box { display:flex; justify-content:flex-end; margin-top:0.5rem; }
                .report-totals-box table { border-collapse: collapse; min-width:300px; border-top: 2px solid #1e3a5f; }
                .report-totals-box td { padding:0.3rem 0.5rem; font-size:0.8rem; }
                .watermark-text { display: none; } /* hide watermark in physical print if desired, or let it show */
                @media print { body { margin: 8mm; } }
            </style>
        </head>
        <body>
            ${modalContent.innerHTML}
        </body>
        </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 400);
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user) return;
    
    await loadCompanies();

    // Default filterPeriod to current month
    const pSel = document.getElementById('filterPeriod');
    if (pSel) pSel.value = String(new Date().getMonth() + 1);

    // If company selector changed, reload automatically
    document.getElementById('filterCia').addEventListener('change', () => {
        loadMovements();
    });
});
