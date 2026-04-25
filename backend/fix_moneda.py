"""
Script para unificar moneda a 1=PEN, 2=USD en TODAS las tablas del sistema.
"""
from database import get_db_connection

def fix_moneda():
    conn = get_db_connection()
    if not conn:
        print("[ERROR] No se pudo conectar.")
        return
    c = conn.cursor()
    c.execute("SET ARITHABORT ON")
    
    # === CntCargosDetalle ===
    c.execute("UPDATE CntCargosDetalle SET Moneda = '1' WHERE RTRIM(Moneda) IN ('PEN','S/','SOL','Soles','soles')")
    print(f"CntCargosDetalle PEN->1: {c.rowcount} rows")
    c.execute("UPDATE CntCargosDetalle SET Moneda = '2' WHERE RTRIM(Moneda) IN ('USD','US$','ME','Dolares','dolares')")
    print(f"CntCargosDetalle USD->2: {c.rowcount} rows")
    
    # === CntFacturaCab ===
    c.execute("UPDATE CntFacturaCab SET CodMoneda = '1' WHERE RTRIM(CodMoneda) IN ('PEN','S/','SOL','Soles','soles')")
    print(f"CntFacturaCab PEN->1: {c.rowcount} rows")
    c.execute("UPDATE CntFacturaCab SET CodMoneda = '2' WHERE RTRIM(CodMoneda) IN ('USD','US$','ME','Dolares','dolares')")
    print(f"CntFacturaCab USD->2: {c.rowcount} rows")
    
    # === FinRendicionGastosCab ===
    c.execute("UPDATE FinRendicionGastosCab SET Moneda = '1' WHERE RTRIM(Moneda) IN ('PEN','S/','SOL','Soles','soles')")
    print(f"FinRendicionGastosCab PEN->1: {c.rowcount} rows")
    c.execute("UPDATE FinRendicionGastosCab SET Moneda = '2' WHERE RTRIM(Moneda) IN ('USD','US$','ME','Dolares','dolares')")
    print(f"FinRendicionGastosCab USD->2: {c.rowcount} rows")
    
    # === FinPagos ===
    c.execute("UPDATE FinPagos SET Moneda = '1' WHERE RTRIM(Moneda) IN ('PEN','S/','SOL','Soles','soles') OR Moneda IS NULL")
    print(f"FinPagos PEN->1: {c.rowcount} rows")
    c.execute("UPDATE FinPagos SET Moneda = '2' WHERE RTRIM(Moneda) IN ('USD','US$','ME','Dolares','dolares')")
    print(f"FinPagos USD->2: {c.rowcount} rows")
    
    conn.commit()
    
    # Verificar
    c.execute("SELECT DISTINCT RTRIM(Moneda) FROM CntCargosDetalle WHERE Moneda IS NOT NULL")
    print(f"\nVerif CntCargosDetalle: {[r[0] for r in c.fetchall()]}")
    c.execute("SELECT DISTINCT RTRIM(CodMoneda) FROM CntFacturaCab WHERE CodMoneda IS NOT NULL")
    print(f"Verif CntFacturaCab: {[r[0] for r in c.fetchall()]}")
    c.execute("SELECT DISTINCT RTRIM(Moneda) FROM FinRendicionGastosCab WHERE Moneda IS NOT NULL")
    print(f"Verif FinRendicionGastosCab: {[r[0] for r in c.fetchall()]}")
    
    conn.close()
    print("\n=== MIGRACION DE MONEDA EXITOSA ===")

if __name__ == "__main__":
    fix_moneda()
