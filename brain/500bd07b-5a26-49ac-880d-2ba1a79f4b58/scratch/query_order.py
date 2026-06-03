import sys
sys.path.append(r'c:\SistemaGestionyelave\backend')
import database

conn = database.get_db_connection()
cursor = conn.cursor()

# Query the order 854
print("--- PURCHASE ORDER 854 ---")
cursor.execute("SELECT RTRIM(CodCia), RTRIM(Anos), RTRIM(NroDoc), RTRIM(TipoOc), RTRIM(Usuario), RTRIM(NomAux) FROM CmpVOcom WHERE NroDoc LIKE '%854%'")
for r in cursor.fetchall():
    print(r)

# Query WebUsers
print("\n--- WEB USERS ---")
cursor.execute("SELECT RTRIM(login), RTRIM(nombre), RTRIM(rol), ISNULL(PuedeVerTodo, 0) FROM WebUsers")
for r in cursor.fetchall():
    print(r)

# Query WebUsuarioTipoOc
print("\n--- USER TIPOOC PERMISSIONS ---")
cursor.execute("SELECT RTRIM(Login), RTRIM(TipoOc) FROM WebUsuarioTipoOc")
for r in cursor.fetchall():
    print(r)

conn.close()
