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
    # Let's see if we can do a SELECT on CcbICaja first
    cursor.execute("SELECT TOP 5 * FROM CcbICaja")
    rows = cursor.fetchall()
    print("Select successful, row count:", len(rows))
    
    # Try a dummy update on CcbICaja that we immediately rollback
    # We update a non-existent or dummy key or we rollback
    print("Testing UPDATE with rollback...")
    cursor.execute("UPDATE CcbICaja SET flgest = 'P' WHERE 1=0")
    print("Update command executed successfully (no error)!")
    conn.rollback()
except Exception as e:
    print("Error updating:", e)
finally:
    conn.close()
