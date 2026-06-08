import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from database import get_db_connection

conn = get_db_connection()
if conn:
    cursor = conn.cursor()
    cursor.execute("SELECT TOP 10 codcia, codigo, nombre FROM AlmTabla WHERE tabla='0017'")
    print("Services sample:")
    for r in cursor.fetchall():
        print(r)
    conn.close()
