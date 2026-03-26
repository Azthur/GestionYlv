import sqlite3
import pyodbc 

try:
    conn = pyodbc.connect('Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=Yelave;UID=sa;PWD=sql2014;TrustServerCertificate=yes')
except Exception as e:
    print(e)
    conn = pyodbc.connect('Driver={SQL Server};Server=localhost;Database=yelave;UID=sa;PWD=sql2014')

cursor = conn.cursor()
cursor.execute("SELECT TOP 5 coddoc, nrodoc, nroitm, FlgEst FROM CcbMVtos")
rows = cursor.fetchall()
print([dict(zip([column[0] for column in cursor.description], row)) for row in rows])

query = """
    SELECT TOP 1
        m.FlgEst,
        rd.Id as MatchId,
        CASE WHEN (rd.Id IS NOT NULL OR m.FlgEst = 'C') THEN 1 ELSE 0 END as IsConciliado
    FROM CcbMVtos m
    LEFT JOIN ReconciliationDetail rd ON rd.MatchCodCia = m.CodCia 
        AND rd.MatchCoddoc = m.coddoc 
        AND rd.MatchNrodoc = m.nrodoc 
        AND rd.MatchNroitm = m.nroitm
    WHERE m.anos = '2026' AND m.mes = '03'
"""
cursor.execute(query)
rows = cursor.fetchall()
print([dict(zip([column[0] for column in cursor.description], row)) for row in rows])

conn.close()
