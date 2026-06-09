def fix_file(filepath):
    print(f"Fixing {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace selectModalItem
    t1 = "onclick=\"selectModalItem('${escapeHtml(it.codigo)}', '${escapeHtml(it.descripcion)}', '${escapeHtml(it.cuenta_contable || '')}', '${escapeHtml(it.cuenta_contable2 || '')}')\""
    r1 = "onclick=\"selectModalItem('${escapeClick(it.codigo)}', '${escapeClick(it.descripcion)}', '${escapeClick(it.cuenta_contable || '')}', '${escapeClick(it.cuenta_contable2 || '')}')\""
    
    # Replace loadOCDetails
    t2 = "'${escapeHtml(o.proveedor)}', '${monStr}', '${escapeHtml(factVincStr)}'"
    r2 = "'${escapeClick(o.proveedor)}', '${monStr}', '${escapeClick(factVincStr)}'"
    
    # Replace editToken in contabilidad.js
    t3 = "onclick=\"editToken(${t.Id}, '${t.CodCia.trim()}','${t.NumRuc}','${escapeHtml(t.NomEmpresa)}'"
    r3 = "onclick=\"editToken(${t.Id}, '${t.CodCia.trim()}','${t.NumRuc}','${escapeClick(t.NomEmpresa)}'"
    
    # Also do simpler replacements for safety
    content = content.replace("escapeHtml(it.codigo)", "escapeClick(it.codigo)")
    content = content.replace("escapeHtml(it.descripcion)", "escapeClick(it.descripcion)")
    content = content.replace("escapeHtml(it.cuenta_contable || '')", "escapeClick(it.cuenta_contable || '')")
    content = content.replace("escapeHtml(it.cuenta_contable2 || '')", "escapeClick(it.cuenta_contable2 || '')")
    
    content = content.replace(t1, r1)
    content = content.replace(t2, r2)
    content = content.replace(t3, r3)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done!")

fix_file(r"c:\SistemaGestionyelave\dashboard-prototype\registro_facturas.js")
fix_file(r"c:\SistemaGestionyelave\dashboard-prototype\auditoria_facturas.js")
fix_file(r"c:\SistemaGestionyelave\dashboard-prototype\contabilidad.js")
