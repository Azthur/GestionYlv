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

        mat.movimientos.forEach(mov => {
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
    resultados.forEach(r => {
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

    resultados.forEach(r => {
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

async function verTrazabilidad(codcia, nrodoc, tipmov, codmov) {
    if(!nrodoc) {
        alert("Ese movimiento no tiene documento asociado.");
        return;
    }
    const traceModal = new bootstrap.Modal(document.getElementById('traceModal'));
    traceModal.show();
    
    document.getElementById('traceLoader').style.display = 'block';
    document.getElementById('traceData').innerHTML = '';
    
    try {
        const url = `/api/kardex/traceability?codcia=${codcia}&nrodoc=${nrodoc}&tipmov=${tipmov}&codmov=${codmov}`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.status === 'success') {
            const d = result.data;
            let html = `
                <div class="card bg-transparent border-secondary text-white">
                    <div class="card-header border-secondary text-info fw-bold">
                        Sustento del Movimiento
                    </div>
                    <ul class="list-group list-group-flush">
                        <li class="list-group-item bg-transparent text-white border-secondary">
                            <small class="text-muted d-block">Documento de Referencia 1</small>
                            ${d.nroref1 || 'N/A'}
                        </li>
                        <li class="list-group-item bg-transparent text-white border-secondary">
                            <small class="text-muted d-block">Documento de Referencia 2</small>
                            ${d.nroref2 || 'N/A'}
                        </li>
                        <li class="list-group-item bg-transparent text-white border-secondary">
                            <small class="text-muted d-block">Glosa / Observación</small>
                            ${d.glosa || 'Sin observaciones'}
                        </li>
                        <li class="list-group-item bg-transparent text-white border-secondary">
                            <small class="text-muted d-block">Órden de Compra Relacionada</small>
                            ${d.ordcmp || 'Ninguna'}
                        </li>
                        <li class="list-group-item bg-transparent text-white border-secondary">
                            <small class="text-muted d-block">Generado por</small>
                            <span class="badge bg-primary text-white">${d.usuario}</span> el ${d.fchemi}
                        </li>
                    </ul>
                </div>
            `;
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
