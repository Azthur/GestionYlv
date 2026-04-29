import sys
sys.path.append('c:\\SistemaGestionyelave\\backend')
from database import get_db_connection
conn = get_db_connection()
c = conn.cursor()
c.execute("""
SELECT CodCia, Anos, NroDoc, TipoOc, Accion, UsuarioLogin, UsuarioNombre
FROM LogOcAcciones
WHERE Accion = 'APROBACION'
ORDER BY FechaHora DESC
""")
for r in c.fetchall():
    print(r)
