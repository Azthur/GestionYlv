import urllib.request
import json

payload = {
    "codcia": "003",
    "num_ruc_proveedor": "20123456789",
    "nom_proveedor": "TEST",
    "cod_tipo_doc": "01",
    "serie": "F001",
    "numero": "999",
    "fec_emision": "2026-04-20",
    "credito_fec_plazo": "2026-05-15",
    "cod_moneda": "1",
    "total": 100.0,
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
c.execute("SELECT Id, FecVencimiento, CreditoFecPlazo FROM CntFacturaCab WHERE Serie='F001' AND Numero='999'")
print("DB ROW:", c.fetchall())
conn.close()
