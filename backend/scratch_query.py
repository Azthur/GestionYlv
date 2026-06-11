from database import get_db_connection
conn = get_db_connection()
cursor = conn.cursor()
try:
    cursor.execute("SELECT TOP 5 codcia, ptovta, nrodoc, codaux, nomsol FROM VtaVPedi WHERE codcia='007'")
    print([col[0] for col in cursor.description])
    print(cursor.fetchall())
except Exception as e:
    print(e)

try:
    cursor.execute("SELECT TOP 5 codcia, ptovta, nrodoc, codaux, codsol FROM VtaVPedi WHERE codcia='007'")
    print([col[0] for col in cursor.description])
    print(cursor.fetchall())
except Exception as e:
    print(e)
conn.close()
