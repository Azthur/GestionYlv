import os

def patch():
    file_path = 'c:\\SistemaGestionyelave\\backend\\gastos_rendiciones.py'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the current GET endpoint and remove it to replace it
    start_str = '# ════════════════════════════════════════════════════════════\n#  ENDPOINT PROVEEDORES (RUC Lookup)\n# ════════════════════════════════════════════════════════════'
    end_str = '# ════════════════════════════════════════════════════════════\n#  ENDPOINT AUXILIARES'
    
    if start_str in content and end_str in content:
        before = content.split(start_str)[0]
        after = content.split(end_str)[1]
        
        new_endpoints = '''
# ════════════════════════════════════════════════════════════
#  ENDPOINT PROVEEDORES (RUC Lookup y Creación)
# ════════════════════════════════════════════════════════════
from pydantic import BaseModel
class ProveedorCreate(BaseModel):
    codcia: str
    ruc: str
    razon_social: str
    direccion: str
    ubigeo: str = ""
    coddep: str = ""
    codpro: str = ""
    coddis: str = ""
    email: str = ""

@router.get("/proveedor/{ruc}")
def get_proveedor_ruc(ruc: str, codcia: str = Query(...)):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        
        # 1. Buscar en BD local
        cursor.execute("""
            SELECT RTRIM(codaux) as codaux, RTRIM(nomaux) as nomaux, RTRIM(rucaux) as rucaux, RTRIM(diraux) as diraux 
            FROM CbdMAuxi 
            WHERE codcia = ? AND clfaux = '005' AND RTRIM(rucaux) = ?
        """, (codcia, ruc.strip()))
        row = cursor.fetchone()
        
        if row:
            cols = [col[0] for col in cursor.description]
            return {"origen": "local", "data": dict(zip(cols, row))}
            
        # 2. Buscar en API externa
        import requests
        url = f"https://api.org.pe/v1/ruc/{ruc.strip()}"
        headers = {'Authorization': 'Bearer 8b95d098223b4c2cbc4249d3fa490b17'}
        
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            api_data = resp.json()
            if api_data.get('success'):
                d = api_data['data']
                ubigeo_arr = d.get('ubigeo', [])
                
                return {
                    "origen": "api", 
                    "data": {
                        "rucaux": str(d.get('ruc', '')),
                        "nomaux": str(d.get('nombre_o_razon_social', '')),
                        "diraux": str(d.get('direccion_completa', '')),
                        "ubigeo": ubigeo_arr[2] if len(ubigeo_arr) > 2 else '',
                        "coddep": ubigeo_arr[0] if len(ubigeo_arr) > 0 else '',
                        "codpro": ubigeo_arr[1] if len(ubigeo_arr) > 1 else '',
                        "coddis": ubigeo_arr[2] if len(ubigeo_arr) > 2 else ''
                    }
                }
            else:
                raise HTTPException(status_code=404, detail="RUC no encontrado en la API.")
        else:
            raise HTTPException(status_code=404, detail="RUC no encontrado en la API externa.")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/proveedor")
def create_proveedor(prov: ProveedorCreate):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Error DB")
    try:
        cursor = conn.cursor()
        jruc = prov.ruc[:15]
        jrs = prov.razon_social[:60]
        jdir = prov.direccion[:60] # diraux usually varchar(60) or 40
        xtpodoc = '6' if len(jruc) == 11 else '1'
        
        cursor.execute("""
            INSERT INTO Cbdmauxi 
            (CODCIA, clfaux, codaux, nomaux, diraux, rucaux, TLFaux, contacto, 
             coddep, codpro, coddis, ptolle, TPODOC, CODZON, CODNAC, CODVEN, 
             CODEST, CODRET, FCHALT, TPOVTA, EMAIL, pais, email2) 
            VALUES (?, '005', ?, ?, ?, ?, '', '', 
                    ?, ?, ?, '', ?, '06', '0001', '', 
                    '1', '2', GETDATE(), '02', ?, '', '')
        """, (
            prov.codcia, jruc, jrs, jdir, jruc,
            prov.coddep[:6], prov.codpro[:6], prov.coddis[:6], xtpodoc,
            prov.email[:60]
        ))
        conn.commit()
        return {"status": "success", "data": {"codaux": jruc, "nomaux": jrs, "rucaux": jruc, "diraux": jdir}}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# ════════════════════════════════════════════════════════════
#  ENDPOINT AUXILIARES'''
        content = before + new_endpoints + after
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Endpoints de Proveedor modificados.')

if __name__ == '__main__':
    patch()
