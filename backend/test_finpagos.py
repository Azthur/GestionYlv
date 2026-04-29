from database import get_db_connection
import json

try:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT TOP 5 Id, Uuid FROM FinPagos ORDER BY Id DESC")
    print(json.dumps([list(row) for row in cursor.fetchall()]))
except Exception as e:
    print("Error:", e)
