
async function loadHistorialDetallado(codcia) {
    try {
        const res = await fetch(`/api/reparto/historial-detallado?codcia=${codcia}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        if (dtHistorial) { dtHistorial.destroy(); }
        
        const tbody = document.querySelector('#historialDetalladoTable tbody');
        let html = '';
        data.forEach(h => {
            html += `<tr>
                <td><strong>HR-${h.hr_id.toString().padStart(4, '0')}</strong></td>
                <td>${h.fecha_ruta}</td>
                <td>${h.chofer_nombre || 'N/A'}</td>
                <td>${h.movilidad_placa || 'N/A'}</td>
                <td style="text-align:center;">Parada ${h.parada_orden}</td>
                <td>${h.proveedor_nombre}</td>
                <td>${h.proveedor_ruc}</td>
                <td>${h.codmat ? '['+h.codmat+'] ' : ''}${h.item_desc}</td>
                <td style="text-align:right;">${h.cantidad} ${h.unidad || 'UND'}</td>
                <td><span class="badge ${h.hr_estado === 'Terminado' ? 'approved' : 'pending'}">${h.hr_estado}</span></td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        dtHistorial = $('#historialDetalladoTable').DataTable({
            order: [[0, 'desc'], [4, 'asc']],
            language: { url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json' },
            pageLength: 50
        });
    } catch (e) {
        console.error('Error fetching historial detallado', e);
    }
}
