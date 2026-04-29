"""
Script para crear las tablas del Módulo Contable en la BD BK030226.
Tablas: CntTokensEmpresa, CntCompras, CntFacturaCab, CntFacturaDet
"""
import pyodbc
from database import get_db_connection

creation_scripts = [
    # ─── 1. Tokens de API por empresa ───────────────────────
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CntTokensEmpresa' AND xtype='U')
    CREATE TABLE CntTokensEmpresa (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CodCia CHAR(3) NOT NULL,
        NomEmpresa VARCHAR(200) NOT NULL,
        NumRuc VARCHAR(11) NOT NULL,
        TokenMisCompras VARCHAR(100) NULL,
        TokenDatosCpe VARCHAR(100) NULL,
        TokenCorpo VARCHAR(100) NULL,
        Activo BIT DEFAULT 1,
        CreatedAt DATETIME DEFAULT GETDATE(),
        UpdatedAt DATETIME NULL,
        CreatedBy VARCHAR(50) NULL
    );
    """,

    # ─── 2. Compras sincronizadas desde SUNAT/API ──────────
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CntCompras' AND xtype='U')
    CREATE TABLE CntCompras (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CodCia CHAR(3) NOT NULL,
        NumRuc VARCHAR(11) NULL,
        NomRazonSocial VARCHAR(200) NULL,
        CodCar VARCHAR(50) NULL,
        CodTipoCDP VARCHAR(2) NULL,
        DesTipoCDP VARCHAR(50) NULL,
        NumSerieCDP VARCHAR(10) NULL,
        NumCDP VARCHAR(20) NULL,
        FecEmision DATE NULL,
        FecVencPag DATE NULL,
        CodTipoDocIdProveedor VARCHAR(2) NULL,
        NumDocIdProveedor VARCHAR(15) NULL,
        NomRazonSocialProveedor VARCHAR(200) NULL,
        CodTipoCarga VARCHAR(2) NULL,
        CodSituacion VARCHAR(2) NULL,
        CodMoneda VARCHAR(3) NULL,
        CodEstadoComprobante VARCHAR(2) NULL,
        DesEstadoComprobante VARCHAR(50) NULL,
        IndOperGratuita VARCHAR(5) NULL,
        CodTipoMotivoNota VARCHAR(5) NULL,
        DesTipoMotivoNota VARCHAR(100) NULL,
        PerTributario VARCHAR(6) NULL,
        PorTasaIGV DECIMAL(5,4) NULL,
        MtoBIGravadaDG DECIMAL(12,2) NULL,
        MtoIgvIpmDG DECIMAL(12,2) NULL,
        MtoBIGravadaDGNG DECIMAL(12,2) NULL,
        MtoIgvIpmDGNG DECIMAL(12,2) NULL,
        MtoBIGravadaDNG DECIMAL(12,2) NULL,
        MtoIgvIpmDNG DECIMAL(12,2) NULL,
        MtoValorAdqNG DECIMAL(12,2) NULL,
        MtoIcbp DECIMAL(12,2) NULL,
        MtoOtrosTrib DECIMAL(12,2) NULL,
        MtoTotalCp DECIMAL(12,2) NULL,
        MtoISC DECIMAL(12,2) NULL,
        MtoIMB DECIMAL(12,2) NULL,
        IndCargaTipoCambio VARCHAR(2) NULL,
        MtoCambioMonedaExtranjera DECIMAL(12,6) NULL,
        MtoCambioMonedaDolares DECIMAL(12,6) NULL,
        MtoTipoCambio DECIMAL(12,6) NULL,
        CodUsuRegisApi VARCHAR(100) NULL,
        FecRegisApi DATETIME NULL,
        CodUsuModifApi VARCHAR(100) NULL,
        FecModifApi DATETIME NULL,
        IdApiOrg VARCHAR(50) NULL,
        CodEstadoCpe VARCHAR(2) NULL,
        DesEstadoCpe VARCHAR(50) NULL,
        IndFuenteCP VARCHAR(5) NULL,
        NumCorrelativo INT NULL,
        IndIncluExcluCar INT NULL,
        SyncedAt DATETIME DEFAULT GETDATE(),
        SyncPeriodo VARCHAR(6) NULL,
        SyncPagina INT NULL
    );
    """,

    # ─── 3. Cabecera de Factura Registrada ──────────────────
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CntFacturaCab' AND xtype='U')
    CREATE TABLE CntFacturaCab (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CodCia CHAR(3) NOT NULL,
        NumRucProveedor VARCHAR(15) NULL,
        NomProveedor VARCHAR(200) NULL,
        CodTipoDoc VARCHAR(2) NULL,
        Serie VARCHAR(10) NULL,
        Numero VARCHAR(20) NULL,
        FecEmision DATE NULL,
        FecVencimiento DATE NULL,
        FecRegistro DATE NULL,
        CodMoneda VARCHAR(3) NULL,
        TipoCambio DECIMAL(12,6) NULL,
        SubTotal DECIMAL(12,2) NULL,
        IGV DECIMAL(12,2) NULL,
        OtrosTributos DECIMAL(12,2) NULL,
        Total DECIMAL(12,2) NULL,
        NroOrdenCompra VARCHAR(20) NULL,
        TipoOc VARCHAR(5) NULL,
        AnosOc VARCHAR(4) NULL,
        CodCiaOc CHAR(3) NULL,
        Estado VARCHAR(20) DEFAULT 'Registrada',
        Observaciones VARCHAR(500) NULL,
        ModoRegistro VARCHAR(10) NULL,
        IdCompraRef INT NULL,
        DirEmisor VARCHAR(300) NULL,
        UbigeoEmisor VARCHAR(100) NULL,
        DirReceptor VARCHAR(300) NULL,
        MtoTotalLetras VARCHAR(300) NULL,
        NomComercialEmisor VARCHAR(200) NULL,
        CreatedAt DATETIME DEFAULT GETDATE(),
        CreatedBy VARCHAR(50) NULL,
        UpdatedAt DATETIME NULL
    );
    """,

    # ─── 4. Detalle de Factura Registrada ───────────────────
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CntFacturaDet' AND xtype='U')
    CREATE TABLE CntFacturaDet (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        FacturaCabId INT NOT NULL,
        NroItem INT NULL,
        CodMaterial VARCHAR(20) NULL,
        Descripcion VARCHAR(300) NULL,
        UnidadMedida VARCHAR(10) NULL,
        Cantidad DECIMAL(12,4) NULL,
        PrecioUnitario DECIMAL(12,4) NULL,
        Descuento DECIMAL(12,2) DEFAULT 0,
        SubTotal DECIMAL(12,2) NULL,
        IGV DECIMAL(12,2) NULL,
        ICBPER DECIMAL(12,2) DEFAULT 0,
        Total DECIMAL(12,2) NULL,
        CantidadOC DECIMAL(12,4) NULL,
        CantidadAlmacen DECIMAL(12,4) NULL,
        CONSTRAINT FK_CntFacturaDet_Cab FOREIGN KEY (FacturaCabId) REFERENCES CntFacturaCab(Id) ON DELETE CASCADE
    );
    """,

    # ─── Índices para búsquedas frecuentes ──────────────────
    """
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_CntCompras_CodCia_Periodo')
    CREATE INDEX IX_CntCompras_CodCia_Periodo ON CntCompras (CodCia, PerTributario);
    """,
    """
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_CntCompras_IdApiOrg')
    CREATE INDEX IX_CntCompras_IdApiOrg ON CntCompras (IdApiOrg);
    """,
    """
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_CntFacturaCab_CodCia')
    CREATE INDEX IX_CntFacturaCab_CodCia ON CntFacturaCab (CodCia, FecEmision);
    """,
    """
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_CntFacturaCab_OC')
    CREATE INDEX IX_CntFacturaCab_OC ON CntFacturaCab (NroOrdenCompra, CodCiaOc);
    """,
    """
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_CntFacturaDet_CabId')
    CREATE INDEX IX_CntFacturaDet_CabId ON CntFacturaDet (FacturaCabId);
    """,

    # ─── 5. ALTER: Añadir UUID a cabecera (idempotente) ─────
    """
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CntFacturaCab') AND name = 'Uuid')
    ALTER TABLE CntFacturaCab ADD Uuid VARCHAR(50) NULL;
    """,
    """
    SET ARITHABORT ON;
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_CntFacturaCab_Uuid')
    CREATE UNIQUE INDEX IX_CntFacturaCab_Uuid ON CntFacturaCab (Uuid) WHERE Uuid IS NOT NULL;
    """,

    # ─── 6. Tabla de Archivos Adjuntos ──────────────────────
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CntFacturaArchivos' AND xtype='U')
    CREATE TABLE CntFacturaArchivos (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        FacturaCabId INT NOT NULL,
        NombreArchivo VARCHAR(300) NOT NULL,
        RutaArchivo VARCHAR(500) NOT NULL,
        TipoDocumento VARCHAR(50) NULL,
        TamanioBytes BIGINT NULL,
        CreatedAt DATETIME DEFAULT GETDATE(),
        CreatedBy VARCHAR(50) NULL,
        CONSTRAINT FK_CntFacturaArchivos_Cab FOREIGN KEY (FacturaCabId) REFERENCES CntFacturaCab(Id) ON DELETE CASCADE
    );
    """,

    # ─── 7. ALTER: Campos contables completos ───────────────
    """
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CntFacturaCab') AND name = 'MtoGravado')
    BEGIN
        ALTER TABLE CntFacturaCab ADD MtoGravado DECIMAL(12,2) NULL;
        ALTER TABLE CntFacturaCab ADD MtoExonerado DECIMAL(12,2) NULL;
        ALTER TABLE CntFacturaCab ADD MtoInafecto DECIMAL(12,2) NULL;
        ALTER TABLE CntFacturaCab ADD MtoGratuito DECIMAL(12,2) NULL;
        ALTER TABLE CntFacturaCab ADD MtoAnticipos DECIMAL(12,2) NULL;
        ALTER TABLE CntFacturaCab ADD MtoISC DECIMAL(12,2) NULL;
        ALTER TABLE CntFacturaCab ADD MtoICBPER DECIMAL(12,2) NULL;
        ALTER TABLE CntFacturaCab ADD MtoOtrosCargos DECIMAL(12,2) NULL;
    END
    """,

    # ─── 8. ALTER: Detracción ───────────────────────────────
    """
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CntFacturaCab') AND name = 'DetLeyenda')
    BEGIN
        ALTER TABLE CntFacturaCab ADD DetLeyenda VARCHAR(200) NULL;
        ALTER TABLE CntFacturaCab ADD DetBienServicio VARCHAR(200) NULL;
        ALTER TABLE CntFacturaCab ADD DetMedioPago VARCHAR(100) NULL;
        ALTER TABLE CntFacturaCab ADD DetNroCuenta VARCHAR(50) NULL;
        ALTER TABLE CntFacturaCab ADD DetPorcentaje DECIMAL(5,2) NULL;
        ALTER TABLE CntFacturaCab ADD DetMonto DECIMAL(12,2) NULL;
    END
    """,

    # ─── 9. Cabecera de Cargos Documentales ────────────────
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CntCargosDocumentales' AND xtype='U')
    CREATE TABLE CntCargosDocumentales (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CodCia CHAR(3) NOT NULL,
        NroCargo VARCHAR(20) NOT NULL,
        TipoCargo VARCHAR(30) NOT NULL,
        FechaCargo DATETIME DEFAULT GETDATE(),
        UsuarioOrigen VARCHAR(50) NULL,
        AreaOrigen VARCHAR(30) NULL,
        UsuarioDestino VARCHAR(50) NULL,
        AreaDestino VARCHAR(30) NULL,
        Estado VARCHAR(20) DEFAULT 'PENDIENTE',
        FechaRecepcion DATETIME NULL,
        Observaciones VARCHAR(500) NULL,
        CreatedAt DATETIME DEFAULT GETDATE()
    );
    """,

    # ─── 10. Detalle de Cargos Documentales ────────────────
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CntCargosDetalle' AND xtype='U')
    CREATE TABLE CntCargosDetalle (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CargoId INT NOT NULL,
        NroOrdenCompra VARCHAR(20) NULL,
        TipoOc VARCHAR(5) NULL,
        CodCiaOc CHAR(3) NULL,
        AnosOc VARCHAR(4) NULL,
        NroFactura VARCHAR(30) NULL,
        MontoOC DECIMAL(12,2) NULL,
        MontoFactura DECIMAL(12,2) NULL,
        Proveedor VARCHAR(200) NULL,
        RucProveedor VARCHAR(15) NULL,
        EstadoContable VARCHAR(20) DEFAULT 'PENDIENTE',
        TipoDocumento VARCHAR(10) NULL,
        TipoComprobante VARCHAR(20) NULL,
        FechaEmision DATE NULL,
        FechaVencimiento DATE NULL,
        MontoRendicion DECIMAL(12,2) NULL,
        Moneda CHAR(3) NULL,
        CONSTRAINT FK_CntCargosDetalle_Cab FOREIGN KEY (CargoId) REFERENCES CntCargosDocumentales(Id) ON DELETE CASCADE
    );
    """,
    # Agregar columnas si no existen (para tablas existentes)
    """
    IF EXISTS (SELECT * FROM sysobjects WHERE name='CntCargosDetalle' AND xtype='U')
    BEGIN
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='TipoDocumento' AND object_id = OBJECT_ID('CntCargosDetalle'))
            ALTER TABLE CntCargosDetalle ADD TipoDocumento VARCHAR(10) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='TipoComprobante' AND object_id = OBJECT_ID('CntCargosDetalle'))
            ALTER TABLE CntCargosDetalle ADD TipoComprobante VARCHAR(20) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='FechaEmision' AND object_id = OBJECT_ID('CntCargosDetalle'))
            ALTER TABLE CntCargosDetalle ADD FechaEmision DATE NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='FechaVencimiento' AND object_id = OBJECT_ID('CntCargosDetalle'))
            ALTER TABLE CntCargosDetalle ADD FechaVencimiento DATE NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='MontoRendicion' AND object_id = OBJECT_ID('CntCargosDetalle'))
            ALTER TABLE CntCargosDetalle ADD MontoRendicion DECIMAL(12,2) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='Moneda' AND object_id = OBJECT_ID('CntCargosDetalle'))
            ALTER TABLE CntCargosDetalle ADD Moneda CHAR(3) NULL;
    END
    """,

    # ─── 11. Tabla de Pagos Tesorería ─────────────────────────
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FinPagos' AND xtype='U')
    CREATE TABLE FinPagos (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CodCia VARCHAR(50) NOT NULL,
        NroOrdenCompra VARCHAR(50) NOT NULL,
        DetalleId INT NOT NULL,
        MontoPago DECIMAL(18,2) NOT NULL,
        FechaPago DATE NOT NULL,
        BancoPago VARCHAR(100),
        Moneda CHAR(3) DEFAULT '1',
        TipoPago VARCHAR(50),
        NroOperacion VARCHAR(50),
        Notas TEXT,
        UsuarioRegistro VARCHAR(100),
        FechaRegistro DATETIME DEFAULT GETDATE(),
        TipoDocumento VARCHAR(20) NULL,
        Estado VARCHAR(20) DEFAULT 'ACTIVO'
    );
    """,
    """
    IF EXISTS (SELECT * FROM sysobjects WHERE name='FinPagos' AND xtype='U')
    BEGIN
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='RucProveedor' AND object_id = OBJECT_ID('FinPagos'))
            ALTER TABLE FinPagos ADD RucProveedor VARCHAR(15) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='Proveedor' AND object_id = OBJECT_ID('FinPagos'))
            ALTER TABLE FinPagos ADD Proveedor VARCHAR(200) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='TipoComprobante' AND object_id = OBJECT_ID('FinPagos'))
            ALTER TABLE FinPagos ADD TipoComprobante VARCHAR(2) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='FechaEmision' AND object_id = OBJECT_ID('FinPagos'))
            ALTER TABLE FinPagos ADD FechaEmision DATE NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='Serie' AND object_id = OBJECT_ID('FinPagos'))
            ALTER TABLE FinPagos ADD Serie VARCHAR(10) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='Numero' AND object_id = OBJECT_ID('FinPagos'))
            ALTER TABLE FinPagos ADD Numero VARCHAR(20) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='NroFactura' AND object_id = OBJECT_ID('FinPagos'))
            ALTER TABLE FinPagos ADD NroFactura VARCHAR(30) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='Uuid' AND object_id = OBJECT_ID('FinPagos'))
            ALTER TABLE FinPagos ADD Uuid VARCHAR(50) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='TipoOc' AND object_id = OBJECT_ID('FinPagos'))
            ALTER TABLE FinPagos ADD TipoOc VARCHAR(5) NULL;
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='ConceptoPago' AND object_id = OBJECT_ID('FinPagos'))
            ALTER TABLE FinPagos ADD ConceptoPago VARCHAR(100) NULL;
    END
    """,

    # ─── 12. Tabla de Adjuntos de Pagos ─────────────────────
    """
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='FinPagosAdjuntos' AND xtype='U')
    CREATE TABLE FinPagosAdjuntos (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        PagoId INT NOT NULL,
        ArchivoNombre VARCHAR(255) NOT NULL,
        ArchivoRuta VARCHAR(500) NOT NULL,
        TipoMime VARCHAR(100),
        TamanoBytes BIGINT,
        FechaCarga DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_FinPagosAdjuntos_Pago FOREIGN KEY (PagoId) REFERENCES FinPagos(Id) ON DELETE CASCADE
    );
    """,

    # ─── 13. Índices para cargos ───────────────────────────
    """
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_CntCargos_CodCia')
    CREATE INDEX IX_CntCargos_CodCia ON CntCargosDocumentales (CodCia, Estado);
    """
]


def setup_contabilidad():
    conn = get_db_connection()
    if not conn:
        print("[ERROR] No se pudo conectar a la base de datos.")
        return False

    try:
        cursor = conn.cursor()
        for i, script in enumerate(creation_scripts):
            cursor.execute(script)
            conn.commit()
            print(f"  [OK] Script {i+1}/{len(creation_scripts)} ejecutado.")

        print("\n[SUCCESS] Tablas del Modulo Contable creadas exitosamente:")
        print("   - CntTokensEmpresa")
        print("   - CntCompras")
        print("   - CntFacturaCab")
        print("   - CntFacturaDet")
        print("   - CntFacturaArchivos")
        print("   - CntCargosDocumentales")
        print("   - CntCargosDetalle (con columnas extendidas)")
        print("   - FinPagos")
        print("   - FinPagosAdjuntos")
        print("   - Índices de búsqueda creados")
        return True

    except Exception as e:
        print(f"[ERROR] Error al crear tablas: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()


if __name__ == "__main__":
    setup_contabilidad()
