import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection

def main():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT nroitm, nroref, CodCia, coddoc, nrodoc 
        FROM CcbMVtos 
        WHERE coddoc='CJ01' AND nrodoc='0000000253' AND nroref='I010001222'
    """)
    for row in cursor.fetchall():
        print("CcbMVtos:", row)
        
    cursor.execute("""
        SELECT MatchCodCia, MatchCoddoc, MatchNrodoc, MatchNroitm 
        FROM ReconciliationDetail
        WHERE MatchNrodoc='0000000253'
    """)
    for row in cursor.fetchall():
        print("ReconciliationDetail:", row)

if __name__ == '__main__':
    main()
