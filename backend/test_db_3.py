import sys
import os
sys.path.append(os.path.dirname(__file__))

from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

cursor.execute("SELECT RTRIM(CodCia), RTRIM(NroDoc), RTRIM(TipoOc), RTRIM(RucAux), RTRIM(NomAux) FROM CmpVOcom WHERE NroDoc = '00000158'")
print("CmpVOcom (all companies):", cursor.fetchall())
