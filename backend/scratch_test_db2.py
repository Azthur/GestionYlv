import sys
sys.path.append('C:/SistemaGestionyelave/backend')
from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT ISNULL(PuedeVerTodo, 0) FROM WebUsers WHERE login = '71941916JL'")
print("PuedeVerTodo:", cursor.fetchall())

cursor.execute("SELECT RTRIM(TipoOc) FROM WebUsuarioTipoOc WHERE login = '71941916JL'")
print("Allowed Types:", cursor.fetchall())
