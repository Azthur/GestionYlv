import sys
import re

filename = r'c:\SistemaGestionyelave\dashboard-prototype\registro_facturas.js'

with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the broken function at the end
start = content.find("async function eliminarArchivoAdjunto(archivoId)")
if start != -1:
    content = content[:start]

# Add the correct function
content += '''
async function eliminarArchivoAdjunto(archivoId) {
    const conf = await Swal.fire({
        title: '¿Eliminar archivo?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });
    
    if (!conf.isConfirmed) return;
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/contabilidad/archivos/${archivoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('Error al eliminar');
        
        // Remover el elemento del DOM
        const el = document.getElementById(`file-row-${archivoId}`);
        if (el) el.remove();
        
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        Toast.fire({ icon: 'success', title: 'Archivo eliminado' });
        
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo eliminar el archivo', 'error');
    }
}
'''

with open(filename, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
