import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from database import get_db_connection

conn = get_db_connection()
if not conn:
    print("Could not connect")
    sys.exit(1)

try:
    cursor = conn.cursor()
    
    # 1. Query distinct table codes and their names/counts
    cursor.execute("""
        SELECT TOP 30 tabla, COUNT(*) as count 
        FROM AlmTabla 
        GROUP BY tabla 
        ORDER BY count DESC
    """)
    print("Distinct tabla codes in AlmTabla:")
    for r in cursor.fetchall():
        print(r)
        
    # Let's inspect what is in AlmTabla where tabla='0006' or similar (common for families)
    # We will search for rows in AlmTabla where nombre or descripcion contains 'familia' or similar
    cursor.execute("""
        SELECT DISTINCT tabla 
        FROM AlmTabla 
        WHERE nombre LIKE '%FAM%' OR nombre LIKE '%LÍNEA%' OR nombre LIKE '%LINEA%'
    """)
    print("AlmTabla types matching name pattern:", cursor.fetchall())
    
    # Let's see if there is any other table that could be families, like CbdMCtas or CcbTabla
    # Wait, the user said: "cruzando la familia alli hay un columna 'codcta'".
    # Let's search if there is a table AlmFamil or AlmFamilia, or AlmTabla with tabla='0003' or similar.
    # Let's check AlmTabla rows for tabla='0006' (common family code) or '0005' or '0003'
    for t_code in ['0006', '0005', '0003', '0002', '0004']:
        cursor.execute(f"SELECT TOP 3 * FROM AlmTabla WHERE tabla='{t_code}'")
        rows = cursor.fetchall()
        if rows:
            print(f"AlmTabla Sample for tabla={t_code}:")
            for r in rows:
                print(r)

except Exception as e:
    print("Error:", e)
finally:
    conn.close()
