import urllib.request
import urllib.error

try:
    req = urllib.request.Request("http://127.0.0.1:8000/api/conciliacion/match-details?match_id=1300")
    with urllib.request.urlopen(req) as response:
        print("STATUS:", response.status)
        print("TEXT:", response.read().decode())
except urllib.error.HTTPError as e:
    print("STATUS:", e.code)
    print("ERR:", e.read().decode())
