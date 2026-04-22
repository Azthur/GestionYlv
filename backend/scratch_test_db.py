import sys
sys.path.append('C:/SistemaGestionyelave/backend')
from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT TOP 5 CodCia, Anos, RTRIM(Usuario), TipoOc, RTRIM(NroDoc), Fchdoc FROM CmpVOcom WHERE RTRIM(CodCia) = '01'")
rows = cursor.fetchall()
print("ROWS FOR CIA 01:", rows)

cursor.execute("SELECT TOP 5 CodCia, Anos, RTRIM(Usuario), TipoOc, RTRIM(NroDoc), Fchdoc FROM CmpVOcom WHERE RTRIM(CodCia) = '001'")
rows = cursor.fetchall()
print("ROWS FOR CIA 001:", rows)
