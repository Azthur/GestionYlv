import os
import re

def patch():
    file_path = 'c:\\SistemaGestionyelave\\backend\\gastos_rendiciones.py'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_endpoint = '''
# ════════════════════════════════════════════════════════════
#  ENDPOINT PROVEEDORES (RUC Lookup)
# ════════════════════════════════════════════════════════════
@router.get("/proveedor/{ruc}")
def get_proveedor_ruc(ruc: str, codcia: str = Query(...)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        
        # 1. Buscar en base de datos local
        cursor.execute("""
            SELECT RTRIM(codaux) as codaux, RTRIM(nomaux) as nomaux, RTRIM(rucaux) as rucaux, RTRIM(diraux) as diraux 
            FROM CbdMAuxi 
            WHERE codcia = ? AND clfaux = '005' AND RTRIM(rucaux) = ?
        """, (codcia, ruc.strip()))
        row = cursor.fetchone()
        
        if row:
            cols = [col[0] for col in cursor.description]
            return {"origen": "local", "data": dict(zip(cols, row))}
            
        # 2. Si no existe, buscar en API externa
        import requests
        url = f"https://api.org.pe/v1/ruc/{ruc.strip()}"
        headers = {
            'Authorization': 'Bearer 8b95d098223b4c2cbc4249d3fa490b17'
        }
        
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            api_data = resp.json()
            if api_data.get('success'):
                d = api_data['data']
                jruc = str(d.get('ruc', ''))
                jrs = str(d.get('nombre_o_razon_social', ''))
                jdir = str(d.get('direccion_completa', ''))
                
                # Ubigeo
                ubigeo_arr = d.get('ubigeo', [])
                xcoddep = ubigeo_arr[0] if len(ubigeo_arr) > 0 else ''
                xcodpro = ubigeo_arr[1] if len(ubigeo_arr) > 1 else ''
                xcoddis = ubigeo_arr[2] if len(ubigeo_arr) > 2 else ''
                jubigeo = xcoddis
                
                xtpodoc = '6' if len(jruc) == 11 else '1'
                
                # Insertar en base de datos
                cursor.execute("""
                    INSERT INTO Cbdmauxi 
                    (CODCIA, clfaux, codaux, nomaux, diraux, rucaux, TLFaux, contacto, 
                     coddep, codpro, coddis, ptolle, TPODOC, CODZON, CODNAC, CODVEN, 
                     CODEST, CODRET, FCHALT, TPOVTA, EMAIL, pais, email2) 
                    VALUES (?, '005', ?, ?, ?, ?, '', '', 
                            ?, ?, ?, '', ?, '06', '0001', '', 
                            '1', '2', GETDATE(), '02', '', '', ?)
                """, (
                    codcia, jruc, jrs[:60], jdir[:100], jruc,
                    xcoddep, xcodpro, xcoddis, xtpodoc,
                    jubigeo
                ))
                conn.commit()
                
                return {
                    "origen": "api", 
                    "data": {
                        "codaux": jruc,
                        "nomaux": jrs,
                        "rucaux": jruc,
                        "diraux": jdir
                    }
                }
            else:
                raise HTTPException(status_code=404, detail="RUC no encontrado en la API.")
        else:
            raise HTTPException(status_code=404, detail="RUC no encontrado en la API.")
            
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
'''

    target = '# ════════════════════════════════════════════════════════════\n#  ENDPOINT AUXILIARES'
    if 'def get_proveedor_ruc' not in content:
        content = content.replace(target, new_endpoint + '\n' + target)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Endpoint agregado')
    else:
        print('Endpoint ya existe')

if __name__ == '__main__':
    patch()
