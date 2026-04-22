import re

with open('orders.html', 'r', encoding='utf-8') as f:
    orders_html = f.read()
    
with open('cargos_documentales.html', 'r', encoding='utf-8') as f:
    cargos_html = f.read()

start_string = r"<!-- Modal: Purchase Order Report -->"
end_string = r"<!-- SweetAlert2 -->"
match = re.search(f"({start_string}.*?){end_string}", orders_html, flags=re.DOTALL)

if match:
    modals_html = match.group(1)
    
    insert_before = r"<!-- Scripts -->"
    if insert_before in cargos_html:
        # Avoid duplicate injections
        if "<!-- Modal: Purchase Order Report -->" not in cargos_html:
            cargos_html = cargos_html.replace(insert_before, modals_html + "\n    " + insert_before)
            with open('cargos_documentales.html', 'w', encoding='utf-8') as f:
                f.write(cargos_html)
            print("HTML injected")
        else:
            print("HTML already injected")
    else:
        print("Could not find insert_before string in cargos_documentales.html")
else:
    print("Could not extract modals from orders.html")
