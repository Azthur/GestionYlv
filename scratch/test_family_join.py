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
    cursor.execute("""
        SELECT TOP 10 
            m.codmat, 
            m.desmat, 
            m.codfam, 
            f.nombre as FamilyName, 
            f.codcta as AccountCode 
        FROM AlmmMatg m 
        LEFT JOIN AlmTabla f ON f.tabla = '0001' AND RTRIM(f.codigo) = RTRIM(m.codfam)
        WHERE f.codcta IS NOT NULL AND RTRIM(f.codcta) <> ''
    """)
    rows = cursor.fetchall()
    print("Sample matched products with family account code:")
    for r in rows:
        print(r)

except Exception as e:
    print("Error:", e)
finally:
    conn.close()
