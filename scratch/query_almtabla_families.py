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
    
    # 1. Print all column names of AlmTabla
    cursor.execute("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AlmTabla'")
    print("=== AlmTabla Columns ===")
    for r in cursor.fetchall():
        print(f"  {r[0]}: {r[1]}")
        
    # 2. Check distinct codfam values from AlmmMatg
    cursor.execute("SELECT TOP 10 codfam, COUNT(*) FROM AlmmMatg GROUP BY codfam ORDER BY COUNT(*) DESC")
    print("\n=== AlmmMatg codfam Sample ===")
    for r in cursor.fetchall():
        print(r)
        
    # 3. Check AlmTabla where tabla='0001' or '0003' to see if their 'codigo' matches AlmmMatg 'codfam'
    cursor.execute("SELECT TOP 5 codigo, nombre, codcta, codcta2 FROM AlmTabla WHERE tabla='0001'")
    print("\n=== AlmTabla Sample tabla='0001' (Families?) ===")
    for r in cursor.fetchall():
        print(r)
        
    # 4. Check if there are other table codes in AlmTabla that match codfam
    # We will search for a table code where the 'codigo' values match the 'codfam' values from AlmmMatg
    # Let's see if tabla='0003' is family.
    cursor.execute("SELECT TOP 5 codigo, nombre, codcta, codcta2 FROM AlmTabla WHERE tabla='0003'")
    print("\n=== AlmTabla Sample tabla='0003' (Subfamilies / Lines?) ===")
    for r in cursor.fetchall():
        print(r)

except Exception as e:
    print("Error:", e)
finally:
    conn.close()
