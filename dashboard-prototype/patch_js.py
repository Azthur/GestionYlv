import os

def patch():
    file_path = 'c:\\SistemaGestionyelave\\dashboard-prototype\\registro_facturas.js'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    target = """// =========================================================
//  BÚSQUEDA DE PROVEEDOR (RUC)
// =========================================================
async function buscarProveedorRuc() {"""

    replacement = """// =========================================================
//  BÚSQUEDA DE PROVEEDOR (RUC)
// =========================================================
async function buscarProveedorRuc() {
    const rucInput = document.getElementById("invRucProv");
    const nomInput = document.getElementById("invNomProv");
    const ruc = rucInput.value.trim();

    if (!ruc) {
        Swal.fire("Atención", "Ingrese un RUC para consultar.", "warning");
        return;
    }

    const codcia = getSelectedCia() || '003';
    
    try {
        Swal.showLoading();
        const url = `/api/finanzas/proveedor/${ruc}?codcia=${codcia}`;
        const token = localStorage.getItem("yelave_token");
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        
        Swal.close();
        
        if (res.ok) {
            const result = await res.json();
            const data = result.data;
            
            if (result.origen === 'api') {
                const { value: formValues } = await Swal.fire({
                    title: 'Crear Proveedor',
                    html: `
                        <div style="text-align:left; font-size:0.9rem;">
                            <label style="font-weight:600;">RUC</label>
                            <input id="swalProvRuc" class="swal2-input" value="${data.rucaux || ''}" readonly style="width:100%; max-width:100%; margin-top:5px; background:#f1f5f9;">
                            
                            <label style="font-weight:600; margin-top:15px; display:block;">Razón Social</label>
                            <input id="swalProvNom" class="swal2-input" value="${data.nomaux || ''}" style="width:100%; max-width:100%; margin-top:5px;">
                            
                            <label style="font-weight:600; margin-top:15px; display:block;">Dirección</label>
                            <input id="swalProvDir" class="swal2-input" value="${data.diraux || ''}" style="width:100%; max-width:100%; margin-top:5px;">
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'Guardar Proveedor',
                    cancelButtonText: 'Cancelar',
                    preConfirm: () => {
                        return {
                            codcia: codcia,
                            ruc: document.getElementById('swalProvRuc').value,
                            razon_social: document.getElementById('swalProvNom').value,
                            direccion: document.getElementById('swalProvDir').value,
                            ubigeo: data.ubigeo || "",
                            coddep: data.coddep || "",
                            codpro: data.codpro || "",
                            coddis: data.coddis || "",
                            email: ""
                        }
                    }
                });

                if (formValues) {
                    Swal.showLoading();
                    const postRes = await fetch('/api/finanzas/proveedor', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(formValues)
                    });
                    
                    Swal.close();
                    if (postRes.ok) {
                        const postData = await postRes.json();
                        nomInput.value = postData.data.nomaux;
                        Swal.fire({
                            icon: "success",
                            title: "Proveedor Creado",
                            text: "El proveedor se registró correctamente.",
                            timer: 2000,
                            showConfirmButton: false
                        });
                        document.getElementById("invTipoDoc")?.focus();
                    } else {
                        const err = await postRes.json();
                        Swal.fire("Error", err.detail || "Error al crear el proveedor.", "error");
                    }
                }
            } else {
                nomInput.value = data.nomaux || data.nomaux || "";
                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, timerProgressBar: true });
                Toast.fire({ icon: 'success', title: 'Proveedor cargado de BD local' });
                document.getElementById("invTipoDoc")?.focus();
            }
        } else {
            const err = await res.json();
            Swal.fire("No encontrado", err.detail || "RUC no encontrado en el sistema ni en SUNAT.", "error");
            nomInput.value = "";
            nomInput.focus();
        }
    } catch (e) {
        Swal.close();
        console.error("Error buscando proveedor:", e);
        Swal.fire("Error", "Ocurrió un problema de conexión al buscar el RUC.", "error");
    }
}"""
    
    if target in content:
        start_idx = content.find(target)
        # We need to replace everything from start_idx to the end of the file or function
        content = content[:start_idx] + replacement
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('JS Function patched.')
    else:
        print('Target not found')

if __name__ == '__main__':
    patch()
