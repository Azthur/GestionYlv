import pyodbc
from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT COLUMN_NAME, DATA_TYPE, COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA + '.' + TABLE_NAME), COLUMN_NAME, 'IsIdentity') as IsIdentity FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ReconciliationDetail'")
for row in cursor.fetchall():
    print(row)
