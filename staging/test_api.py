import requests

response = requests.get('http://127.0.0.1:8000/api/conciliacion/cobranzas-todas?year=2026&month=03')
print("Status Code:", response.status_code)
print("Response JSON:")
print(response.json())
