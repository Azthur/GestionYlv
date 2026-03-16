from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("""
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ReconciliationDetail' 
    ORDER BY ORDINAL_POSITION
""")
for row in cursor.fetchall():
    print(row)
conn.close()
