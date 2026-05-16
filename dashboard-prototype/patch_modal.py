import os

def patch():
    file_path = 'c:\\SistemaGestionyelave\\dashboard-prototype\\registro_facturas.js'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    target = """                    html: `
                        <div style="text-align:left; font-size:0.9rem;">
                            <label style="font-weight:600;">RUC</label>
                            <input id="swalProvRuc" class="swal2-input" value="${data.rucaux || ''}" readonly style="width:100%; max-width:100%; margin-top:5px; background:#f1f5f9;">
                            
                            <label style="font-weight:600; margin-top:15px; display:block;">Razón Social</label>
                            <input id="swalProvNom" class="swal2-input" value="${data.nomaux || ''}" style="width:100%; max-width:100%; margin-top:5px;">
                            
                            <label style="font-weight:600; margin-top:15px; display:block;">Dirección</label>
                            <input id="swalProvDir" class="swal2-input" value="${data.diraux || ''}" style="width:100%; max-width:100%; margin-top:5px;">
                        </div>
                    `"""

    replacement = """                    html: `
                        <div style="text-align:left; font-size:0.85rem; display: flex; flex-direction: column; gap: 1rem; padding: 0.5rem;">
                            <div style="display:flex; gap:1rem;">
                                <div style="flex:1;">
                                    <label style="font-weight:600; color:var(--text-main); display:block; margin-bottom:0.25rem;">RUC</label>
                                    <input id="swalProvRuc" class="modern-input" value="${data.rucaux || ''}" readonly style="width:100%; background:#f1f5f9; cursor:not-allowed;">
                                </div>
                                <div style="flex:1;">
                                    <label style="font-weight:600; color:var(--text-main); display:block; margin-bottom:0.25rem;">Ubigeo</label>
                                    <input id="swalProvUbigeo" class="modern-input" value="${data.ubigeo || ''}" style="width:100%;">
                                </div>
                            </div>
                            
                            <div>
                                <label style="font-weight:600; color:var(--text-main); display:block; margin-bottom:0.25rem;">Razón Social</label>
                                <input id="swalProvNom" class="modern-input" value="${data.nomaux || ''}" style="width:100%;">
                            </div>
                            
                            <div>
                                <label style="font-weight:600; color:var(--text-main); display:block; margin-bottom:0.25rem;">Dirección Fiscal</label>
                                <input id="swalProvDir" class="modern-input" value="${data.diraux || ''}" style="width:100%;">
                            </div>
                            
                            <div>
                                <label style="font-weight:600; color:var(--text-main); display:block; margin-bottom:0.25rem;">Correo Electrónico (Opcional)</label>
                                <input id="swalProvEmail" type="email" class="modern-input" placeholder="proveedor@ejemplo.com" style="width:100%;">
                            </div>
                        </div>
                    `,
                    width: '600px'"""

    if target in content:
        content = content.replace(target, replacement)
        
        # We also need to update the preConfirm to grab the email and ubigeo properly
        preConfirmTarget = """                            direccion: document.getElementById('swalProvDir').value,
                            ubigeo: data.ubigeo || "",
                            coddep: data.coddep || "",
                            codpro: data.codpro || "",
                            coddis: data.coddis || "",
                            email: ""
                        }"""
        preConfirmReplacement = """                            direccion: document.getElementById('swalProvDir').value,
                            ubigeo: document.getElementById('swalProvUbigeo').value,
                            coddep: data.coddep || "",
                            codpro: data.codpro || "",
                            coddis: document.getElementById('swalProvUbigeo').value,
                            email: document.getElementById('swalProvEmail').value
                        }"""
        
        content = content.replace(preConfirmTarget, preConfirmReplacement)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('UI Modal JS patched.')
    else:
        print('Target not found in JS.')

if __name__ == '__main__':
    patch()
