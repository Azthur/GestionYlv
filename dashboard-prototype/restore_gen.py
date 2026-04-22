import re

with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'r', encoding='utf-8') as f:
    text = f.read()

generar_cargo_func = """
async function generarCargo() {
    try {
        if (!ocsDT) { Swal.fire('Atención', 'Primero cargue las OCs.', 'warning'); return; }

        const selected = [];
        ocsDT.rows().nodes().each(function(row) {
            const chk = $(row).find('.oc-chk');
            if (chk.is(':checked')) {
                const oc = ocsDT.row(row).data();
                if (oc) {
                    selected.push({
                        nro_orden_compra: oc.nrodoc,
                        tipo_oc: oc.tipooc,
                        codcia_oc: document.getElementById('filterCia').value,
                        anos_oc: oc.anos,
                        nro_factura: oc.factura || '',
                        monto_oc: parseFloat(oc.total_oc || 0),
                        monto_factura: parseFloat(oc.total_factura || 0),
                        proveedor: oc.proveedor || '',
                        ruc_proveedor: oc.ruc || ''
                    });
                }
            }
        });

        if (selected.length === 0) {
            Swal.fire('Atención', 'Seleccione al menos una Orden de Compra.', 'warning');
            return;
        }

        const tipoCargo = document.getElementById('tipoCargo').value;
        const areaOrigen = tipoCargo === 'LOG_A_CONT' ? 'LOGISTICA' : 'CONTABILIDAD';
        const areaDestino = tipoCargo === 'LOG_A_CONT' ? 'CONTABILIDAD' : 'TESORERIA';

        const confirm = await Swal.fire({
            title: '¿Generar Cargo de Entrega?',
            html: `<div style="text-align:left; font-size:0.9rem;">
                <p><strong>Tipo:</strong> ${areaOrigen} → ${areaDestino}</p>
                <p><strong>OCs seleccionadas:</strong> ${selected.length}</p>
                <p><strong>Monto total facturas:</strong> S/ ${selected.reduce((s, x) => s + (x.monto_factura || 0), 0).toLocaleString('es-PE', {minimumFractionDigits: 2})}</p>
            </div>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, Generar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#2563eb'
        });

        if (!confirm.isConfirmed) return;

        const payload = {
            codcia: document.getElementById('filterCia').value,
            tipo_cargo: tipoCargo,
            usuario_origen: currentUser,
            area_origen: areaOrigen,
            area_destino: areaDestino,
            observaciones: document.getElementById('cargoObservaciones').value.trim(),
            detalle: selected
        };

        const res = await axios.post('/api/cargos/generar', payload);

        await Swal.fire({
            title: 'Cargo Generado!',
            text: `Se ha generado el Cargo N° ${res.data.nro_cargo}`,
            icon: 'success',
            confirmButtonText: 'OK',
            confirmButtonColor: '#10b981'
        });

        document.getElementById('cargoObservaciones').value = '';
        setTimeout(() => switchSubTab('historial', null), 300);
        
    } catch (err) {
        Swal.fire('Error', err.response?.data?.detail || err.message, 'error');
    }
}
"""

if 'async function generarCargo()' not in text:
    idx = text.find('async function loadCargosRecibidos()')
    if idx != -1:
        text = text[:idx] + generar_cargo_func + '\n\n' + text[idx:]
        with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'w', encoding='utf-8') as f:
            f.write(text)
        print('Restored generarCargo successfully')
    else:
        print('Could not find loadCargosRecibidos')
else:
    print('Already present')
