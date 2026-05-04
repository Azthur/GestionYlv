from database import get_db_connection
conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT name FROM sys.tables WHERE name LIKE '%Cia%'")
print([r[0] for r in cursor.fetchall()])
