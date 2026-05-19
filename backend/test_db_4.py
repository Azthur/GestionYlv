import sys
import os
sys.path.append(os.path.dirname(__file__))

from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

cursor.execute("SELECT RTRIM(CodCia), RTRIM(NroOrdenCompra), RTRIM(NumRucProveedor), Serie, Numero FROM CntFacturaCab WHERE NroOrdenCompra = '00000158' AND CodCia = '007'")
print("CntFacturaCab (Cia 007):", cursor.fetchall())
