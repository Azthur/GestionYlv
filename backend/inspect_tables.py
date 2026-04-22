import sys, os
sys.path.append(os.path.dirname(__file__))
os.chdir(os.path.dirname(__file__))
from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

print("=== CmpVOcom COLUMNS ===")
cursor.execute("SELECT TOP 1 * FROM CmpVOcom")
for d in cursor.description:
    print(f"  {d[0]:20s} type={d[1].__name__ if hasattr(d[1],'__name__') else d[1]}")

print("\n=== CmpVOcom SAMPLE (flgest, digita, usuario) ===")
cursor.execute("SELECT TOP 5 RTRIM(NroDoc) nrodoc, RTRIM(FlgEst) flgest, RTRIM(Digita) digita, RTRIM(Usuario) usuario, RTRIM(TipoOc) tipooc, RTRIM(Anos) anos FROM CmpVOcom ORDER BY NroDoc DESC")
for r in cursor.fetchall():
    print(f"  OC={r.nrodoc} flgest={r.flgest} digita={r.digita} usuario={r.usuario} tipo={r.tipooc} anos={r.anos}")

print("\n=== AlmRMovm COLUMNS ===")
cursor.execute("SELECT TOP 1 * FROM AlmRMovm")
for d in cursor.description:
    print(f"  {d[0]:20s}")

print("\n=== AlmRMovm SAMPLE (flgest) ===")
cursor.execute("SELECT TOP 5 RTRIM(CodCia) codcia, RTRIM(Almcen) almcen, RTRIM(TipMov) tipmov, RTRIM(CodMov) codmov, RTRIM(NroDoc) nrodoc, RTRIM(FlgEst) flgest, RTRIM(ordcmp) ordcmp FROM AlmRMovm ORDER BY NroDoc DESC")
for r in cursor.fetchall():
    print(f"  cia={r.codcia} alm={r.almcen} tip={r.tipmov} cod={r.codmov} doc={r.nrodoc} flg={r.flgest} ordcmp={r.ordcmp}")

print("\n=== WebFacturas or Facturas table? ===")
try:
    cursor.execute("SELECT TOP 1 * FROM WebFacturas")
    for d in cursor.description:
        print(f"  {d[0]:20s}")
except:
    print("  WebFacturas not found")

try:
    cursor.execute("SELECT TOP 1 * FROM RegistroFacturas")
    for d in cursor.description:
        print(f"  {d[0]:20s}")
except:
    print("  RegistroFacturas not found")

# Check if there's a LogOcAcciones or similar tracking table
print("\n=== Check existing tracking tables ===")
for t in ['LogOcAcciones', 'LogOcAprobaciones', 'WebOcEstados', 'LogSolicitudesRecojo']:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {t}")
        cnt = cursor.fetchone()[0]
        print(f"  {t}: EXISTS ({cnt} rows)")
        cursor.execute(f"SELECT TOP 1 * FROM {t}")
        cols = [d[0] for d in cursor.description]
        print(f"    cols: {', '.join(cols)}")
    except:
        print(f"  {t}: NOT EXISTS")

conn.close()
