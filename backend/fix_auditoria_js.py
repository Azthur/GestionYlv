import sys, re

try:
    with open(r'c:\SistemaGestionyelave\dashboard-prototype\auditoria_facturas.js', 'r', encoding='latin-1') as f:
        content = f.read()
except Exception as e:
    print(f"Error reading file: {e}")
    sys.exit(1)

# 1. Remove created_by
content = content.replace('fetch(`/api/contabilidad/facturas?codcia=${codcia}&created_by=${encodeURIComponent(login)}`)', 'fetch(`/api/contabilidad/facturas?codcia=${codcia}`)')

# 2. Add button
target = '<button class="btn-flat" style="padding:4px; color:#cbd5e1; cursor:not-allowed;" title="No se puede Eliminar (${f.Estado})"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`'

replacement = target + ''' +
                          ((estadoRaw === 'CONTABILIZADO' || estadoRaw === 'CONTABILIZADA') ? `<button class="btn-flat" style="padding:4px; color:#f59e0b; margin-left:2px;" onclick="revertirEstado(${f.Id}, '${f.Serie||''}-${f.Numero||''}')" title="Revertir a REGISTRADA"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg></button>` : '')'''

if target in content:
    content = content.replace(target, replacement)
else:
    print("Could not find the target button string to replace.")

# 3. Append revertirEstado
content += '''

async function revertirEstado(id, compName) {
    const user = JSON.parse(localStorage.getItem('yelave_user') || '{}');
    const rol = user.rol || 'USER';

    if(rol !== 'ADMIN' && rol !== 'CONTABILIDAD') {
        Swal.fire('Acceso Denegado', 'Sólo usuarios de Contabilidad pueden revertir el estado.', 'warning');
        return;
    }

    const conf = await Swal.fire({
        icon: 'warning',
        title: '¿Revertir a REGISTRADA?',
        text: `¿Seguro que deseas cambiar el estado de la factura ${compName} de CONTABILIZADA a REGISTRADA?`,
        showCancelButton: true,
        confirmButtonText: 'Sí, revertir',
        cancelButtonText: 'Cancelar'
    });
    if (!conf.isConfirmed) return;

    try {
        Swal.fire({title: 'Actualizando...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        const token = localStorage.getItem('yelave_token');
        const res = await fetch(`/api/contabilidad/facturas/${id}/estado`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'REGISTRADA' })
        });
        if (!res.ok) throw new Error('Error al revertir el estado');
        await Swal.fire('Éxito', 'Estado revertido exitosamente.', 'success');
        loadFacturas();
    } catch(err) {
        Swal.fire('Error', err.message, 'error');
    }
}
'''

try:
    with open(r'c:\SistemaGestionyelave\dashboard-prototype\auditoria_facturas.js', 'w', encoding='utf-8') as f2:
        f2.write(content)
except Exception as e:
    print(f"Error writing file: {e}")
    sys.exit(1)

print("Done")
