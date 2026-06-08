import requests

def main():
    base_url = "http://localhost:8000/api/auditoria-comprobantes"
    
    print("Testing Ventas Detail Endpoint...")
    try:
        r = requests.get(f"{base_url}/ventas/FACT/Y410005056/detail?codcia=007")
        print(f"Status Code: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print("Keys in response:", data.keys())
            h = data.get("header", {})
            items = data.get("items", [])
            print(f"Header Client: {h.get('nomaux')}, Total: {h.get('imptot')}")
            print(f"Items count: {len(items)}")
            if len(items) > 0:
                print("First item:", items[0].get("desmat"))
        else:
            print("Error details:", r.text)
    except Exception as e:
        print("Ventas detail test failed:", e)

    print("\nTesting Guías Detail Endpoint...")
    try:
        r = requests.get(f"{base_url}/guias/Y410010980/detail?codcia=007")
        print(f"Status Code: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print("Keys in response:", data.keys())
            h = data.get("header", {})
            items = data.get("items", [])
            print(f"Header Client: {h.get('nomaux')}, Transportista: {h.get('nomtra')}")
            print(f"Items count: {len(items)}")
            if len(items) > 0:
                print("First item:", items[0].get("desmat"))
        else:
            print("Error details:", r.text)
    except Exception as e:
        print("Guías detail test failed:", e)

if __name__ == '__main__':
    main()
