import requests

# login to get token
login_url = "http://localhost:8000/api/auth/login"
res = requests.post(login_url, json={"username": "71941916JL", "password": "1996"})
token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Test sales detail for N/A
detail_url = "http://localhost:8000/api/auditoria-comprobantes/ventas/detail?codcia=007&coddoc=N/A&nrodoc=B310000010"
res_detail = requests.get(detail_url, headers=headers)
print("Detail Status:", res_detail.status_code)
if res_detail.status_code == 200:
    print("Success! Details returned:")
    print(res_detail.json().keys())
    print("Header:", res_detail.json()["header"])
else:
    print("Failed! Response:", res_detail.text)
