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
    
    # 1. AlmmMatg columns
    cursor.execute("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AlmmMatg'")
    print("=== AlmmMatg Columns ===")
    cols_matg = cursor.fetchall()
    for col in cols_matg:
        if any(term in col[0].upper() for term in ['CTA', 'CUENTA', 'CONTABLE', 'CTA']):
            print(f"  {col[0]}: {col[1]}")
    
    # 2. AlmTabla columns
    cursor.execute("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AlmTabla'")
    print("\n=== AlmTabla Columns ===")
    cols_almt = cursor.fetchall()
    for col in cols_almt:
        if any(term in col[0].upper() for term in ['CTA', 'CUENTA', 'CONTABLE']):
            print(f"  {col[0]}: {col[1]}")
            
    # 3. CONGASTO columns
    cursor.execute("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CONGASTO'")
    print("\n=== CONGASTO Columns ===")
    cols_congasto = cursor.fetchall()
    for col in cols_congasto:
        if any(term in col[0].upper() for term in ['CTA', 'CUENTA', 'CONTABLE']):
            print(f"  {col[0]}: {col[1]}")

except Exception as e:
    print("Error:", e)
finally:
    conn.close()
