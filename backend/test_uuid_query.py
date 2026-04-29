from database import get_db_connection
try:
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT Id FROM FinPagos p WHERE RTRIM(p.Uuid) = ?", ("cb273a01-b51b-4c48-a",))
    print("row for UUID:", c.fetchone())
except Exception as e:
    print(e)
