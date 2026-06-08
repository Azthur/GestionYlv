import re

# Read HTML file
with open('dashboard-prototype/auditoria_facturas.html', 'r', encoding='utf-8', errors='ignore') as f:
    html_content = f.read()

# Find all ids in HTML
all_html_ids = set(re.findall(r'id=["\'](.*?)["\']', html_content, re.IGNORECASE))

# Read JS file
with open('dashboard-prototype/auditoria_facturas.js', 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

# Find all getElementById calls
get_id_calls = re.findall(r'document\.getElementById\([\'"](.*?)[\'"]\)', js_content)

missing_ids = []
for js_id in set(get_id_calls):
    if js_id not in all_html_ids:
        # Check if the code handles it gracefully (e.g., if (!el) or el?)
        # Let's find occurrences of document.getElementById('js_id')
        occurrences = [line for line in js_content.splitlines() if f"getElementById('{js_id}')" in line or f'getElementById("{js_id}")' in line]
        graceful = True
        for occ in occurrences:
            # simple check: if it calls .addEventListener, .value, .style, .innerHTML without safe guard
            if ('.addEventListener' in occ or '.value' in occ or '.style' in occ or '.innerHTML' in occ) and 'if (' not in occ and 'if(' not in occ:
                graceful = False
        if not graceful:
            missing_ids.append((js_id, occurrences))

print("Missing IDs that might cause Reference/TypeErrors:")
for js_id, occs in missing_ids:
    print(f"\nID: {js_id}")
    for occ in occs:
        print(f"  Line: {occ.strip()}")
