from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

alters = [
    # CntFacturaCab - ampliar columnas propensas a truncamiento
    "ALTER TABLE CntFacturaCab ALTER COLUMN NomProveedor varchar(500)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN DetLeyenda varchar(1000)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN DetBienServicio varchar(500)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN MtoTotalLetras varchar(500)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN Observaciones varchar(2000)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN DirEmisor varchar(500)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN DirReceptor varchar(500)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN DirProveedor varchar(500)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN DirReceptorFactura varchar(500)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN NomComercialEmisor varchar(500)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN NomComercialProv varchar(500)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN DesMotivo varchar(1000)",
    "ALTER TABLE CntFacturaCab ALTER COLUMN DesTipoNota varchar(500)",
    # CntFacturaDet - ampliar descripcion
    "ALTER TABLE CntFacturaDet ALTER COLUMN Descripcion varchar(500)",
    "ALTER TABLE CntFacturaDet ALTER COLUMN CodMaterial varchar(50)",
]

for sql in alters:
    try:
        cursor.execute(sql)
        conn.commit()
        print(f"OK: {sql}")
    except Exception as e:
        print(f"SKIP: {sql} -> {e}")

conn.close()
print("Done!")
