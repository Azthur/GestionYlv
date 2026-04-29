import sys
import os

sys.path.append(os.path.dirname(__file__))

from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CntFacturaCab'")
columns = [r[0] for r in cursor.fetchall()]
print(columns)
conn.close()
