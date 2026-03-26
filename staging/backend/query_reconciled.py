import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection

def main():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT nroitm, nroref FROM CcbMVtos WHERE coddoc='CJ01' AND nrodoc='0000000252' 
        AND nroitm IN ('0039      ','0045      ','0046      ','0037      ','0043      ','0047      ','0038      ','0044      ','0036      ','0042      ')
    """)
    for row in cursor.fetchall():
        print(row)

if __name__ == '__main__':
    main()
