from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
tables = [r[0] for r in cursor.fetchall()]
print("=== ALL TABLES ===")
for t in tables:
    print(t)

# Now get columns for key tables
key_tables = ['AdmMcias', 'CcbICaja', 'CcbMVtos', 'POSTARJE', 'admcaja', 'CcbTabla']
for table_name in key_tables:
    print(f"\n=== COLUMNS FOR {table_name} ===")
    try:
        cursor.execute(f"""
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = '{table_name}'
            ORDER BY ORDINAL_POSITION
        """)
        rows = cursor.fetchall()
        if not rows:
            print(f"  (Table not found)")
        for r in rows:
            print(f"  {r[0]:30s} {r[1]:15s} {str(r[2] or ''):>10s} {r[3]}")
    except Exception as e:
        print(f"  Error: {e}")

conn.close()
