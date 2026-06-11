with open('C:/SistemaGestionyelave/dashboard-prototype/js/cuentas-cobrar.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace in renderRow
content = content.replace(
    '        <td>${r.nomsol || \\'\\'}</td>',
    '        <td>${r.codsol ? r.codsol + \\' - \\' : \\'\\'}${r.nomsol || \\'\\'}</td>'
)

# Replace in exportSummaryDetail
content = content.replace(
    '(r.nomsol || \\'\\').substring(0,15),',
    '(r.codsol ? r.codsol + \\'-\\' : \\'\\') + (r.nomsol || \\'\\').substring(0,15),'
)

with open('C:/SistemaGestionyelave/dashboard-prototype/js/cuentas-cobrar.js', 'w', encoding='utf-8') as f:
    f.write(content)
