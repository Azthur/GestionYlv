from database import get_db_connection

def fix_hierarchy_and_names():
    conn = get_db_connection()
    if not conn: return
    cursor = conn.cursor()
    
    try:
        # 1. Corregir nombres con caracteres especiales que se ven mal
        names_to_fix = {
            'inv_tab_prod': '    [Sub] Pestaña: Por Producto',
            'inv_tab_alm':  '    [Sub] Pestaña: Por Almacén',
            'inv_tab_lote': '    [Sub] Pestaña: Por Lote',
            'inv_btn_exc':  '    [Btn] Acción: Exportar Excel'
        }
        
        for cod, name in names_to_fix.items():
            cursor.execute("UPDATE WebModulos SET Nombre = ? WHERE Codigo = ?", (name, cod))
            print(f"Actualizado nombre de {cod}")

        # 2. Asegurar que el ParentId esté bien seteado para Inventario
        cursor.execute("SELECT Id FROM WebModulos WHERE Codigo = 'inventario'")
        inv_row = cursor.fetchone()
        if inv_row:
            inv_id = inv_row[0]
            child_codes = ['inv_tab_prod', 'inv_tab_alm', 'inv_tab_lote', 'inv_btn_exc']
            for code in child_codes:
                cursor.execute("UPDATE WebModulos SET ParentId = ? WHERE Codigo = ?", (inv_id, code))
                print(f"Vinculado {code} al padre Inventario")

        conn.commit()
        print("Corrección completada.")
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    fix_hierarchy_and_names()
