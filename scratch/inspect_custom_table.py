import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
import database

conn = database.get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CntCuentasContablesCustom'")
for r in cursor.fetchall():
    print(r)
conn.close()
