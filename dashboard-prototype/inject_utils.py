import re

with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

utils = """
// --- FORMATTING UTILS ---
const fmtNum = (val, dec = 2) => {
    if (val === null || val === undefined) return '0.00';
    return parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const formatCurrency = (val, sym = 'S/') => {
    if (val === null || val === undefined) return '-';
    return `${sym} ${fmtNum(val)}`;
};
// ------------------------

"""

# Inject after let printFrame = null;
if "const fmtNum =" not in js_content:
    js_content = js_content.replace('let allCargos = [];', 'let allCargos = [];\n' + utils)
    with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'w', encoding='utf-8') as f:
        f.write(js_content)
    print("Utils injected.")
else:
    print("Utils already present.")
