import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection

def main():
    conn = get_db_connection()
    cursor = conn.cursor()
    query = """
        SELECT m.nroitm, m.tpopgo, m.CodCia,
        CASE WHEN EXISTS (
            SELECT 1 FROM ReconciliationDetail rd
            WHERE rd.MatchCodCia = m.CodCia
              AND rd.MatchCoddoc = m.coddoc
              AND rd.MatchNrodoc = m.nrodoc
              AND rd.MatchNroitm = m.nroitm
        ) THEN 'Conciliado' ELSE 'Pendiente' END as EstadoConciliacion
        FROM CcbMVtos m
        WHERE m.coddoc = 'CJ01' AND m.nrodoc = '0000000252'
    """
    cursor.execute(query)
    rows = cursor.fetchall()
    for r in rows:
        if r[3] == 'Conciliado':
            print(f"Item: {r[0]} | Estado: {r[3]}")
    
    # Let's count Pendiente
    pendientes = sum(1 for r in rows if r[3] == 'Pendiente')
    print(f"Total Pendientes: {pendientes}")
    print(f"Total Conciliados: {sum(1 for r in rows if r[3] == 'Conciliado')}")

if __name__ == '__main__':
    main()
