import re

with open('c:/SistemaGestionyelave/dashboard-prototype/orders.html', 'r', encoding='utf-8') as f:
    text = f.read()

# We need ALL modal blocks. They start with <div class="modal-overlay"
# Let's find every occurrence of <div class="modal-overlay" and extract up to the closing div of the overlay.
# The structure is:
# <div class="modal-overlay" ... >
#     <div class="modal ...">
#         ...
#     </div>
# </div>

blocks = []
curr_idx = 0
while True:
    start_idx = text.find('<div class="modal-overlay"', curr_idx)
    if start_idx == -1:
        break
        
    # To find the matching end tag, we count divs.
    depth = 0
    i = start_idx
    while i < len(text):
        if text.startswith('<div', i):
            depth += 1
        elif text.startswith('</div', i):
            depth -= 1
            if depth == 0:
                end_idx = i + 6
                blocks.append(text[start_idx:end_idx])
                curr_idx = end_idx
                break
        i += 1

if not blocks:
    print('No modals found')
else:
    print(f'Found {len(blocks)} modals.')
    
    with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.html', 'r', encoding='utf-8') as f2:
        t2 = f2.read()
        
    # Look for existing injected modals to replace, or just append before </body>
    if '<!-- ALL MODALS INJECTED -->' in t2:
        t2 = re.sub(r'<!-- ALL MODALS INJECTED -->.*?<!-- END ALL MODALS INJECTED -->', '', t2, flags=re.DOTALL)
        
    res = '<!-- ALL MODALS INJECTED -->\n' + '\n'.join(blocks) + '\n<!-- END ALL MODALS INJECTED -->\n</body>'
    t2 = t2.replace('</body>', res)
    
    with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.html', 'w', encoding='utf-8') as f2:
        f2.write(t2)
        
    print('Successfully injected modals into cargos_documentales.html')
