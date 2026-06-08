import requests

def main():
    base_url = "http://localhost:8000/api"
    
    # 1. Login
    print("1. Simulating Login for 71941916JL...")
    login_payload = {
        "username": "71941916JL",
        "password": "1996"
    }
    r = requests.post(f"{base_url}/auth/login", json=login_payload)
    print(f"Login Status: {r.status_code}")
    if r.status_code != 200:
        print("Login failed:", r.text)
        return
        
    login_data = r.json()
    token = login_data["access_token"]
    user_info = login_data["user"]
    print(f"Login successful! Rol: {user_info.get('rol')}, Nombre: {user_info.get('nombre')}")
    
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    # 2. Get user modules
    print("\n2. Fetching user modules via /permisos/me...")
    r = requests.get(f"{base_url}/permisos/me", headers=headers)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        modules = r.json().get("modulos", [])
        print(f"Modules returned: {len(modules)}")
        auditoria_mod = next((m for m in modules if m.get("Codigo") == "auditoria_comprobantes"), None)
        if auditoria_mod:
            print("Success: Module 'auditoria_comprobantes' is in user's module list!")
            print(f"  RutaHtml: {auditoria_mod.get('RutaHtml')}, Seccion: {auditoria_mod.get('Seccion')}")
        else:
            print("Warning: Module 'auditoria_comprobantes' NOT found in user's module list!")
            
    # 3. Get user companies
    print("\n3. Fetching user companies via /permisos/empresas/me...")
    r = requests.get(f"{base_url}/permisos/empresas/me", headers=headers)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        companies = r.json()
        print(f"Companies returned: {len(companies)}")
        for c in companies[:3]:
            print(f"  Cia: {c.get('codcia')} | Name: {c.get('nomcia')} | RUC: {c.get('ruccia')}")

    # 4. Fetch Ventas
    print("\n4. Fetching Ventas for Cia 007...")
    r = requests.get(f"{base_url}/auditoria-comprobantes/ventas?codcia=007&year=2026&month=05", headers=headers)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        ventas = r.json()
        print(f"Ventas count: {len(ventas)}")
        if len(ventas) > 0:
            first = ventas[0]
            print(f"  First Doc: {first.get('coddoc')} - {first.get('nrodoc')} | Client: {first.get('nomaux')} | Total: {first.get('imptot')}")
            
            # Get detail
            print("\n5. Fetching Detail for First Doc...")
            coddoc = first.get("coddoc")
            nrodoc = first.get("nrodoc")
            r_det = requests.get(f"{base_url}/auditoria-comprobantes/ventas/{coddoc}/{nrodoc}/detail?codcia=007", headers=headers)
            print(f"Detail Status: {r_det.status_code}")
            if r_det.status_code == 200:
                det = r_det.json()
                print("  Detail keys:", det.keys())
                print(f"  Detail items count: {len(det.get('items', []))}")
                if len(det.get('items', [])) > 0:
                    print(f"    First item description: {det.get('items')[0].get('desmat')}")

if __name__ == '__main__':
    main()
