from database import get_db_connection
import json

try:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT TOP 20 CodTipoDoc, COUNT(*) FROM CntFacturaCab GROUP BY CodTipoDoc")
    print(json.dumps([list(row) for row in cursor.fetchall()]))
except Exception as e:
    print("Error:", e)
