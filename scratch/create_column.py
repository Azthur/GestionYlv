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
    # Check if CuentaContable column exists in CntFacturaDet
    cursor.execute("SELECT COL_LENGTH('CntFacturaDet', 'CuentaContable')")
    col_len = cursor.fetchone()[0]
    if col_len is None:
        print("Column 'CuentaContable' does not exist in CntFacturaDet. Creating it...")
        cursor.execute("ALTER TABLE CntFacturaDet ADD [CuentaContable] varchar(100)")
        conn.commit()
        print("Column 'CuentaContable' created successfully!")
    else:
        print(f"Column 'CuentaContable' already exists with length {col_len}.")
except Exception as e:
    print("Error:", e)
finally:
    conn.close()
