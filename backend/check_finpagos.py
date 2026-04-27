import sys
sys.path.insert(0, '/app')
from db import get_db_connection
conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='FinPagos' ORDER BY ORDINAL_POSITION")
for r in cursor.fetchall():
    print(r[0])
conn.close()
