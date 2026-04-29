from database import get_db_connection
try:
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
            SELECT p.Id, RTRIM(p.CodCia) as CodCia, RTRIM(p.NroOrdenCompra) as NroOrdenCompra, 
                   RTRIM(p.TipoOc) as TipoOc, p.DetalleId, p.MontoPago, p.FechaPago, 
                   RTRIM(p.BancoPago) as BancoPago, RTRIM(p.Moneda) as Moneda, 
                   RTRIM(p.TipoPago) as TipoPago, RTRIM(p.NroOperacion) as NroOperacion, 
                   p.Notas, RTRIM(p.ConceptoPago) as ConceptoPago, 
                   RTRIM(p.UsuarioRegistro) as UsuarioRegistro,
                   p.FechaRegistro, RTRIM(p.Proveedor) as Proveedor, 
                   RTRIM(p.RucProveedor) as RucProveedor,
                   RTRIM(p.TipoComprobante) as TipoComprobante, p.FechaEmision,
                   RTRIM(p.Serie) as Serie, RTRIM(p.Numero) as Numero, 
                   RTRIM(p.NroFactura) as NroFactura, RTRIM(p.Estado) as Estado
            FROM FinPagos p
            WHERE RTRIM(p.Uuid) = ?
    """, ("cb273a01-b51b-4c48-a",))
    row = c.fetchone()
    print("row full query:", row)
except Exception as e:
    import traceback
    traceback.print_exc()
