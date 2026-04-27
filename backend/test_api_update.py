import urllib.request
import json

payload = {
    "id": 46,
    "codcia": "003",
    "num_ruc_proveedor": "2060854111",
    "nom_proveedor": "BACKUS YA S.A.C.",
    "cod_tipo_doc": "01",
    "serie": "E001",
    "numero": "2",
    "fec_emision": "2026-04-20",
    "credito_fec_plazo": "2026-06-25",
    "cod_moneda": "1",
    "total": 648.06,
    "items": [],
    "created_by": "71941916JL",
    "modo_registro": "MANUAL"
}

req = urllib.request.Request(
    'http://localhost:8000/api/contabilidad/facturas',
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)

with urllib.request.urlopen(req) as response:
    res = json.loads(response.read().decode('utf-8'))
    print("API RESPONSE:", res)

# Check DB
import sys
sys.path.insert(0,'/app/backend')
from database import get_db_connection
conn = get_db_connection()
c = conn.cursor()
c.execute("SELECT Id, FecVencimiento, CreditoFecPlazo FROM CntFacturaCab WHERE Id=46")
print("DB ROW ID 46:", c.fetchall())
conn.close()
