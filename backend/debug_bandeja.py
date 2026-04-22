import sys
sys.path.append('c:/SistemaGestionyelave/backend')
from database import get_db_connection

conn = get_db_connection()
if conn:
    c = conn.cursor()
    c.execute("SELECT c.Estado, LEN(c.Estado), RTRIM(c.Estado), c.CodCia, LEN(c.CodCia), RTRIM(c.CodCia) FROM CntCargosDocumentales c WHERE c.Id = 17")
    row = c.fetchone()
    print('Estado raw:', repr(row[0]), 'len:', row[1], 'trimmed:', repr(row[2]))
    print('CodCia raw:', repr(row[3]), 'len:', row[4], 'trimmed:', repr(row[5]))

    # Now test exact query the bandeja uses
    codcia = '003'
    query = """
        SELECT c.Id as CargoId, RTRIM(c.NroCargo) as NroCargo, RTRIM(c.TipoCargo) as TipoCargo, 
            RTRIM(c.Estado) as EstadoCargo, RTRIM(c.AreaDestino) as AreaDestino
        FROM CntCargosDocumentales c
        INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
        WHERE RTRIM(c.CodCia) = ?
    """
    # Test WITHOUT area filter
    c.execute(query + " ORDER BY c.FechaCargo DESC", (codcia,))
    rows = c.fetchall()
    print(f'\nALL cargos for codcia={codcia}: {len(rows)} rows')
    for r in rows[:5]:
        print(f'  CargoId={r[0]} NroCargo={r[1]} TipoCargo={r[2]} Estado={r[3]} AreaDest={r[4]}')

    # Test WITH CONTABILIDAD filter (same as bandeja)
    query2 = query + " AND ((RTRIM(c.AreaDestino) = 'CONTABILIDAD' AND c.Estado = 'PENDIENTE') OR (RTRIM(c.TipoCargo) = 'CONT_A_TES' AND RTRIM(d.EstadoContable) = 'RECHAZADO')) ORDER BY c.FechaCargo DESC"
    c.execute(query2, (codcia,))
    rows2 = c.fetchall()
    print(f'\nCONTABILIDAD filter: {len(rows2)} rows')
    for r in rows2[:5]:
        print(f'  CargoId={r[0]} NroCargo={r[1]} TipoCargo={r[2]} Estado={r[3]} AreaDest={r[4]}')

    # Test WITH RTRIM on Estado
    query3 = query + " AND ((RTRIM(c.AreaDestino) = 'CONTABILIDAD' AND RTRIM(c.Estado) = 'PENDIENTE') OR (RTRIM(c.TipoCargo) = 'CONT_A_TES' AND RTRIM(d.EstadoContable) = 'RECHAZADO')) ORDER BY c.FechaCargo DESC"
    c.execute(query3, (codcia,))
    rows3 = c.fetchall()
    print(f'\nCONTABILIDAD filter WITH RTRIM(Estado): {len(rows3)} rows')
    for r in rows3[:5]:
        print(f'  CargoId={r[0]} NroCargo={r[1]} TipoCargo={r[2]} Estado={r[3]} AreaDest={r[4]}')

    conn.close()
else:
    print("No DB connection")
