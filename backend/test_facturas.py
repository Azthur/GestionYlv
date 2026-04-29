import sys
import os

# Add the directory containing database.py to the Python path
sys.path.append(os.path.dirname(__file__))

from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT Serie, Numero, CodTipoDoc, FechaVencimiento FROM CntFacturaCab WHERE RTRIM(NroOrdenCompra)='00001220'")
rows = cursor.fetchall()
print(f"Facturas para 00001220: {len(rows)}")
for r in rows:
    print(r)
conn.close()
