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
    codcia = '001'
    q_clean = '%ACF%'
    
    # Test AlmmMatg autocomplete with codcia join on AlmTabla
    cursor.execute("""
        SELECT TOP 15 
            RTRIM(m.codmat) as codigo, 
            RTRIM(m.desmat) as descripcion,
            RTRIM(f.codcta) as cuenta_contable
        FROM AlmmMatg m
        LEFT JOIN AlmTabla f ON f.tabla = '0001' AND RTRIM(f.codigo) = RTRIM(m.codfam) AND f.codcia = m.codcia
        WHERE RTRIM(m.codcia) = ? AND (m.codmat LIKE ? OR m.desmat LIKE ?)
    """, (codcia, q_clean, q_clean))
    print("AlmmMatg test with codcia join:")
    for r in cursor.fetchall():
        print(r)
        
except Exception as e:
    print("Error:", e)
finally:
    conn.close()
