import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection

def main():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT CodCia, nroitm, tpopgo, codref, nroref, NomAux, CodDep,
        CASE WHEN EXISTS (
            SELECT 1 FROM ReconciliationDetail rd
            WHERE rd.MatchCodCia = m.CodCia
              AND rd.MatchCoddoc = m.coddoc
              AND rd.MatchNrodoc = m.nrodoc
              AND rd.MatchNroitm = m.nroitm
        ) THEN 'Conciliado' ELSE 'Pendiente' END as Estado
        FROM CcbMVtos m 
        WHERE coddoc='CJ01' AND nrodoc='0000000252' AND nroref='I010001212'
    """)
    for row in cursor.fetchall():
        print(row)

if __name__ == '__main__':
    main()
