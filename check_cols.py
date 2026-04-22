import os, sys
sys.path.insert(0, '/app/backend')
from database import get_db_connection
conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CntCargosDetalle'")
for r in cursor.fetchall():
    print(r)
conn.close()
