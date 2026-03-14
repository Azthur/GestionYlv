import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection

def main():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ReconciliationDetail WHERE MatchNrodoc='0000000252'")
    for row in cursor.fetchall():
        print(row)

if __name__ == '__main__':
    main()
