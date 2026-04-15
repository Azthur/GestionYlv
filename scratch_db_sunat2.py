import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
import database

conn = database.get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Sunat%'")
print([row[0] for row in cursor.fetchall()])
