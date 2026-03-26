import os
import sys

sys.path.append(r"c:\SistemaGestionyelave\backend")
from database import get_db_connection

def test_query():
    conn = get_db_connection()
    if not conn:
        print("No connection")
        return
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT TOP 1 * FROM CcbMVtos")
        columns = [column[0] for column in cursor.description]
        print("Columns in CcbMVtos:", columns)
    except Exception as e:
        print("Query Error:", str(e))
    finally:
        conn.close()

if __name__ == "__main__":
    test_query()
