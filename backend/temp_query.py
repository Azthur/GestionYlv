import pyodbc
from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT Serie, Numero, CodTipoDoc, FechaVencimiento FROM CntFacturaCab WHERE RTRIM(NroOrdenCompra)='00001220'")
print(cursor.fetchall())
conn.close()
