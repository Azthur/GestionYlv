import re

file_path = 'cargos_documentales.js'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add Tracker globals
tracker_code = """
// --- Selection Tracker for SSR DataTables ---
let selectedItemsTracker = {
    ocs: new Map(),
    facturas: new Map(),
    rendiciones: new Map(),
    docsAceptados: new Map()
};

function clearSelectionTracker() {
    selectedItemsTracker.ocs.clear();
    selectedItemsTracker.facturas.clear();
    selectedItemsTracker.rendiciones.clear();
    selectedItemsTracker.docsAceptados.clear();
}
"""
if "let selectedItemsTracker" not in content:
    content = content.replace("let userPerms = []; // Almacena sub-permisos del módulo", "let userPerms = []; // Almacena sub-permisos del módulo\n" + tracker_code)

# 2. Add clear tracker on tab switch
if "clearSelectionTracker();" not in content:
    content = content.replace("document.getElementById('panelGenerar').style.display = 'none';", "clearSelectionTracker();\n    document.getElementById('panelGenerar').style.display = 'none';")

# 3. Modify OCs Disponibles Table setup
ocs_rowcallback = """            rowCallback: function(row, data) {
                const key = data.nrodoc + '|' + (data.tipooc || '');
                if (selectedItemsTracker.ocs.has(key)) {
                    $(row).find('.oc-chk').prop('checked', true);
                }
            },
            ajax:"""
content = content.replace("            ajax:", ocs_rowcallback)

ocs_events = """        $('#ocsDisponiblesTable tbody').off('change', '.oc-chk').on('change', '.oc-chk', function() {
            const tr = $(this).closest('tr');
            const rowData = ocsDT.row(tr).data();
            if (!rowData) return;
            const key = rowData.nrodoc + '|' + (rowData.tipooc || '');
            if (this.checked) {
                selectedItemsTracker.ocs.set(key, rowData);
            } else {
                selectedItemsTracker.ocs.delete(key);
            }
        });

        $('#chkAllOcs').off('change').on('change', function() {
            const checked = this.checked;
            $('.oc-chk', ocsDT.rows().nodes()).each(function() {
                this.checked = checked;
                $(this).trigger('change');
            });
        });"""
# We replace the old #chkAllOcs event in OCs Disponibles
old_chkAllOcs = """        $('#chkAllOcs').off('change').on('change', function() {
            const checked = this.checked;
            ocsDT.rows().nodes().each(function(row) {
                $(row).find('.oc-chk').prop('checked', checked);
            });
        });"""
content = content.replace(old_chkAllOcs, ocs_events)

# 4. Modify Facturas sin OC
fact_rowcallback = """            rowCallback: function(row, data) {
                const key = data.serie_comprobante + '|' + data.nro_comprobante + '|' + data.num_ruc;
                if (selectedItemsTracker.facturas.has(key)) {
                    $(row).find('.factura-sin-oc-chk').prop('checked', true);
                }
            },
            ajax:"""
if "rowCallback: function(row, data) {" not in content.split("facturasSinOC_DT = $('#facturasSinOCTable').DataTable({")[1].split("ajax:")[0]:
    content = content.replace("facturasSinOC_DT = $('#facturasSinOCTable').DataTable({\n            serverSide: true,\n            processing: true,\n            destroy: true,\n            ordering: false,\n            pageLength: 10,\n            language: {\n                url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',\n                processing: '<div style=\"background:rgba(255,255,255,0.8); z-index:99; position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#2563eb; font-weight:700;\">Cargando facturas...</div>'\n            },\n            ajax:", "facturasSinOC_DT = $('#facturasSinOCTable').DataTable({\n            serverSide: true,\n            processing: true,\n            destroy: true,\n            ordering: false,\n            pageLength: 10,\n            language: {\n                url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',\n                processing: '<div style=\"background:rgba(255,255,255,0.8); z-index:99; position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#2563eb; font-weight:700;\">Cargando facturas...</div>'\n            },\n" + fact_rowcallback)

fact_events = """
        $('#facturasSinOCTable tbody').off('change', '.factura-sin-oc-chk').on('change', '.factura-sin-oc-chk', function() {
            const tr = $(this).closest('tr');
            const rowData = facturasSinOC_DT.row(tr).data();
            if (!rowData) return;
            const key = rowData.serie_comprobante + '|' + rowData.nro_comprobante + '|' + rowData.num_ruc;
            if (this.checked) {
                selectedItemsTracker.facturas.set(key, rowData);
            } else {
                selectedItemsTracker.facturas.delete(key);
            }
        });

        $('#chkAllFacturasSinOC').off('change').on('change', function() {
            const checked = this.checked;
            $('.factura-sin-oc-chk', facturasSinOC_DT.rows().nodes()).each(function() {
                this.checked = checked;
                $(this).trigger('change');
            });
        });
"""
old_toggle_fact = """function toggleAllFacturasSinOC() {
    const chkAll = document.getElementById('chkAllFacturasSinOC');
    const chks = document.querySelectorAll('.factura-sin-oc-chk');
    chks.forEach(chk => chk.checked = chkAll.checked);
}"""
content = content.replace(old_toggle_fact, fact_events)


# 5. Modify Rendiciones Aprobadas
rend_rowcallback = """            rowCallback: function(row, data) {
                const key = data.nro_rendicion;
                if (selectedItemsTracker.rendiciones.has(key)) {
                    $(row).find('.rendicion-aprobada-chk').prop('checked', true);
                }
            },
            ajax:"""
if "rowCallback: function(row, data) {" not in content.split("rendicionesAprobadas_DT = $('#rendicionesAprobadasTable').DataTable({")[1].split("ajax:")[0]:
    content = content.replace("rendicionesAprobadas_DT = $('#rendicionesAprobadasTable').DataTable({\n            serverSide: true,\n            processing: true,\n            destroy: true,\n            ordering: false,\n            pageLength: 10,\n            language: {\n                url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',\n                processing: '<div style=\"background:rgba(255,255,255,0.8); z-index:99; position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#2563eb; font-weight:700;\">Cargando rendiciones...</div>'\n            },\n            ajax:", "rendicionesAprobadas_DT = $('#rendicionesAprobadasTable').DataTable({\n            serverSide: true,\n            processing: true,\n            destroy: true,\n            ordering: false,\n            pageLength: 10,\n            language: {\n                url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',\n                processing: '<div style=\"background:rgba(255,255,255,0.8); z-index:99; position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#2563eb; font-weight:700;\">Cargando rendiciones...</div>'\n            },\n" + rend_rowcallback)


rend_events = """
        $('#rendicionesAprobadasTable tbody').off('change', '.rendicion-aprobada-chk').on('change', '.rendicion-aprobada-chk', function() {
            const tr = $(this).closest('tr');
            const rowData = rendicionesAprobadas_DT.row(tr).data();
            if (!rowData) return;
            const key = rowData.nro_rendicion;
            if (this.checked) {
                selectedItemsTracker.rendiciones.set(key, rowData);
            } else {
                selectedItemsTracker.rendiciones.delete(key);
            }
        });

        $('#chkAllRendiciones').off('change').on('change', function() {
            const checked = this.checked;
            $('.rendicion-aprobada-chk', rendicionesAprobadas_DT.rows().nodes()).each(function() {
                this.checked = checked;
                $(this).trigger('change');
            });
        });
"""
old_toggle_rend = """function toggleAllRendiciones() {
    const chkAll = document.getElementById('chkAllRendiciones');
    const chks = document.querySelectorAll('.rendicion-aprobada-chk');
    chks.forEach(chk => chk.checked = chkAll.checked);
}"""
content = content.replace(old_toggle_rend, rend_events)


# 6. Modify Docs Aceptados
docs_rowcallback = """            rowCallback: function(row, data) {
                const key = data.NroOrdenCompra + '|' + (data.TipoOc || '');
                if (selectedItemsTracker.docsAceptados.has(key)) {
                    $(row).find('.doc-aceptado-chk').prop('checked', true);
                }
            },
            columnDefs:"""
content = content.replace("            columnDefs:", docs_rowcallback)

docs_events = """
                $('#ocsDisponiblesTable tbody').off('change', '.doc-aceptado-chk').on('change', '.doc-aceptado-chk', function() {
                    const tr = $(this).closest('tr');
                    const rowData = docsAceptadosDT.row(tr).data();
                    if (!rowData) return;
                    const key = rowData.NroOrdenCompra + '|' + (rowData.TipoOc || '');
                    if (this.checked) {
                        selectedItemsTracker.docsAceptados.set(key, rowData);
                    } else {
                        selectedItemsTracker.docsAceptados.delete(key);
                    }
                });

                $('#chkAllOcs').off('change').on('change', function() {
                    const checked = this.checked;
                    $('.doc-aceptado-chk', docsAceptadosDT.rows().nodes()).each(function() {
                        this.checked = checked;
                        $(this).trigger('change');
                    });
                });
"""
# insert docs_events after docsAceptadosDT init
if "$('#ocsDisponiblesTable tbody').off('change', '.doc-aceptado-chk')" not in content:
    content = content.replace("                });\n            }\n\n        } else {", "                });\n" + docs_events + "            }\n\n        } else {")

old_toggle_docs = """function toggleAllDocsAceptados() {
    const chkAll = document.getElementById('chkAllDocsAceptados');
    const chks = document.querySelectorAll('.doc-aceptado-chk');
    chks.forEach(chk => chk.checked = chkAll.checked);
}"""
content = content.replace(old_toggle_docs, "")

# 7. Modify generarCargo()
generar_cargo_new = """async function generarCargo() {
    try {
        const selected = [];

        // Obtener OCs seleccionadas
        if (ocsDT) {
            selectedItemsTracker.ocs.forEach(oc => {
                selected.push({
                    nro_orden_compra: oc.nrodoc || '',
                    tipo_oc: oc.tipooc || 'M',
                    codcia_oc: document.getElementById('filterCia').value || '',
                    anos_oc: oc.anos || '',
                    nro_factura: oc.factura || '',
                    monto_oc: parseFloat(oc.total_oc || 0) || 0,
                    monto_factura: parseFloat(oc.total_factura || 0) || 0,
                    proveedor: oc.proveedor || '',
                    ruc_proveedor: String(oc.ruc || ''),
                    moneda: String(oc.moneda || '1'),
                    tipo_documento: oc.tipo_doc || '',
                    tipo_comprobante: oc.tipo_comprobante || '',
                    fecha_emision: oc.fec_factura || null,
                    fecha_vencimiento: oc.fecha_vencimiento || null,
                    monto_rendicion: null
                });
            });
        }

        // Obtener documentos aceptados seleccionados (para Enviar a Tesorería)
        if (docsAceptadosDT) {
            selectedItemsTracker.docsAceptados.forEach(row => {
                selected.push({
                    nro_orden_compra: row.NroOrdenCompra || '',
                    tipo_oc: row.TipoOc || 'OC',
                    codcia_oc: row.CodCiaOc || document.getElementById('filterCia').value || '',
                    anos_oc: '',
                    nro_factura: row.NroFactura || '',
                    monto_oc: parseFloat(row.MontoOC || 0) || 0,
                    monto_factura: parseFloat(row.MontoFactura || 0) || 0,
                    proveedor: row.Proveedor || '',
                    ruc_proveedor: String(row.RucProveedor || ''),
                    moneda: String(row.Moneda || '1'),
                    tipo_documento: row.TipoDoc || '',
                    tipo_comprobante: row.TipoComprobante || '',
                    fecha_emision: row.FecFactura || null,
                    fecha_vencimiento: row.FechaVencimiento || null,
                    monto_rendicion: null
                });
            });
        }

        // Obtener Facturas sin OC seleccionadas
        if (facturasSinOC_DT) {
            selectedItemsTracker.facturas.forEach(row => {
                const serie = row.serie_comprobante || '';
                const numero = row.nro_comprobante || '';
                if (serie && numero) {
                    selected.push({
                        nro_orden_compra: row.nro_orden_compra || '',
                        tipo_oc: 'FACT',
                        codcia_oc: document.getElementById('filterCia').value || '',
                        anos_oc: '',
                        nro_factura: `${serie}-${numero}`,
                        monto_oc: 0,
                        monto_factura: parseFloat(row.monto_total || 0) || 0,
                        proveedor: row.nombre_proveedor || '',
                        ruc_proveedor: String(row.num_ruc || ''),
                        moneda: String(row.moneda || '1'),
                        tipo_documento: 'FACTURA_SIN_OC',
                        tipo_comprobante: row.tipo_comprobante || '',
                        fecha_emision: row.fecha_emision || null,
                        fecha_vencimiento: row.fecha_vencimiento || null,
                        monto_rendicion: null
                    });
                }
            });
        }

        // Obtener Rendiciones aprobadas seleccionadas
        if (rendicionesAprobadas_DT) {
            selectedItemsTracker.rendiciones.forEach(row => {
                const nroRendicion = row.nro_rendicion;
                if (nroRendicion) {
                    selected.push({
                        nro_orden_compra: nroRendicion || '',
                        tipo_oc: 'REND',
                        codcia_oc: document.getElementById('filterCia').value || '',
                        anos_oc: '',
                        nro_factura: '',
                        monto_oc: 0,
                        monto_factura: parseFloat(row.total_rendido || 0) || 0,
                        proveedor: row.nom_auxiliar || '',
                        ruc_proveedor: String(row.cod_auxiliar || ''),
                        moneda: String(row.moneda || '1'),
                        tipo_documento: 'RG',
                        tipo_comprobante: 'Rendición de Gastos',
                        fecha_emision: row.fec_registro || null,
                        fecha_vencimiento: null,
                        monto_rendicion: parseFloat(row.total_rendido || 0) || 0
                    });
                }
            });
        }"""
# Extract the old generarCargo up to `if (selected.length === 0) {`
import re
pattern = re.compile(r"async function generarCargo\(\) \{.*?if \(selected\.length === 0\) \{", re.DOTALL)
content = pattern.sub(generar_cargo_new + "\n\n        if (selected.length === 0) {", content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch applied successfully.")
