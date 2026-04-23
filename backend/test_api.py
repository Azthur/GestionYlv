from dotenv import load_dotenv
load_dotenv()
from database import get_db_connection
from cargos_documentales import get_pagos_pendientes

try:
    results = get_pagos_pendientes(codcia='0002')
    for r in results:
        print(f"Doc: {r.get('NroDocPrincipal')}, Tipo: {r.get('TipoDocDesc')}, Traza: {r.get('FacturaUuid')}")
except Exception as e:
    print("Error:", e)
