import urllib.request
import json
import traceback

def test_endpoint(url):
    print(f"Testing: {url}")
    try:
        req = urllib.request.Request(url)
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        print(f"  OK. Empresa: {data.get('empresa', {}).get('nomcia')}")
        resultados = data.get('resultados', [])
        print(f"  Resultados count: {len(resultados)}")
        if resultados:
            print(f"  Sample first item keys: {list(resultados[0].keys())}")
    except urllib.error.HTTPError as e:
        print(f"  HTTPError: {e.code} - {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"  Exception: {e}")
        traceback.print_exc()
        
BASE = "http://localhost:8080/api/kardex"

test_endpoint(f"{BASE}/report?codcia=003&formato=12.1&start_date=2026-01-01&end_date=2026-01-31")
test_endpoint(f"{BASE}/stock?codcia=003&fecha_corte=2026-01-31")
test_endpoint(f"{BASE}/costo-ventas?codcia=003&start_date=2026-01-01&end_date=2026-01-31")
