import sys
import os
sys.path.append(os.path.dirname(__file__))

from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

cursor.execute("SELECT TOP 5 RTRIM(NroOrdenCompra), RTRIM(NumRucProveedor), Serie, Numero FROM CntFacturaCab WHERE NroOrdenCompra = '00000158'")
print("CntFacturaCab:", cursor.fetchall())

cursor.execute("SELECT TOP 5 RTRIM(NroDoc), RTRIM(TipoOc), RTRIM(RucAux), RTRIM(NomAux) FROM CmpVOcom WHERE NroDoc = '00000158'")
print("CmpVOcom:", cursor.fetchall())
