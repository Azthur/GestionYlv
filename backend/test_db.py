from database import get_db_connection
conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT TOP 5 RTRIM(Serie), RTRIM(Numero), RTRIM(Uuid), FechaEmision FROM CntFacturaCab WHERE RTRIM(Serie)='E001'")
print(cursor.fetchall())
