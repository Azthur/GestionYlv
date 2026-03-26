import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection

def main():
    conn = get_db_connection()
    cursor = conn.cursor()
    query = """
        SELECT m.nroitm, m.tpopgo, m.CodDep, m.CodCia, m.nrodoc, m.NroDep,
        CASE WHEN EXISTS (
            SELECT 1 FROM ReconciliationDetail rd
            WHERE rd.MatchCodCia = m.CodCia
              AND rd.MatchCoddoc = m.coddoc
              AND rd.MatchNrodoc = m.nrodoc
              AND rd.MatchNroitm = m.nroitm
        ) THEN 'Conciliado' ELSE 'Pendiente' END as EstadoConciliacion,
        banco.NombreBanco, pos.NombrePOS
        FROM CcbMVtos m
        OUTER APPLY (
            SELECT TOP 1 RTRIM(ct.Nombre) as NombreBanco
            FROM CcbTabla ct
            WHERE ct.Tabla = '0001' AND RTRIM(ct.Codigo) = RTRIM(m.CodDep)
            ORDER BY CASE WHEN ct.CodCia = m.CodCia THEN 0 ELSE 1 END
        ) banco
        OUTER APPLY (
            SELECT TOP 1 RTRIM(p.DESTARJ) + ' ' + RTRIM(p.comtarj) as NombrePOS
            FROM POSTARJE p
            WHERE RTRIM(p.codtarj) = RTRIM(m.CodDep)
            ORDER BY CASE WHEN p.CODcia = m.CodCia THEN 0 ELSE 1 END
        ) pos
        WHERE m.coddoc = 'CJ01' AND m.nrodoc = '0000000253'
    """
    cursor.execute(query)
    rows = cursor.fetchall()
    print("nroitm | tpopgo | CodDep | CodCia | NroDep | Estado | Banco | POS")
    print("-" * 80)
    for r in rows:
        print(f"{r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[5]} | {r[6]} | {r[7]} | {r[8]}")

if __name__ == '__main__':
    main()
