$(document).ready(function() {
    // ────────────── TABS ──────────────
    $('.tab-btn').click(function() {
        $('.tab-btn').removeClass('active');
        $('.tab-content').removeClass('active');
        $(this).addClass('active');
        $('#' + $(this).data('target')).addClass('active');
    });

    // ────────────── INIT TABLES ──────────────
    const tableOrders = $('#tableOrders').DataTable({
        "language": { "url": "//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json" },
        "order": [[2, "desc"]]
    });

    const tableCostsOP = $('#tableCostsOP').DataTable({
        "language": { "url": "//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json" },
        "ordering": false,
        "paging": false
    });

    // ────────────── LOAD ORDERS ──────────────
    function loadOrders() {
        fetch('/api/production/orders')
            .then(r => r.json())
            .then(data => {
                tableOrders.clear();
                
                // Populate Dropdown for Costs tab too
                let selHtml = '<option value="">Seleccione OP...</option>';
                
                data.forEach(op => {
                    const btnCosts = `<button class="btn-action secondary btn-sm" onclick="goToCostos(${op.IdOrden})">Cargar Costos</button>`;
                    const btnReport = `<button class="btn-action success btn-sm" onclick="generateReportData(${op.IdOrden})" style="margin-left:5px">Ver Reporte</button>`;
                    
                    tableOrders.row.add([
                        `OP-${op.IdOrden}`,
                        op.NroOrden,
                        new Date(op.FchRegistro).toLocaleDateString(),
                        op.Cliente || '---',
                        op.ProductoDesc,
                        op.LotePT,
                        `${op.CantProducida || 0} UNI`,
                        btnCosts + btnReport
                    ]);
                    
                    selHtml += `<option value="${op.IdOrden}">OP-${op.IdOrden} | ${op.NroOrden} - ${op.ProductoDesc}</option>`;
                });
                
                tableOrders.draw();
                $('#selOrderForCosts').html(selHtml);
            }).catch(e => console.error(e));
    }

    loadOrders();
    window.loadOrders = loadOrders;

    window.goToCostos = function(idOrden) {
        $('.tab-btn[data-target="tab-costos"]').click();
        $('#selOrderForCosts').val(idOrden).trigger('change');
    }

    // ────────────── STAGES & COSTS ──────────────
    window.loadStagesForCost = function() {
        const idOrden = $('#selOrderForCosts').val();
        if(!idOrden) {
            $('#costsDashboard').hide();
            return;
        }

        $('#costsDashboard').show();

        // 1. Fetch Stages
        fetch(`/api/production/orders/${idOrden}/etapas`)
            .then(r => r.json())
            .then(etapas => {
                let html = '<option value="">(Cabecera OP / Global)</option>';
                etapas.forEach(e => {
                    html += `<option value="${e.IdEtapa}">${e.NombreEtapa}</option>`;
                });
                $('#selStageForCosts').html(html);
            });

        // 2. Fetch Assigned Costs
        reloadCostsTable(idOrden);
    }

    function reloadCostsTable(idOrden) {
        fetch(`/api/production/orders/${idOrden}/costs`)
            .then(r => r.json())
            .then(costs => {
                tableCostsOP.clear();
                costs.forEach(c => {
                    const stageName = c.NombreEtapa ? c.NombreEtapa : 'GLOBAL OP';
                    const fch = new Date(c.Fecha).toLocaleDateString();
                    const totalFmt = `S/ ${parseFloat(c.CostoTotal).toFixed(2)}`;
                    tableCostsOP.row.add([
                        fch,
                        c.TipoCosto,
                        stageName,
                        c.Detalle,
                        c.UnidadMedida,
                        c.Cantidad,
                        `S/ ${parseFloat(c.CostoUnitario).toFixed(2)}`,
                        totalFmt
                    ]);
                });
                tableCostsOP.draw();
            });
    }

    // Modal calc
    window.calcTotal = function() {
        const c = parseFloat($('#ciCant').val()) || 0;
        const u = parseFloat($('#ciCostoU').val()) || 0;
        $('#ciCostoT').val((c*u).toFixed(2));
    }

    window.openAddCostModal = function() {
        const idOrden = $('#selOrderForCosts').val();
        if(!idOrden) return Swal.fire('Atención', 'Seleccione una orden primero.', 'warning');
        $('#ciFecha').val(new Date().toISOString().split('T')[0]);
        $('#addCostModal').css('display', 'flex');
    }

    window.saveCost = function() {
        const payload = {
            IdOrden: parseInt($('#selOrderForCosts').val()),
            IdEtapa: $('#selStageForCosts').val() ? parseInt($('#selStageForCosts').val()) : null,
            TipoCosto: $('#ciTipo').val(),
            Fecha: $('#ciFecha').val(),
            Detalle: $('#ciDetalle').val(),
            ComprobanteRef: $('#ciComp').val(),
            UnidadMedida: $('#ciUnd').val(),
            Cantidad: parseFloat($('#ciCant').val()),
            CostoUnitario: parseFloat($('#ciCostoU').val()),
            CostoTotal: parseFloat($('#ciCostoT').val())
        };

        fetch('/api/production/costs', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        }).then(r => r.json()).then(res => {
            if(res.status == 'success') {
                $('#addCostModal').hide();
                Swal.fire('Registrado', 'Costo imputado correctamente', 'success');
                reloadCostsTable(payload.IdOrden);
            } else {
                Swal.fire('Error', res.detail, 'error');
            }
        });
    }

    // ────────────── REPORT PRINT (MOCKUP OF "IMAGE") ──────────────
    window.generateReportData = function(idOrden) {
        window.currentReportId = idOrden;
        printOrderReport();
    }

    window.printOrderReport = function() {
        const idOrden = window.currentReportId || $('#selOrderForCosts').val();
        if(!idOrden) return;

        fetch(`/api/production/reports/order/${idOrden}`)
            .then(r => r.json())
            .then(data => {
                buildPrintHTML(data);
                $('#printModal').css('display', 'flex');
            });
    }

    function buildPrintHTML(data) {
        const hdr = data.header;
        const res = data.resumen;
        const dets = data.costos_detalles;

        let html = `
            <div class="report-title-box">
                <div>
                    <h1>YELAVE INDUSTRIAS S.A.C.</h1>
                    <p style="font-size:0.75rem; color:#666;">RUC: 20608735683</p>
                </div>
                <div style="text-align:right;">
                    <h2 style="font-size:1rem; margin:0;">ORDEN DE PRODUCCIÓN Nº: ${hdr.NroOrden}</h2>
                    <h3 style="font-size:0.9rem; margin:0; color:#444;">ID-${hdr.IdOrden}</h3>
                </div>
            </div>
            
            <div class="report-grid">
                <div>
                    <b>Cliente:</b> ${hdr.Cliente || 'CLIENTE VARIOS'}<br>
                    <b>Producción:</b> YELAVE / INTERNO<br>
                    <b>F. Inicio:</b> ${hdr.FchInicio || ''}<br>
                    <b>F. Fin / Entrega:</b> ${hdr.FchFin || ''} / ${hdr.FchEntrega || ''}<br>
                    <b>Almacén destino:</b> ${hdr.Almacen || 'PT CENTRAL'}<br>
                </div>
                <div style="text-align:right;">
                    <b>Pedido Ref:</b> OP-${hdr.IdOrden}<br>
                    <b>Lote:</b> <span style="background:#e8f5e9; padding:2px 8px; font-weight:bold;">${hdr.LotePT || ''}</span><br>
                    <b>Cantidad Producidos:</b> ${hdr.CantProducida || ''} UNI<br>
                    <b>Muestras QA:</b> ${hdr.CantMuestras || '0'}<br>
                    <b>Cantidad Entregados:</b> ${hdr.CantEntregada || ''}<br>
                    <br>
                    <b style="font-size:1rem;">Costo Total: S/ ${res.Costo_Produccion_Total.toFixed(2)}</b><br>
                    <b style="font-size:1rem;">Costo Unitario: S/ ${res.Costo_Unitario.toFixed(4)}</b>
                </div>
            </div>
            <h4 style="margin-top:1rem; border-bottom:1px solid #000;">Detalle de Costos Industriales</h4>
            <table class="tbl-report">
                <thead>
                    <tr><th style="width:12%">Fecha</th><th style="width:40%">Detalle / Glosa</th><th>Doc Ref</th><th>UND</th><th>Cant</th><th>C.Uni</th><th>Costo S/</th></tr>
                </thead>
                <tbody>
        `;

        const renderRows = (arr, title) => {
            html += `<tr><td colspan="7" class="section-header">${title}</td></tr>`;
            if(!arr || arr.length === 0) {
                html += `<tr><td colspan="7" style="text-align:center; color:#999;">Sin movimientos</td></tr>`;
            } else {
                arr.forEach(r => {
                    html += `<tr>
                        <td>${new Date(r.Fecha).toLocaleDateString()}</td>
                        <td>${r.Detalle}</td>
                        <td>${r.ComprobanteRef||'-'}</td>
                        <td>${r.UnidadMedida||'-'}</td>
                        <td style="text-align:right">${r.Cantidad}</td>
                        <td style="text-align:right">${parseFloat(r.CostoUnitario).toFixed(2)}</td>
                        <td style="text-align:right; font-weight:bold;">${parseFloat(r.CostoTotal).toFixed(2)}</td>
                    </tr>`;
                });
            }
        };

        renderRows(dets.MP, 'MP - MATERIA PRIMA E INSUMOS BÁSICOS');
        renderRows(dets.MOD, 'MOD - MANO DE OBRA DIRECTA');
        renderRows(dets.MEP, 'MEP - MATERIALES AUXILIARES, ENVASES Y EMBALAJES');
        renderRows(dets.CIF, 'CIF - COSTOS INDIRECTOS DE FABRICACIÓN (Servicios, etc)');
        renderRows(dets.MAQ, 'MAQUINARIA - DEPRECIACIÓN / USO');

        html += `
                </tbody>
            </table>
            
            <div style="margin-top:2rem; padding-top:1rem; border-top:1px dashed #000; font-size:0.8rem; display:flex; justify-content:space-between;">
                <div>
                    <b>Producto:</b> ${hdr.ProductoDesc}<br>
                    <b>Presentación:</b> ${hdr.Presentacion}<br>
                    <b>Código P.T.:</b> ${hdr.CodProducto}
                </div>
                <div style="text-align:right;">
                    <table style="font-size:0.8rem; text-align:right;">
                        <tr><td>Total M. Prima:</td><td>S/ ${res.MP_Total.toFixed(2)}</td></tr>
                        <tr><td>Total M. Obra Directa:</td><td>S/ ${res.MOD_Total.toFixed(2)}</td></tr>
                        <tr><td>Total M. Auxiliares (Envases):</td><td>S/ ${res.MEP_Total.toFixed(2)}</td></tr>
                        <tr><td>Total G. Indirectos (CIF):</td><td>S/ ${res.CIF_Total.toFixed(2)}</td></tr>
                        <tr><td>Total Maquinaria:</td><td>S/ ${res.MAQ_Total.toFixed(2)}</td></tr>
                        <tr><td><b>COSTO TOTAL PRODUCCIÓN:</b></td><td><b>S/ ${res.Costo_Produccion_Total.toFixed(2)}</b></td></tr>
                    </table>
                </div>
            </div>
        `;
        $('#printArea').html(html);
    }

    // ────────────── FORMATOS SUNAT ──────────────
    const tableSunat = $('#tableSunat').DataTable({
        dom: 'Bfrtip',
        buttons: ['copy', 'excel', 'pdf'],
        language: { url: "//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json" },
        paging: false
    });

    $('#sunatFormat').change(function() {
        if($(this).val() == '10.2') { $('#sunatMonthGroup').show(); } 
        else { $('#sunatMonthGroup').hide(); }
    });

    window.generateSunatReport = function() {
        const fmt = $('#sunatFormat').val();
        const y = $('#sunatYear').val();
        const m = $('#sunatMonth').val();
        
        $('#sunatTitleResult').text(`FORMATO ${fmt} - EJERCICIO ${y}`);
        $('#sunatResults').show();
        
        fetch(`/api/production/reports/sunat/10?formato=${fmt}&year=${y}&month=${m}`)
            .then(r => r.json())
            .then(res => {
                tableSunat.clear();
                let thead = '';
                
                if(fmt == '10.1') {
                    thead = '<th>Elemento de Costo</th><th>Costo Total Año (S/)</th>';
                    $('#sunatThead').html(thead);
                    tableSunat.destroy(); $('#tableSunat').empty().html(`<thead><tr>${thead}</tr></thead><tbody></tbody>`);
                    window.ts = $('#tableSunat').DataTable({dom: 'Bfrtip', buttons: ['excel', 'pdf']});
                    
                    res.data.forEach(d => window.ts.row.add([d.TipoCosto, d.Total]).draw());
                } 
                else if(fmt == '10.2') {
                    thead = '<th>Lote</th><th>Producto</th><th>Tipo Costo</th><th>Total (S/)</th>';
                    $('#sunatThead').html(thead);
                    tableSunat.destroy(); $('#tableSunat').empty().html(`<thead><tr>${thead}</tr></thead><tbody></tbody>`);
                    window.ts = $('#tableSunat').DataTable({dom: 'Bfrtip', buttons: ['excel', 'pdf']});
                    
                    res.data.forEach(d => window.ts.row.add([d.LotePT, d.ProductoDesc, d.TipoCosto, d.Total]).draw());
                }
                else if(fmt == '10.3') {
                    thead = '<th>Producto</th><th>Presentación</th><th>Unidades Producidas</th><th>Costo Valorizado (S/)</th>';
                    $('#sunatThead').html(thead);
                    tableSunat.destroy(); $('#tableSunat').empty().html(`<thead><tr>${thead}</tr></thead><tbody></tbody>`);
                    window.ts = $('#tableSunat').DataTable({dom: 'Bfrtip', buttons: ['excel', 'pdf']});
                    
                    res.data.forEach(d => window.ts.row.add([d.ProductoDesc, d.Presentacion, d.Unidades, d.CostoValorizado]).draw());
                }
            });
    }

    // Modal Create Order logic (simplified, mainly for testing structure)
    window.openCreateOrderModal = async function() {
        const { value: formValues } = await Swal.fire({
            title: 'Nueva OP (Demo Rapida)',
            html:
                '<input id="swal-nro" class="swal2-input" placeholder="Nro Correlativo">' +
                '<input id="swal-prod" class="swal2-input" placeholder="Nombre Producto">' +
                '<input id="swal-lote" class="swal2-input" placeholder="Lote PT">',
            focusConfirm: false,
            preConfirm: () => {
                return {
                    NroOrden: document.getElementById('swal-nro').value || '001',
                    ProductoDesc: document.getElementById('swal-prod').value || 'Producto Demo',
                    LotePT: document.getElementById('swal-lote').value || 'LOTE001',
                    Cliente: 'YELAVE', FchInicio: '2026-03-01', FchFin: '2026-03-10', FchEntrega: '2026-03-11',
                    Almacen: 'CENTRAL', CodProducto: 'PT-001', Presentacion: '500ML', CantPlanificada: 100, CantProducida: 100, CantMuestras: 2, CantEntregada: 98,
                    Etapas: [{NombreEtapa:'Proceso I (Mezcla)', OrdenSecuencia:1}, {NombreEtapa:'Proceso II (Envasado)', OrdenSecuencia:2}]
                }
            }
        });
        
        if (formValues) {
            fetch('/api/production/orders', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(formValues)
            }).then(r=>r.json()).then(res=>{
                Swal.fire('Éxito', `Orden creada con ID ${res.IdOrden}`, 'success');
                loadOrders();
            });
        }
    }
});
