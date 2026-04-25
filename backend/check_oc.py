from database import get_db_connection
conn = get_db_connection()
c = conn.cursor()
c.execute("SELECT TOP 3 RTRIM(NroDoc), RTRIM(TipoOc), Fchdoc FROM CmpVOcom WHERE RTRIM(NroDoc) IN ('00001220','00005565','00000001') AND RTRIM(CodCia)='003' ORDER BY NroDoc")
for r in c.fetchall():
    print(f"NroDoc={r[0]}, TipoOc={r[1]}, Fchdoc={r[2]}")
conn.close()
