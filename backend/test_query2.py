import sys
sys.path.insert(0,'/app/backend')
from database import get_db_connection

conn = get_db_connection()
c = conn.cursor()
base_query = """
SELECT f.Id, RTRIM(f.CodCia) as CodCia,
       RTRIM(f.CodTipoDoc) as CodTipoDoc, RTRIM(f.Serie) as Serie, RTRIM(f.Numero) as Numero,
       f.FecEmision, f.FecVencimiento,
       RTRIM(f.NomProveedor) as NomProveedor, RTRIM(f.NumRucProveedor) as NumRucProveedor,
       RTRIM(f.CodMoneda) as CodMoneda, f.Total,
       f.Estado, f.Uuid, f.CreatedAt, RTRIM(f.NroOrdenCompra) as NroOrdenCompra
FROM CntFacturaCab f
WHERE RTRIM(f.CodCia) = ?
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
  AND f.Estado != 'Anulada'
  AND NOT EXISTS (
      SELECT 1 FROM CntCargosDetalle d
      WHERE RTRIM(d.NroFactura) = RTRIM(f.Serie) + '-' + RTRIM(f.Numero)
        AND RTRIM(d.CodCiaOc) = RTRIM(f.CodCia)
        AND RTRIM(d.RucProveedor) = RTRIM(f.NumRucProveedor)
  )
  AND NOT EXISTS (
      SELECT 1 FROM FinRendicionGastosDet rd
      INNER JOIN FinRendicionGastosCab rc ON rd.RendicionId = rc.Id
      WHERE rd.DocReferenciaId = f.Id
        AND rc.FechaAprobacion IS NOT NULL
  )
"""
params = ['003']
base_query += " AND YEAR(f.FecEmision) = ?"
params.append("2026")
base_query += " AND MONTH(f.FecEmision) = ?"
params.append(4)

print("QUERY:", base_query)
print("PARAMS:", params)
c.execute(base_query, tuple(params))
rows = c.fetchall()
print("ROWS MATCHING:", [r[0] for r in rows])
conn.close()
