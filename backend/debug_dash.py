from database import get_db_connection
conn = get_db_connection()
c = conn.cursor()
c.execute("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='VtaUbige' ORDER BY ORDINAL_POSITION")
for r in c.fetchall():
    print(r[0], r[1])
print('---SAMPLE---')
c.execute('SELECT TOP 5 * FROM VtaUbige')
cols = [x[0] for x in c.description]
for r in c.fetchall():
    d = {cols[i]: str(r[i]).strip() for i in range(len(cols))}
    print(d)
conn.close()
