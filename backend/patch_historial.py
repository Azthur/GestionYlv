import re

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'r', encoding='utf-8') as f:
    text = f.read()

det_func = r'@router\.get\("/detallado/lista"\)\s*def get_cargos_detallado\(\s*codcia: str = Query\(\.\.\.\),\s*area_destino: str = Query\(None\),\s*estado: str = Query\(None\)\s*\):'

new_det_func = '''@router.get("/detallado/lista")
def get_cargos_detallado(
    codcia: str = Query(...),
    area_destino: str = Query(None),
    estado: str = Query(None),
    ano: str = Query(None),
    mes: int = Query(0)
):'''

text = re.sub(det_func, new_det_func, text)

base_q = r'WHERE RTRIM\(c\.CodCia\) = \?\s*\'\'\'\s*params = \[codcia\]'

new_base_q = '''WHERE RTRIM(c.CodCia) = ?
        ''' + "'''\n" + '''
        params = [codcia]
        if ano and ano != "0":
            query += " AND YEAR(c.FechaCargo) = ?"
            params.append(ano)
        if mes and mes > 0:
            query += " AND MONTH(c.FechaCargo) = ?"
            params.append(mes)
'''

text = re.sub(base_q, new_base_q, text)

with open('c:/SistemaGestionyelave/backend/cargos_documentales.py', 'w', encoding='utf-8') as f:
    f.write(text)

with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'r', encoding='utf-8') as f:
    js_text = f.read()

js_text = re.sub(
    r'const res = await axios\.get\(`/api/cargos/detallado/lista\?codcia=\$\{encodeURIComponent\(codcia\)\}`\);',
    'const ano = document.getElementById("filterAno").value;\n        const mes = document.getElementById("filterMes").value;\n        const res = await axios.get(`/api/cargos/detallado/lista?codcia=${encodeURIComponent(codcia)}&ano=${ano}&mes=${mes}`);',
    js_text
)

with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'w', encoding='utf-8') as f:
    f.write(js_text)

print('Historial logic patched')
