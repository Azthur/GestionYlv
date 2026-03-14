import urllib.request
import json

req = urllib.request.Request("http://127.0.0.1:8000/api/conciliacion/movimientos-banco?codcia=005&bank_code=02")
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode())
    print(data[0])
