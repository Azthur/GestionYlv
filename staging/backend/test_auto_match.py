import requests
import json

url = "http://127.0.0.1:8000/api/conciliacion/auto-match"
payload = {
    "codcia": "005",
    "bank_code": "03",
    "period_year": "2025",
    "period_month": "12"
}
headers = {'Content-Type': 'application/json'}

try:
    response = requests.post(url, json=payload, headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
