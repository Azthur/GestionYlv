import sys
sys.path.insert(0,'/app/backend')
from database import get_db_connection
conn = get_db_connection()
c = conn.cursor()
c.execute("SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CntFacturaCab' AND COLUMN_NAME='CreditoFecPlazo'")
print("TYPE:", c.fetchone())
conn.close()
