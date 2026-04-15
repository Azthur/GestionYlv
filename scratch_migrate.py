import sys, os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
import database

conn = database.get_db_connection()
cursor = conn.cursor()

alterations = [
    # === CntFacturaCab: Datos adicionales Emisor ===
    "IF COL_LENGTH('CntFacturaCab','NomComercialProv') IS NULL ALTER TABLE CntFacturaCab ADD NomComercialProv varchar(200)",
    "IF COL_LENGTH('CntFacturaCab','DirProveedor') IS NULL ALTER TABLE CntFacturaCab ADD DirProveedor varchar(300)",
    "IF COL_LENGTH('CntFacturaCab','UbigeoProveedor') IS NULL ALTER TABLE CntFacturaCab ADD UbigeoProveedor varchar(100)",
    
    # === CntFacturaCab: Datos Receptor ===
    "IF COL_LENGTH('CntFacturaCab','DirReceptorFactura') IS NULL ALTER TABLE CntFacturaCab ADD DirReceptorFactura varchar(300)",
    
    # === CntFacturaCab: Campos CPE adicionales ===
    "IF COL_LENGTH('CntFacturaCab','CodTipTransaccion') IS NULL ALTER TABLE CntFacturaCab ADD CodTipTransaccion varchar(5)",
    "IF COL_LENGTH('CntFacturaCab','IndEstadoCpe') IS NULL ALTER TABLE CntFacturaCab ADD IndEstadoCpe varchar(5)",
    "IF COL_LENGTH('CntFacturaCab','IndProcedencia') IS NULL ALTER TABLE CntFacturaCab ADD IndProcedencia varchar(5)",
    "IF COL_LENGTH('CntFacturaCab','PlacaVehicular') IS NULL ALTER TABLE CntFacturaCab ADD PlacaVehicular varchar(20)",
    
    # === CntFacturaCab: Procedencia contable completa ===
    "IF COL_LENGTH('CntFacturaCab','MtoExportacion') IS NULL ALTER TABLE CntFacturaCab ADD MtoExportacion decimal(18,2)",
    "IF COL_LENGTH('CntFacturaCab','MtoDescuentos') IS NULL ALTER TABLE CntFacturaCab ADD MtoDescuentos decimal(18,2)",
    "IF COL_LENGTH('CntFacturaCab','MtoRedondeo') IS NULL ALTER TABLE CntFacturaCab ADD MtoRedondeo decimal(18,4)",
    
    # === CntFacturaCab: Nota de Crédito / Débito ===
    "IF COL_LENGTH('CntFacturaCab','CodTipoNota') IS NULL ALTER TABLE CntFacturaCab ADD CodTipoNota varchar(5)",
    "IF COL_LENGTH('CntFacturaCab','DesTipoNota') IS NULL ALTER TABLE CntFacturaCab ADD DesTipoNota varchar(100)",
    "IF COL_LENGTH('CntFacturaCab','DesMotivo') IS NULL ALTER TABLE CntFacturaCab ADD DesMotivo varchar(500)",
    "IF COL_LENGTH('CntFacturaCab','DocModificaSerie') IS NULL ALTER TABLE CntFacturaCab ADD DocModificaSerie varchar(10)",
    "IF COL_LENGTH('CntFacturaCab','DocModificaNumero') IS NULL ALTER TABLE CntFacturaCab ADD DocModificaNumero varchar(20)",
    "IF COL_LENGTH('CntFacturaCab','DocModificaTipo') IS NULL ALTER TABLE CntFacturaCab ADD DocModificaTipo varchar(5)",
    
    # === CntFacturaCab: Créditos / Cuotas ===
    "IF COL_LENGTH('CntFacturaCab','CreditoMtoPendiente') IS NULL ALTER TABLE CntFacturaCab ADD CreditoMtoPendiente decimal(18,2)",
    "IF COL_LENGTH('CntFacturaCab','CreditoFecPlazo') IS NULL ALTER TABLE CntFacturaCab ADD CreditoFecPlazo date",
    "IF COL_LENGTH('CntFacturaCab','CreditoNumCuotas') IS NULL ALTER TABLE CntFacturaCab ADD CreditoNumCuotas int",
    "IF COL_LENGTH('CntFacturaCab','CreditoCuotasJson') IS NULL ALTER TABLE CntFacturaCab ADD CreditoCuotasJson varchar(MAX)",
    
    # === CntFacturaCab: Documentos Relacionados ===
    "IF COL_LENGTH('CntFacturaCab','DocsRelacionadosJson') IS NULL ALTER TABLE CntFacturaCab ADD DocsRelacionadosJson varchar(MAX)",
    
    # === CntFacturaCab: XML Completo para auditoría ===
    "IF COL_LENGTH('CntFacturaCab','XmlDataJson') IS NULL ALTER TABLE CntFacturaCab ADD XmlDataJson varchar(MAX)",
    
    # === CntFacturaDet: Columnas nuevas ===
    "IF COL_LENGTH('CntFacturaDet','CodProveedor') IS NULL ALTER TABLE CntFacturaDet ADD CodProveedor varchar(50)",
    "IF COL_LENGTH('CntFacturaDet','DesUnidadMedida') IS NULL ALTER TABLE CntFacturaDet ADD DesUnidadMedida varchar(50)",
    "IF COL_LENGTH('CntFacturaDet','MtoICBPERItem') IS NULL ALTER TABLE CntFacturaDet ADD MtoICBPERItem decimal(18,4)",
    "IF COL_LENGTH('CntFacturaDet','MtoDescuento') IS NULL ALTER TABLE CntFacturaDet ADD MtoDescuento decimal(18,4)",
]

success = 0
errors = 0
for sql in alterations:
    try:
        cursor.execute(sql)
        conn.commit()
        col_name = sql.split('ADD ')[-1].split(' ')[0] if 'ADD' in sql else '?'
        print(f"  OK: {col_name}")
        success += 1
    except Exception as e:
        print(f"  ERR: {e}")
        errors += 1

print(f"\nResultado: {success} columnas creadas, {errors} errores")
conn.close()
