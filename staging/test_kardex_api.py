import os
import sys

# Append backend to path so we can import modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_kardex_report():
    print("Testing Kardex Report API...")
    
    # We will assume company '01'
    # Start date 2023-01-01, End Date 2026-12-31 to grab movements
    params = {
        "codcia": "01",
        "start_date": "2023-01-01",
        "end_date": "2026-12-31",
        "formato": "13.1"
    }
    
    response = client.get("/api/kardex/report", params=params)
    
    if response.status_code == 200:
        data = response.json()
        print(f"Success! Received {len(data)} materials with movements.")
        if len(data) > 0:
            mat = data[0]
            print(f"Sample Material: {mat['codmat']} - {mat['desmat']}")
            print(f"Initial Physical Balance: {mat['saldo_inicial_fisico']}")
            print(f"Movements: {len(mat['movimientos'])}")
            if len(mat['movimientos']) > 0:
                print(f"Sample Movement: {mat['movimientos'][0]}")
    else:
        print(f"Error {response.status_code}: {response.text}")

if __name__ == "__main__":
    test_kardex_report()
