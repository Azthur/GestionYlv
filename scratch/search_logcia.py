import sys
sys.path.append('backend')
from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

print("Searching for LogCia in DB objects...")
try:
    cursor.execute("SELECT name, type_desc FROM sys.objects WHERE OBJECT_DEFINITION(object_id) LIKE '%LogCia%'")
    rows = cursor.fetchall()
    for row in rows:
        print(f"Found in: {row[0]} ({row[1]})")
    if not rows:
        print("No DB objects found with LogCia.")
except Exception as e:
    print(f"Error: {e}")
conn.close()
