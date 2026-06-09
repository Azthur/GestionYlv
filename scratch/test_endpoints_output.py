import sys
import os
import json

# Ensure backend module can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from logistics import get_purchase_order_report
from contabilidad import get_trazabilidad

def test_endpoints():
    print("=== TESTING get_purchase_order_report ===")
    try:
        res = get_purchase_order_report(nrodoc="00000193", codcia="007", tipo_oc="M", year="2026")
        print("Success! Return value:")
        print(json.dumps(res, indent=2))
    except Exception as e:
        print("Error calling get_purchase_order_report:", e)
        import traceback
        traceback.print_exc()

    print("\n=== TESTING get_trazabilidad ===")
    try:
        res = get_trazabilidad(nrodoc="00000193", codcia="007", tipo_oc="M", year="2026")
        print("Success! Return value:")
        print(json.dumps(res, indent=2))
    except Exception as e:
        print("Error calling get_trazabilidad:", e)
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    test_endpoints()
