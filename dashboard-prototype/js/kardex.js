document.addEventListener('DOMContentLoaded', () => {
    loadCompanies();
    
    // Set default dates
    const today = new Date();
    document.getElementById('fechaFin').valueAsDate = today;
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('fechaInicio').valueAsDate = firstDay;

    document.getElementById('kardexForm').addEventListener('submit', handleFormSubmit);
    
    // Tab tracking
    const tabs = document.querySelectorAll('button[data-bs-toggle="tab"]');
    tabs.forEach(tab => {
        tab.addEventListener('shown.bs.tab', (event) => {
            // Re-render or fetch based on active tab
            // For now, submitting the form handles everything
        });
    });
});

async function loadCompanies() {
    try {
        const token = localStorage.getItem('yelave_token');
        const response = await fetch('/api/permisos/empresas/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Error al cargar empresas');
        const companies = await response.json();
        const select = document.getElementById('empresa');
        select.innerHTML = ''; // Clear default if any
        
        companies.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.codcia;
            opt.textContent = `${c.codcia} - ${c.nomcia}`;
            select.appendChild(opt);
        });

        // Default selection
        const cu = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        if (cu.codcia) select.value = cu.codcia;
        else if (companies.length > 0) select.value = companies[0].codcia;

    } catch (e) {
        console.error(e);
        document.getElementById('empresa').innerHTML = '<option value="" disabled>Sin acceso a empresas</option>';
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const empresa = document.getElementById('empresa').value;
    const formato = document.getElementById('formato').value;
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;
    const codMatDesde = document.getElementById('codMatDesde').value;
    const codMatHasta = document.getElementById('codMatHasta').value;

    const loader = document.getElementById('loader');
    const container = document.getElementById('resultadosContainer');
    
    container.style.display = 'block';
    loader.style.display = 'block';
    
    document.getElementById('reporteContent').innerHTML = '';
    document.getElementById('stockContent').innerHTML = '';
    document.getElementById('costoContent').innerHTML = '';

    // Determine active tab
    const activeTabObj = document.querySelector('button[data-bs-toggle="tab"].active');
    const activeTab = activeTabObj ? activeTabObj.id : 'kardex-tab';
    
    try {
        if (activeTab === 'kardex-tab') {
            const query = new URLSearchParams({
                codcia: empresa, formato: formato, start_date: fechaInicio, end_date: fechaFin
            });
            if (codMatDesde) query.append('codmat_from', codMatDesde);
            if (codMatHasta) query.append('codmat_to', codMatHasta);
            
            const response = await fetch(`/api/kardex/report?${query}`);
            if (!response.ok) throw new Error('Error al generar Kardex');
            const data = await response.json();
            renderizarKardex(data, formato);
        } 
        else if (activeTab === 'stock-tab') {
            const query = new URLSearchParams({
                codcia: empresa, fecha_corte: fechaFin
            });
            const response = await fetch(`/api/kardex/stock?${query}`);
            if (!response.ok) throw new Error('Error al generar Stock');
            const data = await response.json();
            renderizarStock(data);
        }
        else if (activeTab === 'costo-tab') {
            const query = new URLSearchParams({
                codcia: empresa, start_date: fechaInicio, end_date: fechaFin
            });
            const response = await fetch(`/api/kardex/costo-ventas?${query}`);
            if (!response.ok) throw new Error('Error al generar Costo de Ventas');
            const data = await response.json();
            renderizarCostoVentas(data);
        }
    } catch (e) {
        console.error(e);
        const errHtml = `<div class="alert alert-danger">Error: ${e.message}</div>`;
        if(activeTab === 'kardex-tab') document.getElementById('reporteContent').innerHTML = errHtml;
        if(activeTab === 'stock-tab') document.getElementById('stockContent').innerHTML = errHtml;
        if(activeTab === 'costo-tab') document.getElementById('costoContent').innerHTML = errHtml;
    } finally {
        loader.style.display = 'none';
    }
}

function renderizarKardex(data, formato) {
    const isValorizado = formato === '13.1';
    let html = '';
    const emp = data.empresa || {};
    const resultados = data.resultados || [];

    if (resultados.length === 0) {
        document.getElementById('reporteContent').innerHTML = `<div class="alert alert-info">No se encontraron movimientos para los filtros seleccionados.</div>`;
        return;
    }

    resultados.forEach(mat => {
        let title12 = `FORMATO 12.1: REGISTRO DE INVENTARIO PERMANENTE EN UNIDADES FISICAS - DETALLE DEL INVENTARIO PERMANENTE EN UNIDADES FISICAS`;
        let title13 = `FORMATO 13.1: REGISTRO DE INVENTARIO PERMANENTE VALORIZADO - DETALLE DEL INVENTARIO VALORIZADO`;
        
        let headerHtml = `
            <div class="mb-5 p-4 bg-white text-dark rounded shadow-sm" style="font-family: 'Courier New', Courier, monospace; font-size: 13px;">
                <h6 class="fw-bold mb-4">${isValorizado ? title13 : title12}</h6>
                <table class="table table-borderless table-sm mb-4" style="width: auto; margin-bottom: 20px;">
                    <tr><td width="350">PERIODO</td><td>${data.periodo || ''}</td></tr>
                    <tr><td>RUC</td><td>${emp.ruccia || ''}</td></tr>
                    <tr><td>APELLIDOS Y NOMBRES, DENOMINACION O RAZON SOCIAL</td><td>${emp.nomcia || ''}</td></tr>
                    <tr><td>ESTABLECIMIENTO(1)</td><td>0001</td></tr>
                    <tr><td>CODIGO DE LA EXISTENCIA</td><td>${mat.codmat}</td></tr>
                    <tr><td>TIPO(TABLA 5)</td><td>${mat.codfam || '-'}</td></tr>
                    <tr><td>DESCRIPCION</td><td>${mat.desmat}</td></tr>
                    <tr><td>CODIGO DE LA UNIDAD DE MEDIDA(TABLA 6)</td><td>${mat.undstk}</td></tr>
                    ${isValorizado ? '<tr><td>METODO DE VALUACION</td><td>PROMEDIO</td></tr>' : ''}
                </table>
        `;

        let tableHtml = `
            <div class="table-responsive border border-2 border-dark">
                <table class="table table-bordered border-dark table-sm mb-0 text-center align-middle" style="font-size: 11px;">
                    <thead class="table-light border-dark">
                        <tr>
                            <th colspan="4" class="align-middle">DOCUMENTO DE TRASLADO, COMPROBANTE DE PAGO, DOCUMENTO INTERNO O SIMILAR</th>
                            <th rowspan="2" class="align-middle" style="width: 80px;">TIPO DE OPERACIÓ N</th>
                            <th colspan="${isValorizado ? '3' : '1'}" class="align-middle">ENTRADAS</th>
                            <th colspan="${isValorizado ? '3' : '1'}" class="align-middle">SALIDAS</th>
                            <th colspan="${isValorizado ? '3' : '1'}" class="align-middle">SALDO FINAL</th>
                            <th rowspan="2" class="align-middle">TRAZ.</th>
                        </tr>
                        <tr>
                            <th class="align-middle">FECHA</th>
                            <th class="align-middle">TIPO</th>
                            <th class="align-middle">SERIE</th>
                            <th class="align-middle">NUMERO</th>
                            
                            ${isValorizado ? `
                            <th class="align-middle">CANTIDAD</th>
                            <th class="align-middle">C. UNIT.</th>
                            <th class="align-middle">COSTO TOTAL</th>
                            <th class="align-middle">CANTIDAD</th>
                            <th class="align-middle">C. UNIT.</th>
                            <th class="align-middle">COSTO TOTAL</th>
                            <th class="align-middle">CANTIDAD</th>
                            <th class="align-middle">C. UNIT.</th>
                            <th class="align-middle">COSTO TOTAL</th>
                            ` : `
                            <th class="align-middle">ENTRADAS</th>
                            <th class="align-middle">SALIDAS</th>
                            <th class="align-middle">SALDO FINAL</th>
                            `}
                        </tr>
                    </thead>
                    <tbody class="border-dark">
                        <!-- Saldo Inicial -->
                        <tr>
                            <td colspan="5" class="text-end fw-bold">TOTALES / SALDO INICIAL</td>
                            ${isValorizado ? `
                            <td></td><td></td><td></td>
                            <td></td><td></td><td></td>
                            <td class="text-end fw-bold">${formatNum(mat.saldo_inicial_fisico)}</td>
                            <td class="text-end">${formatNum(mat.saldo_inicial_fisico > 0 ? mat.saldo_inicial_valorizado/mat.saldo_inicial_fisico : 0)}</td>
                            <td class="text-end fw-bold">${formatNum(mat.saldo_inicial_valorizado)}</td>
                            ` : `
                            <td></td><td></td>
                            <td class="text-end fw-bold">${formatNum(mat.saldo_inicial_fisico)}</td>
                            `}
                            <td></td>
                        </tr>
        `;

        let totEntradasCant = 0;
        let totEntradasTotal = 0;
        let totSalidasCant = 0;
        let totSalidasTotal = 0;

        mat.movimientos.forEach(mov => {
            totEntradasCant += (mov.entradas_cant || 0);
            totEntradasTotal += (mov.entradas_costo_total || 0);
            totSalidasCant += (mov.salidas_cant || 0);
            totSalidasTotal += (mov.salidas_costo_total || 0);

            let traceBtn = `<button class="btn btn-sm btn-outline-primary" style="padding: 2px 6px; font-size:10px;" onclick="verTrazabilidad('${emp.codcia}', '${mov.numero_doc}', '${mov.tipo_operacion}', '${mov.serie_doc}')">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            </button>`;
            tableHtml += `
                <tr>
                    <td>${mov.fecha || ''}</td>
                    <td>${mov.tipo_doc || ''}</td>
                    <td>${mov.serie_doc || ''}</td>
                    <td>${mov.numero_doc || ''}</td>
                    <td>${mov.tipo_operacion || ''}</td>
                    
                    ${isValorizado ? `
                    <td class="text-end">${formatNum(mov.entradas_cant, true)}</td>
                    <td class="text-end">${formatNum(mov.entradas_costo_uni, true)}</td>
                    <td class="text-end">${formatNum(mov.entradas_costo_total, true)}</td>
                    
                    <td class="text-end">${formatNum(mov.salidas_cant, true)}</td>
                    <td class="text-end">${formatNum(mov.salidas_costo_uni, true)}</td>
                    <td class="text-end">${formatNum(mov.salidas_costo_total, true)}</td>
                    
                    <td class="text-end">${formatNum(mov.saldo_cant)}</td>
                    <td class="text-end">${formatNum(mov.saldo_costo_uni)}</td>
                    <td class="text-end">${formatNum(mov.saldo_costo_total)}</td>
                    ` : `
                    <td class="text-end">${formatNum(mov.entradas_cant, true)}</td>
                    <td class="text-end">${formatNum(mov.salidas_cant, true)}</td>
                    <td class="text-end">${formatNum(mov.saldo_cant)}</td>
                    `}
                    <td>${traceBtn}</td>
                </tr>
            `;
        });

        tableHtml += `
                        <tr class="table-light border-dark fw-bold">
                            <td colspan="5" class="text-end">TOTALES DEL PERIODO:</td>
                            ${isValorizado ? `
                            <td class="text-end text-primary">${formatNum(totEntradasCant)}</td>
                            <td></td>
                            <td class="text-end text-primary">${formatNum(totEntradasTotal)}</td>
                            
                            <td class="text-end text-danger">${formatNum(totSalidasCant)}</td>
                            <td></td>
                            <td class="text-end text-danger">${formatNum(totSalidasTotal)}</td>
                            
                            <td colspan="3"></td>
                            ` : `
                            <td class="text-end text-primary">${formatNum(totEntradasCant)}</td>
                            <td class="text-end text-danger">${formatNum(totSalidasCant)}</td>
                            <td></td>
                            `}
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        `;
        html += headerHtml + tableHtml;
    });

    document.getElementById('reporteContent').innerHTML = html;
}

function renderizarStock(data) {
    const emp = data.empresa || {};
    const resultados = data.resultados || [];
    
    let html = `
        <div class="mb-5 p-4 bg-white text-dark rounded shadow-sm" style="font-family: 'Courier New', Courier, monospace; font-size: 13px;">
            <div class="d-flex justify-content-between mb-3 border-bottom border-2 border-dark pb-2">
                <div>
                    <div><strong>EMPRESA : </strong>${emp.nomcia || ''}</div>
                    <div><strong>RUC     : </strong>${emp.ruccia || ''}</div>
                    <div><strong>DIRECCION: </strong>${emp.dircia || ''}</div>
                </div>
                <div class="text-end">
                    <h5 class="fw-bold fs-5">REPORTE STOCK Al ${data.fecha_corte || ''}</h5>
                    <div>Generado el ${new Date().toLocaleString()}</div>
                </div>
            </div>
            <div class="table-responsive">
                <table class="table table-bordered border-dark table-sm table-hover align-middle" style="font-size: 12px;">
                    <thead class="table-light border-dark text-center">
                        <tr>
                            <th>N°</th>
                            <th>CODIGO</th>
                            <th>DESCRIPCION</th>
                            <th>U. MEDIDA</th>
                            <th>CANTIDAD</th>
                            <th>C. UNIT.</th>
                            <th>COSTO TOTAL</th>
                            <th>ACCIÓN</th>
                        </tr>
                    </thead>
                    <tbody class="border-dark">
    `;
    
    if(resultados.length === 0) {
        html += `<tr><td colspan="7" class="text-center">No hay stock disponible a la fecha seleccionada.</td></tr>`;
    }

    let i = 1;
    let totCantidad = 0;
    let totCostoTotal = 0;

    resultados.forEach(r => {
        totCantidad += (r.cantidad || 0);
        totCostoTotal += (r.costo_total || 0);

        html += `
            <tr>
                <td class="text-center">${i++}</td>
                <td>${r.codmat}</td>
                <td>${r.desmat}</td>
                <td class="text-center">${r.undstk}</td>
                <td class="text-end">${formatNum(r.cantidad)}</td>
                <td class="text-end">${formatNum(r.costo_unitario)}</td>
                <td class="text-end">${formatNum(r.costo_total)}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-info" style="padding: 2px 6px; font-size:10px;" onclick="verMovimientosMaterial('${r.codmat}')" title="Ver Movimientos">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    </button>
                </td>
            </tr>
        `;
    });

    if (resultados.length > 0) {
        html += `
            <tr class="table-light border-dark fw-bold">
                <td colspan="4" class="text-end">TOTAL STOCK GENERAL:</td>
                <td class="text-end text-primary">${formatNum(totCantidad)}</td>
                <td></td>
                <td class="text-end text-primary">${formatNum(totCostoTotal)}</td>
                <td></td>
            </tr>
        `;
    }
    
    html += `</tbody></table></div></div>`;
    document.getElementById('stockContent').innerHTML = html;
}

function renderizarCostoVentas(data) {
    const emp = data.empresa || {};
    const resultados = data.resultados || [];
    
    let html = `
        <div class="mb-5 p-4 bg-white text-dark rounded shadow-sm" style="font-family: 'Courier New', Courier, monospace; font-size: 13px;">
            <div class="d-flex justify-content-between mb-3 border-bottom border-2 border-dark pb-2">
                <div>
                    <div><strong>EMPRESA : </strong>${emp.nomcia || ''}</div>
                    <div><strong>RUC     : </strong>${emp.ruccia || ''}</div>
                    <div><strong>DIRECCION: </strong>${emp.dircia || ''}</div>
                </div>
                <div class="text-end">
                    <h5 class="fw-bold fs-5">REPORTE COSTO DE VENTA</h5>
                    <div>Generado el ${new Date().toLocaleString()}</div>
                </div>
            </div>
            <div class="table-responsive">
                <table class="table table-bordered border-dark table-sm table-hover align-middle text-center" style="font-size: 11px;">
                    <thead class="table-light border-dark">
                        <tr>
                            <th rowspan="2" class="align-middle">DETALLE O DESCRIPCION<br>DEL PRODUCTO</th>
                            <th colspan="2">INVENTARIO INICIAL</th>
                            <th colspan="2">ENTRADAS</th>
                            <th colspan="2">SALIDAS</th>
                            <th colspan="2">SALDO FINAL</th>
                            <th colspan="2">COSTO DE VENTA</th>
                            <th rowspan="2" class="align-middle">ACCIÓN</th>
                        </tr>
                        <tr>
                            <th>CANTIDAD</th><th>TOTAL</th>
                            <th>CANTIDAD</th><th>TOTAL</th>
                            <th>CANTIDAD</th><th>TOTAL</th>
                            <th>CANTIDAD</th><th>TOTAL</th>
                            <th>C. UNIT.</th><th>TOTAL</th>
                        </tr>
                    </thead>
                    <tbody class="border-dark">
    `;
    
    if(resultados.length === 0) {
        html += `<tr><td colspan="11">No hay datos en el periodo.</td></tr>`;
    }

    let totIniCant = 0, totIniTotal = 0;
    let totEntCant = 0, totEntTotal = 0;
    let totSalCant = 0, totSalTotal = 0;
    let totFinCant = 0, totFinTotal = 0;
    let totCostoVentaTotal = 0;

    resultados.forEach(r => {
        totIniCant += (r.inventario_inicial_cant || 0);
        totIniTotal += (r.inventario_inicial_total || 0);
        totEntCant += (r.entradas_cant || 0);
        totEntTotal += (r.entradas_total || 0);
        totSalCant += (r.salidas_cant || 0);
        totSalTotal += (r.salidas_total || 0);
        totFinCant += (r.saldo_final_cant || 0);
        totFinTotal += (r.saldo_final_total || 0);
        totCostoVentaTotal += (r.costo_venta_total || 0);

        html += `
            <tr>
                <td class="text-start">${r.codmat} - ${r.desmat}</td>
                <td class="text-end">${formatNum(r.inventario_inicial_cant)}</td>
                <td class="text-end">${formatNum(r.inventario_inicial_total)}</td>
                
                <td class="text-end">${formatNum(r.entradas_cant)}</td>
                <td class="text-end">${formatNum(r.entradas_total)}</td>
                
                <td class="text-end">${formatNum(r.salidas_cant)}</td>
                <td class="text-end">${formatNum(r.salidas_total)}</td>
                
                <td class="text-end">${formatNum(r.saldo_final_cant)}</td>
                <td class="text-end">${formatNum(r.saldo_final_total)}</td>
                
                <td class="text-end">${formatNum(r.costo_venta_unitario)}</td>
                <td class="text-end">${formatNum(r.costo_venta_total)}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-info" style="padding: 2px 6px; font-size:10px;" onclick="verMovimientosMaterial('${r.codmat}')" title="Ver Movimientos">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    </button>
                </td>
            </tr>
        `;
    });

    if (resultados.length > 0) {
        html += `
            <tr class="table-light border-dark fw-bold">
                <td class="text-end">TOTAL GENERAL:</td>
                <td class="text-end">${formatNum(totIniCant)}</td>
                <td class="text-end">${formatNum(totIniTotal)}</td>
                <td class="text-end text-primary">${formatNum(totEntCant)}</td>
                <td class="text-end text-primary">${formatNum(totEntTotal)}</td>
                <td class="text-end text-danger">${formatNum(totSalCant)}</td>
                <td class="text-end text-danger">${formatNum(totSalTotal)}</td>
                <td class="text-end">${formatNum(totFinCant)}</td>
                <td class="text-end">${formatNum(totFinTotal)}</td>
                <td></td>
                <td class="text-end text-success">${formatNum(totCostoVentaTotal)}</td>
                <td></td>
            </tr>
        `;
    }
    
    html += `</tbody></table></div></div>`;
    document.getElementById('costoContent').innerHTML = html;
}

// FORMAT UTIL
function formatNum(num, hideZero = false) {
    if (!num && hideZero) return '';
    if (!num) return '0.00';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// TRACEABILITY LOGIC
function verMovimientosMaterial(codmat) {
    document.getElementById('codMatDesde').value = codmat;
    document.getElementById('codMatHasta').value = codmat;
    document.getElementById('kardex-tab').click(); // Switch to Kardex tab
    document.getElementById('kardexForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); // Auto-submit
}

function closeTraceModal() {
    const traceOverlay = document.getElementById('traceModal');
    if(traceOverlay) traceOverlay.classList.remove('active');
}

async function verTrazabilidad(codcia, nrodoc, tipmov, codmov) {
    if (!nrodoc || nrodoc.trim() === '') {
        alert("Ese movimiento no tiene documento asociado.");
        return;
    }
    const traceOverlay = document.getElementById('traceModal');
    traceOverlay.classList.add('active');
    document.getElementById('traceData').innerHTML = '';
    document.getElementById('traceLoader').style.display = 'block';
    
    try {
        const url = `/api/kardex/traceability?codcia=${codcia}&nrodoc=${nrodoc}&tipmov=${tipmov}&codmov=${codmov}`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.status === 'success' && result.vouchers && result.vouchers.length > 0) {
            let html = '';
            const co = result.company;
            
            result.vouchers.forEach((v, idx) => {
                const h = v.header;
                const isAnulado = h.estado && h.estado.trim().toUpperCase() === 'A';
                
                html += `<div style="padding:1.5rem; background:#fff; font-family:'Inter',Arial,sans-serif; color:#1a1a1a; font-size:0.8125rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); ${idx > 0 ? 'margin-top:1.5rem;' : ''}">`;
                
                // Header Band
                html += `
                <div style="text-align:center; font-weight:bold; font-size:1.1rem; color:var(--primary); margin-bottom:1.5rem; text-transform:uppercase; letter-spacing:1px;">
                    📦 Detalle de Movimientos Almacén
                </div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:1rem; margin-bottom:1rem; border-bottom:3px solid #1e3a5f;">
                    <div>
                        <h2 style="font-size:1.15rem; font-weight:700; color:#1e3a5f; margin:0 0 0.15rem 0;">${co.nomcia || 'EMPRESA'}</h2>
                        <p style="font-size:0.75rem; color:#6b7280; margin:0;">${co.dircia || ''}</p>
                    </div>
                    <div style="text-align:right; background:#1e3a5f; color:#fff; padding:0.75rem 1.25rem; border-radius:8px; min-width:180px;">
                        <div style="font-size:0.65rem; text-transform:uppercase; letter-spacing:1px; opacity:0.8;">Documento N°</div>
                        <div style="font-size:1.4rem; font-weight:700;">${h.nrodoc}</div>
                        <div style="font-size:0.8rem; opacity:0.9;">${h.fchdoc}</div>
                    </div>
                </div>`;
                
                // Info Box
                html += `
                <div style="font-size:0.8rem; margin-bottom:1rem; font-weight:600; color:#1e3a5f;">
                    ${h.almacen} &nbsp; ${h.des_almacen}
                </div>
                <div style="display:grid; grid-template-columns:100px 1fr 100px 1fr; gap:0.3rem 0.5rem; font-size:0.75rem; padding:0.85rem 1rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:0.75rem;">
                    <span style="font-weight:600; color:#64748b;">Movimiento :</span><span style="color:#0f172a;">${h.tipmov} &nbsp; ${h.codmov} &nbsp; ${h.des_movimiento}</span>
                    <span style="font-weight:600; color:#64748b;">Documento :</span><span style="color:#0f172a; font-weight:bold;">${h.nrodoc}</span>
                    ${h.proveedor ? `<span style="font-weight:600; color:#64748b;">Prov / Cli :</span><span style="color:#0f172a;">${h.ruc_proveedor} &nbsp; ${h.proveedor}</span>` : ''}
                    <span style="font-weight:600; color:#64748b;">Moneda :</span><span style="color:#0f172a;">${h.moneda}</span>
                    <span style="font-weight:600; color:#64748b;">T.Cambio :</span><span style="color:#0f172a;">${formatNum(h.tipo_cambio)}</span>
                    <span style="font-weight:600; color:#64748b;">Fecha :</span><span style="color:#0f172a;">${h.fchdoc}</span>
                    <span style="font-weight:600; color:#64748b;">USUARIO :</span><span style="color:#0f172a; font-weight:bold;">${h.usuario}</span>
                    ${h.ordcmp ? `<span style="font-weight:600; color:#64748b;">O. Compra :</span><span style="color:#0f172a;">${h.ordcmp}</span>` : ''}
                </div>`;
                
                if (h.referencias && h.referencias.length > 0) {
                    html += `<div style="font-size:0.775rem; padding:0.5rem 1rem; background:#f0f4ff; border:1px solid #c7d2fe; border-radius:6px; margin-bottom:0.75rem;">
                        <strong>Documentos de Referencia:</strong><br>`;
                    h.referencias.forEach(r => { html += `<span style="margin-right:1.5rem; color:#1e40af;">${r}</span>`; });
                    html += `</div>`;
                }
                
                if (h.observacion) {
                    html += `<div style="font-size:0.775rem; margin-bottom:0.75rem; color:#334155;"><strong>Observación:</strong> ${h.observacion}</div>`;
                }
                
                if (isAnulado) {
                    html += `<div style="text-align:center; padding:0.75rem; background:#fee2e2; border:2px solid #ef4444; border-radius:8px; margin-bottom:1rem; font-weight:700; color:#991b1b; font-size:1rem;">** A N U L A D O **</div>`;
                }
                
                // Items Table
                html += `
                <table style="width:100%; border-collapse:collapse; margin-top:0.25rem;">
                    <thead><tr>
                        <th style="background:#e2e8f0; font-weight:700; font-size:0.65rem; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; width:30px; text-align:center;">Ite</th>
                        <th style="background:#e2e8f0; font-weight:700; font-size:0.65rem; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; width:80px;">Artículo</th>
                        <th style="background:#e2e8f0; font-weight:700; font-size:0.65rem; color:#334155; padding:0.4rem; border:1px solid #cbd5e1;">Descripción</th>
                        <th style="background:#e2e8f0; font-weight:700; font-size:0.65rem; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; width:45px; text-align:center;">Unidad</th>
                        <th style="background:#e2e8f0; font-weight:700; font-size:0.65rem; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; width:80px;">NROLOTE</th>
                        <th style="background:#e2e8f0; font-weight:700; font-size:0.65rem; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; width:75px;">Fch. Vto</th>
                        <th style="background:#e2e8f0; font-weight:700; font-size:0.65rem; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; width:80px; text-align:right;">Cantidad</th>
                        <th style="background:#e2e8f0; font-weight:700; font-size:0.65rem; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; width:80px; text-align:right;">Precio</th>
                        <th style="background:#e2e8f0; font-weight:700; font-size:0.65rem; color:#334155; padding:0.4rem; border:1px solid #cbd5e1; width:90px; text-align:right;">Total</th>
                    </tr></thead><tbody>`;
                    
                if (v.items.length === 0) {
                    html += '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:1.5rem; border:1px solid #e2e8f0;">Sin ítems</td></tr>';
                } else {
                    v.items.forEach(it => {
                        html += `<tr>
                            <td style="border:1px solid #e2e8f0; padding:0.35rem; text-align:center; font-weight:600;">${it.nroitm}</td>
                            <td style="border:1px solid #e2e8f0; padding:0.35rem; font-family:monospace; font-size:0.725rem;">${it.codmat}</td>
                            <td style="border:1px solid #e2e8f0; padding:0.35rem; font-weight:500;">${it.desmat}</td>
                            <td style="border:1px solid #e2e8f0; padding:0.35rem; text-align:center; font-size:0.75rem;">${it.undstk}</td>
                            <td style="border:1px solid #e2e8f0; padding:0.35rem; font-family:monospace; font-size:0.725rem;">${it.nrolote || ''}</td>
                            <td style="border:1px solid #e2e8f0; padding:0.35rem; font-size:0.75rem;">${it.fchlote || ''}</td>
                            <td style="border:1px solid #e2e8f0; padding:0.35rem; text-align:right; font-weight:600;">${formatNum(it.candes)}</td>
                            <td style="border:1px solid #e2e8f0; padding:0.35rem; text-align:right;">${formatNum(it.preuni)}</td>
                            <td style="border:1px solid #e2e8f0; padding:0.35rem; text-align:right; font-weight:600; color:var(--primary);">${formatNum(it.impcto)}</td>
                        </tr>`;
                    });
                }
                html += '</tbody></table>';
                
                // Totals
                html += `
                <div style="display:flex; justify-content:flex-end; margin-top:0.5rem;">
                    <table>
                        <tr>
                            <td style="text-align:right; font-weight:700; font-size:0.875rem; padding:0.5rem 1rem;">TOTAL :</td>
                            <td style="text-align:right; min-width:90px; font-weight:600; padding:0.3rem 0.5rem;">${formatNum(h.total_cantidad)}</td>
                            <td style="text-align:right; min-width:90px; font-weight:600; padding:0.3rem 0.5rem;">${formatNum(h.total_precio)}</td>
                            <td style="text-align:right; min-width:100px; font-weight:700; color:var(--primary); font-size:0.9rem; padding:0.3rem 0.5rem;">${formatNum(h.total_importe)}</td>
                        </tr>
                    </table>
                </div>`;
                
                html += '</div>';
            });
            document.getElementById('traceData').innerHTML = html;
        } else {
            document.getElementById('traceData').innerHTML = `<div class="alert alert-warning">${result.message}</div>`;
        }
    } catch (e) {
        document.getElementById('traceData').innerHTML = `<div class="alert alert-danger">Error: ${e.message}</div>`;
    } finally {
        document.getElementById('traceLoader').style.display = 'none';
    }
}

// EXPORT TO EXCEL LOGIC
function exportKardexToExcel() {
    let activeTabId = '';
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabPanes.forEach(pane => {
        if (pane.classList.contains('active')) activeTabId = pane.id;
    });

    if (!activeTabId) {
        alert("No hay ningún reporte activo para exportar.");
        return;
    }

    try {
        if (typeof XLSX === 'undefined') {
            alert("La librería de Excel no ha terminado de cargar.");
            return;
        }

        const container = document.getElementById(
            activeTabId === 'tab-kardex' ? 'reporteContent' : 
            (activeTabId === 'tab-costo' ? 'costoContent' : 'stockContent')
        );

        if (!container || container.innerHTML.trim() === "" || container.querySelector('.alert')) {
            alert("No hay datos para exportar.");
            return;
        }

        // Create a temporary hidden container to prepare the export data
        const tempDiv = document.createElement('div');
        tempDiv.style.display = 'none';
        tempDiv.innerHTML = container.innerHTML;
        document.body.appendChild(tempDiv);

        // CLEANUP: Remove buttons and UI elements from the export
        const buttons = tempDiv.querySelectorAll('button, .btn, .no-export');
        buttons.forEach(btn => btn.remove());

        // For Kardex and Costo, we have multiple sections. 
        // Let's create one big table to export.
        const workbook = XLSX.utils.book_new();
        let ws;

        if (activeTabId === 'tab-kardex' || activeTabId === 'tab-costo') {
            // We use table_to_sheet on the whole container to preserve colspans/rowspans
            ws = XLSX.utils.table_to_sheet(tempDiv, { raw: true });
        } else {
            // Stock report is simpler
            const stockTable = tempDiv.querySelector('table');
            ws = XLSX.utils.table_to_sheet(stockTable, { raw: true });
        }

        // Set column widths (approximate)
        const wscols = [
            {wch: 12}, {wch: 8}, {wch: 8}, {wch: 15}, {wch: 10}, 
            {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}
        ];
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(workbook, ws, "Reporte");
        
        const filename = activeTabId === 'tab-kardex' ? 'Kardex_SUNAT.xlsx' : 
                         (activeTabId === 'tab-costo' ? 'Costo_Ventas.xlsx' : 'Stock_Almacen.xlsx');
        
        XLSX.writeFile(workbook, filename);
        
        // Cleanup
        document.body.removeChild(tempDiv);

    } catch (e) {
        console.error(e);
        alert("Error al exportar a Excel: " + e.message);
    }
}
