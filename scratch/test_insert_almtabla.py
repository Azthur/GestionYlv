import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
import database

conn = database.get_db_connection()
cursor = conn.cursor()
try:
    cursor.execute("INSERT INTO AlmTabla (tabla, codigo, nombre, codcia) VALUES ('0001', '999999', 'FAMILIA PRUEBA INSERT', '007')")
    conn.commit()
    print("SUCCESS: Inserted into AlmTabla!")
    # Clean it up
    cursor.execute("DELETE FROM AlmTabla WHERE tabla='0001' AND codigo='999999' AND codcia='007'")
    conn.commit()
except Exception as e:
    print("FAILED: Cannot insert into AlmTabla:", e)
conn.close()
