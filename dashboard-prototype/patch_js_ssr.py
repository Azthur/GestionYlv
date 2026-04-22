import re

with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'r', encoding='utf-8') as f:
    text = f.read()

start_idx = text.find('async function loadOCsDisponibles() {')
if start_idx != -1:
    end_idx = text.find('async function loadCargosRecibidos()', start_idx)
    func_text = text[start_idx:end_idx]
    
    new_func = """async function loadOCsDisponibles() {
    const codcia = document.getElementById('filterCia').value;
    if (!codcia) { Swal.fire('Atención', 'Seleccione una empresa.', 'warning'); return; }

    const ano = document.getElementById('filterAno').value;
    const mes = document.getElementById('filterMes').value;
    const tipoCargo = document.getElementById('tipoCargo').value;
    
    // Filtros de Logística
    const filterTipoOc = document.getElementById('filterTipoOC') ? document.getElementById('filterTipoOC').value : 'ALL';
    const filterMine = document.getElementById('filterMyRecords') ? document.getElementById('filterMyRecords').checked : true;
    const filterDirectas = document.getElementById('filterDirectasCont') ? document.getElementById('filterDirectasCont').checked : false;

    if (ocsDT) { ocsDT.destroy(); ocsDT = null; }

    try {
        ocsDT = $('#ocsDisponiblesTable').DataTable({
            serverSide: true,
            processing: true,
            destroy: true,
            ordering: false,
            pageLength: 10,
            language: { 
                url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',
                processing: '<div style="background:rgba(255,255,255,0.8); z-index:99; position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#2563eb; font-weight:700;"><i class="fa fa-spinner fa-spin fa-2x fa-fw"></i> Cargando OCs...</div>'
            },
            ajax: {
                url: '/api/cargos/ocs-disponibles-ssr',
                type: 'GET',
                data: function(d) {
                    d.codcia = codcia;
                    d.ano = ano;
                    d.mes = mes;
                    d.tipo_cargo = tipoCargo;
                    d.login = currentUser;
                    d.tipo_oc = filterTipoOc;
                    d.only_my_records = filterMine;
                    d.ocs_directas = filterDirectas;
                }
            },
            columns: [
                { 
                    data: null, 
                    orderable: false,
                    className: 'dt-center',
                    render: function(data, type, row, meta) {
                        return `<input type="checkbox" class="oc-chk" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary);">`;
                    }
                },
                { 
                    data: 'nrodoc',
                    render: function(data, type, row) {
                        let html = `<strong>${data}</strong>`;
                        if(row.observacion_rechazo) {
                            html += `<br><span style="color:#ef4444; font-size:0.65rem; font-weight:600;" title="${row.observacion_rechazo}">⚠️ Rechazado: ${row.observacion_rechazo.substring(0,25)}</span>`;
                        }
                        return html;
                    }
                },
                { data: 'fchdoc', render: data => data || '-' },
                { data: 'proveedor', render: data => data || '-' },
                { data: 'ruc', render: data => data || '-' },
                { 
                    data: 'tipooc',
                    render: data => `<span class="badge pending">${data || '-'}</span>`
                },
                { 
                    data: 'total_oc',
                    className: 'dt-right',
                    render: (data, t, row) => {
                        const m = String(row.moneda||'1').trim() === '2' ? 'USD' : 'S/';
                        return `${m} ${parseFloat(data || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}`
                    }
                },
                { 
                    data: 'estado_almacen',
                    render: data => {
                        if (data === 'COMPLETO') return '<span class="badge approved">Completo</span>';
                        if (data === 'PARCIAL') return '<span class="badge pending" style="background:#fed7aa; color:#9a3412;">Parcial</span>';
                        return '<span class="badge" style="background:#e5e7eb; color:#4b5563;">Sin Ingreso</span>';
                    }
                },
                { 
                    data: 'factura',
                    render: (data, t, row) => {
                        if (data && row.factura_uuid) return `<a href="/factura_visor.html?uid=${row.factura_uuid}" target="_blank" style="color:#2563eb; text-decoration:underline; font-weight:600;">${data}</a>`;
                        if (data) return data;
                        return '<span class="badge" style="background:#fee2e2; color:#991b1b;">Sin factura</span>';
                    }
                },
                { 
                    data: 'total_factura',
                    className: 'dt-right',
                    render: (data, t, row) => {
                        if (!row.factura) return '-';
                        const m = String(row.moneda||'1').trim() === '2' ? 'USD' : 'S/';
                        return `${m} ${parseFloat(data || 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}`
                    }
                },
                {
                    data: null,
                    orderable: false,
                    className: 'dt-center no-print',
                    render: function(data, type, row) {
                        const codcia = document.getElementById('filterCia').value;
                        const showWarehouse = String(row.tipooc||'').trim().toUpperCase() === 'M';
                        const showRecojo = ['M','O'].includes(String(row.tipooc||'').trim().toUpperCase());

                        let dpItems = `<button class="action-dropdown-item" onclick="openReportModal('${codcia}','${row.nrodoc}','${row.tipooc||''}','${row.anos||''}')">📋 Ver Orden</button>`;
                        if (showRecojo) dpItems += `<button class="action-dropdown-item" onclick="window.open('/orders.html?seek_oc=${row.nrodoc}&cia=${codcia}&action=recojo', '_blank')">➡️ Solicitud de Recojo</button>`;
                        if (showWarehouse) dpItems += `<button class="action-dropdown-item" onclick="openWarehouseModal('${codcia}','${row.nrodoc}')">📦 Ingresos Almacén</button>`;
                        dpItems += `<div class="action-dropdown-divider"></div>`;
                        dpItems += `<button class="action-dropdown-item" onclick="openAttachmentModal('${codcia}','${row.tipooc||''}','${row.nrodoc}','signed_order')">📝 Orden Firmada</button>`;
                        dpItems += `<button class="action-dropdown-item" onclick="openAttachmentModal('${codcia}','${row.tipooc||''}','${row.nrodoc}','voucher')">💳 Voucher de Pago</button>`;
                        dpItems += `<button class="action-dropdown-item" onclick="openTrazaModal('${codcia}','${row.nrodoc}','${row.tipooc||''}','${row.anos||''}')">🔗 Trazabilidad OC</button>`;
                        if (row.factura_uuid) dpItems += `<div class="action-dropdown-divider"></div><button class="action-dropdown-item" onclick="window.open('/factura_visor.html?uid=${row.factura_uuid}', '_blank')">📄 Ver Factura (PDF)</button>`;

                        return `<div class="action-dropdown">
                                  <button class="action-dropdown-btn" onclick="toggleDropdown(event, this)" title="Acciones">⋮</button>
                                  <div class="action-dropdown-menu">${dpItems}</div>
                                </div>`;
                    }
                }
            ],
            dom: 'Bfrtip',
            buttons: [
                { extend: 'excelHtml5', text: '📊 Excel', className: 'dt-button', exportOptions: { columns: [1,2,3,4,5,6,7,8,9] } },
            ]
        });

        $('#chkAllOcs').off('change').on('change', function() {
            const checked = this.checked;
            ocsDT.rows().nodes().each(function(row) {
                $(row).find('.oc-chk').prop('checked', checked);
            });
        });

    } catch (err) {
        document.getElementById('ocsDisponiblesTbody').innerHTML = `<tr><td colspan="11" style="text-align:center; padding:2rem; color:#ef4444;">${err.message}</td></tr>`;
    }
}
"""
    text = text.replace(func_text, new_func)

gen_cargo = text.find('async function generarCargo() {')
if gen_cargo != -1:
    gen_end = text.find('async function loadCargosRecibidos()', gen_cargo)
    gen_func = text[gen_cargo:gen_end]
    
    # We replace:
    # const idx = parseInt(chk.attr('data-idx'));
    # const oc = ocsDisponibles[idx];
    # With:
    # const oc = ocsDT.row(row).data();
    new_gen = re.sub(
        r'const idx = parseInt\(chk\.attr\(\'data-idx\'\)\);.*?const oc = ocsDisponibles\[idx\];', 
        'const oc = ocsDT.row(row).data();', 
        gen_func, flags=re.DOTALL
    )
    
    text = text.replace(gen_func, new_gen)

with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("Injected SSR into js")
