import sys

def patch():
    file_path = 'c:\\SistemaGestionyelave\\dashboard-prototype\\rendicion_gastos.js'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    old_str = """    window.vinculadasOCsStr = nros.join(", ");
    
    document.getElementById("ocVinculadasContainer").style.display = "block";
    document.getElementById("lblOcVinculadas").textContent = window.vinculadasOCsStr;
    
    calcularResumen();
    closeModal('modalBusquedaOC');
}"""
    new_str = """    window.vinculadasOCsStr = nros.join(", ");
    
    document.getElementById("ocVinculadasContainer").style.display = "block";
    document.getElementById("lblOcVinculadas").textContent = window.vinculadasOCsStr;
    
    // Auto-fill existing rows that have empty project
    document.querySelectorAll(".f-project").forEach(ipt => {
        if (!ipt.value.trim()) ipt.value = window.vinculadasOCsStr;
    });
    
    calcularResumen();
    closeModal('modalBusquedaOC');
}"""
    
    content = content.replace('\r\n', '\n')
    
    if old_str in content:
        content = content.replace(old_str, new_str)
        with open(file_path, 'w', encoding='utf-8', newline='\r\n') as f:
            f.write(content)
        print('Success!')
    else:
        print('Not found!')

if __name__ == '__main__':
    patch()
