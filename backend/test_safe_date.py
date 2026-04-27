import sys
sys.path.insert(0,'/app/backend')
from contabilidad import _safe_date
print("safe_date('2026-04-27') =", _safe_date('2026-04-27'))
print("safe_date('27/04/2026') =", _safe_date('27/04/2026'))
print("safe_date('') =", _safe_date(''))
