import requests

# login to get token
login_url = "http://localhost:8000/api/auth/login"
res = requests.post(login_url, json={"username": "71941916JL", "password": "1996"})
token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Test Accounts Receivable report
url = "http://localhost:8000/api/cuentas-cobrar/report?codcia=007&fecha_inicio=2015-01-01&fecha_fin=2026-06-04"
res_ar = requests.get(url, headers=headers)
print("Report Status:", res_ar.status_code)
if res_ar.status_code == 200:
    data = res_ar.json()["data"]
    print("Total rows:", len(data))
    
    # Filter for N/A
    na_rows = [r for r in data if r["coddoc"] == "N/A"]
    print("N/A rows found:", len(na_rows))
    if na_rows:
        print("Sample N/A row:")
        print(na_rows[0])
        # Check if saldo is negative
        negatives = [r for r in na_rows if r["saldo"] < 0]
        print("N/A rows with negative balances:", len(negatives))
else:
    print("Failed! Response:", res_ar.text)
