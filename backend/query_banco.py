import sys
import os
sys.path.append(r'c:\SistemaGestionyelave\backend')
from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

print("CcbTabla:")
cursor.execute("SELECT CodCia, Codigo, Nombre FROM CcbTabla WHERE Tabla = '0001' AND Codigo IN ('0005 ', '2063 ', '7004 ', 'BCO2 ', '7016 ')")
for row in cursor.fetchall():
    print(row)
    
print("POSTARJE:")
cursor.execute("SELECT CODcia, codtarj, DESTARJ FROM POSTARJE WHERE codtarj IN ('0005 ', '2063 ', '7004 ', 'BCO2 ', '7016 ')")
for row in cursor.fetchall():
    print(row)
