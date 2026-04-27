import sys
sys.path.insert(0,'/app/backend')
from database import get_db_connection

conn = get_db_connection()
c = conn.cursor()
query = """
SELECT f.Id FROM CntFacturaCab f 
WHERE f.Id = 46
  AND (
      (f.NroOrdenCompra IS NULL OR RTRIM(f.NroOrdenCompra) = '' OR RTRIM(f.NroOrdenCompra) = '-')
      OR
      (
          f.NroOrdenCompra IS NOT NULL AND RTRIM(f.NroOrdenCompra) != '' AND RTRIM(f.NroOrdenCompra) != '-'
          AND EXISTS (
              SELECT 1 FROM CntCargosDetalle d2 
              INNER JOIN CntCargosDocumentales c2 ON d2.CargoId = c2.Id
              WHERE RTRIM(d2.NroOrdenCompra) = RTRIM(f.NroOrdenCompra)
                AND RTRIM(d2.CodCiaOc) = RTRIM(f.CodCia)
                AND (d2.NroFactura IS NULL OR RTRIM(d2.NroFactura) = '' OR RTRIM(d2.NroFactura) = '-')
                AND c2.TipoCargo = 'LOG_A_CONT'
                AND c2.Estado != 'ANULADO'
          )
      )
  )
  AND NOT EXISTS (
      SELECT 1 FROM CntCargosDetalle d
      WHERE RTRIM(d.NroFactura) = RTRIM(f.Serie) + '-' + RTRIM(f.Numero)
        AND RTRIM(d.CodCiaOc) = RTRIM(f.CodCia)
        AND RTRIM(d.RucProveedor) = RTRIM(f.NumRucProveedor)
  )
"""
c.execute(query)
print("ROWS MATCHING:", c.fetchall())

# Now check if the month and year filtering is the issue
c.execute("SELECT FecEmision, YEAR(FecEmision), MONTH(FecEmision) FROM CntFacturaCab WHERE Id=46")
print("FECHA EMISION ID 46:", c.fetchall())

conn.close()
