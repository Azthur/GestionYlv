import urllib.request
import json

url = "http://localhost:8000/api/cargos/documentos-aceptados-tesoreria?codcia=003"
try:
    print(f"Fetching: {url}")
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode('utf-8'))
        print(f"Total documents returned: {len(data)}")
        for idx, doc in enumerate(data):
            print(f"[{idx+1}] NroOrdenCompra: {doc.get('NroOrdenCompra')}, NroFactura: {doc.get('NroFactura')}, Proveedor: {doc.get('Proveedor')}, Ruc: {doc.get('RucProveedor')}")
except Exception as e:
    print(f"Error calling API: {e}")
