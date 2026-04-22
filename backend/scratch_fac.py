import pyodbc, os
cs = f"DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={os.environ.get('DB_SERVER')};DATABASE={os.environ.get('DB_NAME')};UID={os.environ.get('DB_USER')};PWD={os.environ.get('DB_PASSWORD')};TrustServerCertificate=yes"
conn = pyodbc.connect(cs)
cursor = conn.cursor()
cursor.execute("SELECT fc.Estado FROM CntFacturaCab fc WHERE fc.NroOrdenCompra='00005565'")
print(cursor.fetchall())
conn.close()
