import urllib.request
import urllib.error

try:
    req = urllib.request.Request("http://127.0.0.1:8000/api/conciliacion/movimientos-banco/all?codcia=005&bank_code=02", method="DELETE")
    with urllib.request.urlopen(req) as response:
        print("STATUS:", response.status)
        print("TEXT:", response.read().decode())
except urllib.error.HTTPError as e:
    print("STATUS:", e.code)
    print("ERR:", e.read().decode())
