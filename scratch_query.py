import sys
sys.path.append('c:\\SistemaGestionyelave\\backend')
from database import get_db_connection
conn = get_db_connection()
c = conn.cursor()
c.execute("""
SELECT TOP 3
    RTRIM(NroDoc) as nrodoc,
    RTRIM(TipoOc) as tipooc,
    RTRIM(FlgEst) as estado,
    (SELECT TOP 1 RTRIM(UsuarioNombre) FROM LogOcAcciones l WHERE RTRIM(l.CodCia) = RTRIM(o.CodCia) AND RTRIM(l.NroDoc) = RTRIM(o.NroDoc) AND RTRIM(l.TipoOc) = RTRIM(o.TipoOc) AND l.Accion = 'APROBACION' ORDER BY l.FechaHora DESC) as usuario_aprobado
FROM CmpVOcom o 
WHERE RTRIM(CodCia) = '01'
ORDER BY Fchdoc DESC
""")
for r in c.fetchall():
    print(r.nrodoc, r.tipooc, r.estado, r.usuario_aprobado)
