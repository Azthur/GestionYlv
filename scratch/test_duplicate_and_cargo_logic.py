import sys
import os

# Add backend to python path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from database import get_db_connection

def test_lstrip():
    print("Testing lstrip logic:")
    inputs = [
        ("00006935", "6935"),
        ("6935", "6935"),
        ("00000000", "0"),
        ("0", "0"),
        ("000123-A", "123-A"),
    ]
    for inp, expected in inputs:
        res = inp.lstrip('0') or '0'
        print(f"  Input: {inp} -> Result: {res} | Match expected: {res == expected}")
        assert res == expected

def test_queries():
    print("\nTesting modified SQL queries:")
    conn = get_db_connection()
    if not conn:
        print("  Could not connect to database")
        return
    cursor = conn.cursor()
    
    # 1. Test query from contabilidad.py (get_facturas_sin_oc)
    print("  Testing get_facturas_sin_oc base query execution...")
    codcia = '001' # or whatever company exists
    try:
        # Check first company code available
        cursor.execute("SELECT TOP 1 RTRIM(CodCia) FROM CntFacturaCab")
        row = cursor.fetchone()
        if row:
            codcia = row[0]
            print(f"    Using company code: {codcia}")
            
        cursor.execute("""
            SELECT TOP 5 f.Id, RTRIM(f.Serie) as Serie, RTRIM(f.Numero) as Numero, RTRIM(f.NroOrdenCompra) as NroOrdenCompra
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
                          WHERE ',' + REPLACE(RTRIM(f.NroOrdenCompra), ' ', '') + ',' LIKE '%,' + RTRIM(d2.NroOrdenCompra) + ',%'
                            AND RTRIM(d2.CodCiaOc) = RTRIM(f.CodCia)
                            AND c2.TipoCargo = 'LOG_A_CONT'
                            AND c2.Estado != 'ANULADO'
                      )
                  )
              )
        """, (codcia,))
        rows = cursor.fetchall()
        print(f"    Success! Found {len(rows)} invoices.")
        for r in rows:
            print(f"      Invoice ID={r[0]}, Serie={r[1]}, Numero={r[2]}, OC={r[3]}")
    except Exception as e:
        print(f"    Error executing get_facturas_sin_oc query: {e}")

    # 2. Test query from cargos_documentales.py (get_documentos_aceptados_tesoreria)
    print("  Testing get_documentos_aceptados_tesoreria query execution...")
    try:
        cursor.execute("""
            SELECT TOP 5
                d.Id,
                RTRIM(d.NroOrdenCompra) as NroOrdenCompra,
                RTRIM(d.NroFactura) as NroFactura
            FROM CntCargosDetalle d
            INNER JOIN CntCargosDocumentales c ON d.CargoId = c.Id
            WHERE c.TipoCargo = 'LOG_A_CONT'
              AND c.Estado != 'ANULADO'
              AND d.EstadoContable = 'ACEPTADO'
              AND RTRIM(c.CodCia) = RTRIM(?)
              AND NOT EXISTS (
                  SELECT 1 FROM CntCargosDetalle d2
                  INNER JOIN CntCargosDocumentales c2 ON d2.CargoId = c2.Id
                  WHERE (
                        (RTRIM(d.NroFactura) != '' AND RTRIM(d.NroFactura) != '-' AND RTRIM(d2.NroFactura) = RTRIM(d.NroFactura))
                        OR
                        (
                            (d.NroFactura IS NULL OR RTRIM(d.NroFactura) = '' OR RTRIM(d.NroFactura) = '-')
                            AND RTRIM(d.NroOrdenCompra) != ''
                            AND RTRIM(d2.NroOrdenCompra) = RTRIM(d.NroOrdenCompra)
                            AND (d2.NroFactura IS NULL OR RTRIM(d2.NroFactura) = '' OR RTRIM(d2.NroFactura) = '-')
                        )
                  )
                    AND d2.TipoOc = d.TipoOc
                    AND RTRIM(d2.CodCiaOc) = RTRIM(d.CodCiaOc)
                    AND c2.TipoCargo = 'CONT_A_TES'
                    AND c2.Estado != 'ANULADO'
                    AND ISNULL(d2.EstadoContable, 'PENDIENTE') != 'RECHAZADO'
              )
        """, (codcia,))
        rows = cursor.fetchall()
        print(f"    Success! Found {len(rows)} accepted documents.")
        for r in rows:
            print(f"      Detail ID={r[0]}, OC={r[1]}, Factura={r[2]}")
    except Exception as e:
        print(f"    Error executing get_documentos_aceptados_tesoreria query: {e}")

    conn.close()

def test_duplicate_check_logic_sim():
    print("\nTesting duplicate check simulation:")
    # Mocking rows in database
    existing_rows = [
        (101, "00006935"), # ID, Numero
        (102, "6935"),
        (103, "12345"),
    ]
    
    # Test cases: (new_numero, expected_duplicate)
    test_cases = [
        ("00006935", True),
        ("6935", True),
        ("000006935", True),
        ("12345", True),
        ("012345", True),
        ("12346", False),
        ("0012346", False),
    ]
    
    for new_num, expected_dup in test_cases:
        is_dup = False
        new_num_clean = new_num.strip().lstrip('0') or '0'
        for row in existing_rows:
            existing_id = row[0]
            existing_num = row[1].strip() if row[1] else ""
            existing_num_clean = existing_num.lstrip('0') or '0'
            if existing_num_clean == new_num_clean:
                is_dup = True
                break
        print(f"  New: {new_num} | Duplicate detected: {is_dup} | Match expected: {is_dup == expected_dup}")
        assert is_dup == expected_dup

if __name__ == "__main__":
    test_lstrip()
    test_duplicate_check_logic_sim()
    test_queries()
