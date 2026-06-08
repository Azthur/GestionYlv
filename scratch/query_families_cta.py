import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from database import get_db_connection

conn = get_db_connection()
if conn:
    cursor = conn.cursor()
    cursor.execute("SELECT RTRIM(codigo) as codigo, RTRIM(nombre) as nombre, RTRIM(codcta) as codcta FROM AlmTabla WHERE tabla='0001'")
    for r in cursor.fetchall():
        if r[2]:
            print(r)
    conn.close()
