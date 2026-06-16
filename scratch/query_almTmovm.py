import sys
import os
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend'))
from database import get_db_connection

conn = get_db_connection()
if not conn:
    print("Could not connect")
    sys.exit(1)

try:
    cursor = conn.cursor()
    cursor.execute("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='almTmovm'")
    print("almTmovm Columns:")
    for r in cursor.fetchall():
        print(f"  {r[0]}: {r[1]}")

    cursor.execute("SELECT TOP 10 codcia, tipmov, codmov, desmov FROM almTmovm")
    print("\nalmTmovm Top 10 rows:")
    for r in cursor.fetchall():
        print(f"  cia: {r[0].strip() if r[0] else ''}, tipmov: {r[1].strip() if r[1] else ''}, codmov: {r[2].strip() if r[2] else ''}, desmov: {r[3].strip() if r[3] else ''}")
        
except Exception as e:
    print("Error:", e)
finally:
    conn.close()
