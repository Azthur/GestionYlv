"""
Corrige los registros en CntCargosDetalle que tienen TipoOc='OC' genérico,
actualizándolos con el tipo real (M, S, T) desde CmpVOcom.
"""
from database import get_db_connection

def fix_tipo_oc():
    conn = get_db_connection()
    if not conn:
        print("[ERROR] No se pudo conectar.")
        return
    c = conn.cursor()
    c.execute("SET ARITHABORT ON")
    
    # Actualizar TipoOc con el tipo real de CmpVOcom
    c.execute("""
        UPDATE d SET d.TipoOc = RTRIM(o.TipoOc)
        FROM CntCargosDetalle d
        INNER JOIN CmpVOcom o 
            ON RTRIM(o.NroDoc) = RTRIM(d.NroOrdenCompra)
            AND RTRIM(o.CodCia) = RTRIM(d.CodCiaOc)
        WHERE RTRIM(d.TipoOc) = 'OC'
    """)
    print(f"TipoOc OC actualizado al tipo real: {c.rowcount} filas")
    
    conn.commit()
    
    # Verificar
    c.execute("SELECT DISTINCT RTRIM(TipoOc) FROM CntCargosDetalle")
    print(f"Tipos existentes en CntCargosDetalle: {[r[0] for r in c.fetchall()]}")
    
    # Mostrar detalle
    c.execute("SELECT RTRIM(NroOrdenCompra), RTRIM(TipoOc), RTRIM(Moneda) FROM CntCargosDetalle ORDER BY Id")
    for r in c.fetchall():
        print(f"  NroOC={r[0]}, TipoOc={r[1]}, Moneda={r[2]}")
    
    conn.close()
    print("\n=== FIX TIPO OC COMPLETADO ===")

if __name__ == "__main__":
    fix_tipo_oc()
