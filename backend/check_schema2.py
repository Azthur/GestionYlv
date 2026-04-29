from database import get_db_connection
import json

try:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'FinPagos'")
    cols = cursor.fetchall()
    res = []
    for r in cols:
        res.append({"name": r[0], "type": r[1], "len": r[2]})
    print(json.dumps(res, indent=2))
except Exception as e:
    print("Error:", e)
