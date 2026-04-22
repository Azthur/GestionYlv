import requests
import re

r = requests.get('http://127.0.0.1:8000/cargos_documentales.html')
text = r.text

scripts = re.findall(r'<script[^>]*src=["\']([^"\']*)["\'][^>]*>', text)
for i, s in enumerate(scripts):
    print(f'{i}: {s}')

# Check if Swal is loaded before our JS
swal_pos = text.find('sweetalert2')
our_js_pos = text.find('cargos_documentales.js')
print(f'\nSweetAlert position: {swal_pos}')
print(f'Our JS position: {our_js_pos}')
if swal_pos > 0 and our_js_pos > 0:
    print(f'Swal loads {"BEFORE" if swal_pos < our_js_pos else "AFTER"} our JS')
