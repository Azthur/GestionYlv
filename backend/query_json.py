import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from backend.conciliacion import get_cobranza_detalles

def main():
    import json
    res = get_cobranza_detalles(codcia='001', coddoc='CJ01', nrodoc='0000000253')
    print(json.dumps(res, indent=2))

if __name__ == '__main__':
    main()
