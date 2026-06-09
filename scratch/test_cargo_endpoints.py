import urllib.request
import json

def test_ocs_disponibles():
    url = "http://localhost:8000/api/cargos/ocs-disponibles?codcia=007&ano=2026&mes=5&tipo_cargo=LOG_A_CONT&login=71941916JL&tipo_oc=ALL&only_my_records=false"
    print(f"Requesting {url}...")
    try:
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode())
            print(f"Success! Received {len(data)} OCs.")
            # Let's print some details about OC 00000193 if present
            found = False
            for oc in data:
                if oc.get('nrodoc') == '00000193':
                    found = True
                    print("Found OC 00000193 in ocs-disponibles:")
                    print(json.dumps(oc, indent=2))
            if not found:
                print("OC 00000193 not found in ocs-disponibles (maybe already processed).")
    except Exception as e:
        print("Error calling /ocs-disponibles:", e)

def test_pagos_pendientes():
    url = "http://localhost:8000/api/cargos/pagos/pendientes?codcia=007"
    print(f"\nRequesting {url}...")
    try:
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode())
            print(f"Success! Received {len(data)} pending payments.")
            # Let's print some details about OC 00000193 if present
            found = False
            for item in data:
                if item.get('NroOrdenCompra') == '00000193':
                    found = True
                    print("Found OC 00000193 in payments pending:")
                    print(json.dumps(item, indent=2))
            if not found:
                print("OC 00000193 not found in payments pending.")
    except Exception as e:
        print("Error calling /pagos/pendientes:", e)

if __name__ == '__main__':
    test_ocs_disponibles()
    test_pagos_pendientes()
