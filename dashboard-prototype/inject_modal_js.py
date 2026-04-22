import re

with open('orders.js', 'r', encoding='utf-8') as f:
    orders_js = f.read()

with open('cargos_documentales.js', 'r', encoding='utf-8') as f:
    cargos_js = f.read()

# 1. Update function calls in dropdowns
cargos_js = cargos_js.replace("openEmbeddedReport", "openReportModal")
cargos_js = cargos_js.replace("openEmbeddedWarehouse", "openWarehouseModal")
cargos_js = cargos_js.replace("openEmbeddedTraza", "openTrazaModal")
cargos_js = cargos_js.replace("openEmbeddedAttachment", "openAttachmentModal")

# 2. Remove the old Embedded block at the bottom
start_embedded = cargos_js.find("// ════════════════════════════════════════════════════════════\n//  MODALES EMBEBIDOS")
if start_embedded != -1:
    cargos_js = cargos_js[:start_embedded]
    
# 3. Extract the JS logic required from orders.js
# Start from formatStatus down to } just before _closeActiveDropdown or something similar
# Just extract using explicit function names to avoid catching everything
def extract_func(js_text, func_name_pattern):
    match = re.search(r"((?:async\s+)?function\s+" + func_name_pattern + r"\s*\(.*?\)\s*\{.*?^\})", js_text, flags=re.DOTALL | re.MULTILINE)
    return match.group(1) if match else ""

funcs = [
    r"formatStatus",
    r"openReportModal",
    r"renderReport",
    r"closeReportModal",
    r"printReport",
    r"viewReportAttachment",
    r"closeReportViewer",
    r"openWarehouseModal",
    r"closeWarehouseModal",
    r"printWarehouseVoucher",
    r"openAttachmentModal",
    r"closeAttachmentModal",
    r"loadAttachmentList",
    r"handleAttachmentUpload",
    r"openPreviewModal",
    r"closePreviewModal",
    r"closeTrazaModal",
    r"openTrazaModal"
]

extracted_js = "\n\n// ── MODALES MIGRATIOS DESDE ORDERS.JS ──\n"
for func in funcs:
    code = extract_func(orders_js, func)
    if code:
        extracted_js += code + "\n\n"
    else:
        print(f"Warning: {func} not found in orders.js")

# Append at the bottom
cargos_js += extracted_js

with open('cargos_documentales.js', 'w', encoding='utf-8') as f:
    f.write(cargos_js)
    
print("cargos_documentales.js updated successfully")
