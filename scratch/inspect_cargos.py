import sys
sys.path.append(r'c:\SistemaGestionyelave\backend')
from database import get_db_connection
import json

try:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Query 1: Registros con TipoDocumento = 'FACTURA_SI'
    cursor.execute("""
        SELECT TOP 20 
            Id, CargoId, NroOrdenCompra, TipoOc, NroFactura, MontoFactura, TipoDocumento, TipoComprobante
        FROM CntCargosDetalle 
        WHERE TipoDocumento = 'FACTURA_SI'
        ORDER BY Id DESC
    """)
    rows = cursor.fetchall()
    res = []
    for r in rows:
        res.append({
            "Id": r[0], "CargoId": r[1], "NroOrdenCompra": r[2], "TipoOc": r[3],
            "NroFactura": r[4], "MontoFactura": float(r[5]) if r[5] else 0,
            "TipoDocumento": r[6], "TipoComprobante": r[7]
        })
    print("REGISTROS CON 'FACTURA_SI':")
    print(json.dumps(res, indent=2))
    
    # Query 2: Registros sin factura (NroFactura es NULL o vacío) y ver su TipoDocumento
    cursor.execute("""
        SELECT TOP 10 
            Id, CargoId, NroOrdenCompra, TipoOc, NroFactura, TipoDocumento, TipoComprobante
        FROM CntCargosDetalle 
        WHERE NroFactura IS NULL OR RTRIM(NroFactura) = '' OR RTRIM(NroFactura) = '-'
        ORDER BY Id DESC
    """)
    rows = cursor.fetchall()
    res2 = []
    for r in rows:
        res2.append({
            "Id": r[0], "CargoId": r[1], "NroOrdenCompra": r[2], "TipoDocumento": r[5], "TipoComprobante": r[6]
        })
    print("\nREGISTROS SIN FACTURA:")
    print(json.dumps(res2, indent=2))
    
except Exception as e:
    print("Error:", e)
finally:
    if 'conn' in locals() and conn:
        conn.close()
