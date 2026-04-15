import pyodbc, os
cs = f"DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={os.environ.get('DB_SERVER')};DATABASE={os.environ.get('DB_NAME')};UID={os.environ.get('DB_USER')};PWD={os.environ.get('DB_PASSWORD')};TrustServerCertificate=yes"
conn = pyodbc.connect(cs)
cursor = conn.cursor()
cursor.execute("SELECT TOP 1 * FROM AlmRMovm")
cols = [c[0] for c in cursor.description]
print(cols)
conn.close()
