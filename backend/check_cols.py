from database import get_db_connection
conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CntFacturaCab' ORDER BY ORDINAL_POSITION")
for r in cursor.fetchall():
    print(f"{r[0]:35s} {r[1]:15s} {str(r[2]):>10s}")
print("---CntFacturaDet---")
cursor.execute("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CntFacturaDet' ORDER BY ORDINAL_POSITION")
for r in cursor.fetchall():
    print(f"{r[0]:35s} {r[1]:15s} {str(r[2]):>10s}")
conn.close()
