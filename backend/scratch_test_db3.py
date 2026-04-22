import sys, time
sys.path.append('C:/SistemaGestionyelave/backend')
from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

print("--- get_cargos_detallado (Contabilidad) ---")
q_detallado = """
    SELECT 
        c.Id as CargoId, d.NroOrdenCompra
    FROM CntCargosDocumentales c
    INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
    WHERE RTRIM(c.CodCia) = '003'
"""
t0 = time.time()
cursor.execute(q_detallado)
res = cursor.fetchall()
print(f"Basic filter query: {(time.time()-t0)*1000:.0f}ms (Rows: {len(res)})")

q_slow = """
    SELECT 
        c.Id as CargoId,
        ISNULL((SELECT SUM(candes) FROM AlmRMovm a WHERE RTRIM(a.ordcmp) = RTRIM(d.NroOrdenCompra) AND RTRIM(a.CodCia) = RTRIM(d.CodCiaOc)), 0) as cant_recibida
    FROM CntCargosDocumentales c
    INNER JOIN CntCargosDetalle d ON c.Id = d.CargoId
    WHERE RTRIM(c.CodCia) = '003'
"""
t1 = time.time()
cursor.execute(q_slow)
res2 = cursor.fetchall()
print(f"Query with AlmRMovm correlated subquery: {(time.time()-t1)*1000:.0f}ms")

conn.close()
