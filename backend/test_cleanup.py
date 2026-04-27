import sys
sys.path.insert(0,'/app/backend')
from database import get_db_connection
conn = get_db_connection()
c = conn.cursor()
c.execute('SET ARITHABORT ON')
c.execute("DELETE FROM CntFacturaDet WHERE FacturaCabId = 48")
c.execute("DELETE FROM CntFacturaCab WHERE Id = 48")
conn.commit()
print('Test record 48 (F001-999) cleaned')
conn.close()
