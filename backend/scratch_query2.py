from database import get_db_connection
conn = get_db_connection()
cursor = conn.cursor()
try:
    cursor.execute("SELECT TOP 5 codcia, codigo, nombre FROM VtaTabla WHERE codcia='007' AND tabla='CLIE'")
    print([col[0] for col in cursor.description])
    print(cursor.fetchall())
except Exception as e:
    print(e)
conn.close()
