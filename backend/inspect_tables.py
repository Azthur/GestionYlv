from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

def print_columns(table_name):
    print(f"--- Table: {table_name} ---")
    try:
        cursor.execute(f"SELECT TOP 1 * FROM {table_name}")
        cols = [column[0] for column in cursor.description]
        print(cols)
    except Exception as e:
        print(f"Error querying {table_name}: {e}")

print_columns("AdmMcias")
print_columns("CmpVOcom")
print_columns("CmpROcom")

conn.close()
