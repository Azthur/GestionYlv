import sys
sys.path.append('c:\\SistemaGestionyelave\\backend')
from database import get_db_connection
conn = get_db_connection()
c = conn.cursor()
c.execute("""
SELECT RTRIM(Codigo) as Codigo, RTRIM(Nombre) as Nombre
FROM CjaMTipo
WHERE Tabla = '0002'
ORDER BY Codigo
""")
for r in c.fetchall():
    print(f"Code: {r[0]} | Name: {r[1]}")
