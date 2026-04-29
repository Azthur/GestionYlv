import sys
from database import get_db_connection
conn = get_db_connection()
c = conn.cursor()
c.execute("""
SELECT CodCia, Anos, NroDoc, TipoOc, Accion, UsuarioLogin, UsuarioNombre
FROM LogOcAcciones
WHERE Accion = 'APROBACION'
ORDER BY FechaHora DESC
""")
rows = c.fetchall()
print(f"Total rows: {len(rows)}")
for r in rows[:10]:
    print(r)
