import os
import sys

filename = r'c:\SistemaGestionyelave\backend\contabilidad.py'

with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

endpoint_code = '''
@router.delete("/archivos/{archivo_id}")
def delete_archivo(archivo_id: int):
    """Eliminar archivo adjunto de factura"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error de base de datos")
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT RutaArchivo FROM CntFacturaArchivos WHERE Id=?", (archivo_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        ruta_archivo = row[0]
        if ruta_archivo and os.path.exists(ruta_archivo):
            try:
                os.remove(ruta_archivo)
            except Exception as e:
                print(f"DEBUG: Error al eliminar archivo del disco: {e}")
        
        cursor.execute("DELETE FROM CntFacturaArchivos WHERE Id=?", (archivo_id,))
        conn.commit()
        return {"ok": True}
    except Exception as e:
        print(f"DEBUG: Error en delete_archivo: {e}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar archivo: {str(e)}")
    finally:
        conn.close()

'''

if '@router.delete("/archivos/{archivo_id}")' not in content:
    # Insert right before @router.post("/facturas/{factura_id}/items/archivos/upload")
    target = '@router.post("/facturas/{factura_id}/items/archivos/upload")'
    if target in content:
        content = content.replace(target, endpoint_code + target)
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Endpoint added to contabilidad.py")
    else:
        print("Target not found in contabilidad.py")
else:
    print("Endpoint already exists in contabilidad.py")
