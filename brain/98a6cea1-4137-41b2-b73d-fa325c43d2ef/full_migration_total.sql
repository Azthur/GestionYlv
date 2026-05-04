-- SCRIPT DE MIGRACIÓN TOTAL 2026
-- Base de Datos: yelave22

-- TABLA: CntCargosDetalle
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CntCargosDetalle]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CntCargosDetalle](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [CargoId] [int] NOT NULL,
        [NroOrdenCompra] [varchar](30) NULL,
        [TipoOc] [varchar](5) NULL,
        [CodCiaOc] [char](3) NULL,
        [AnosOc] [varchar](4) NULL,
        [NroFactura] [varchar](30) NULL,
        [MontoOC] [decimal](12, 2) NULL,
        [MontoFactura] [decimal](12, 2) NULL,
        [Proveedor] [varchar](200) NULL,
        [RucProveedor] [varchar](15) NULL,
        [EstadoContable] [varchar](20) NULL DEFAULT ('PENDIENTE'),
        [ObservacionRechazo] [varchar](max) NULL,
        [TipoDocumento] [varchar](20) NULL,
        [TipoComprobante] [varchar](20) NULL,
        [FechaEmision] [date] NULL,
        [FechaVencimiento] [date] NULL,
        [MontoRendicion] [decimal](12, 2) NULL,
        [Moneda] [char](3) NULL,
        CONSTRAINT [PK_CntCargosDetalle] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: CntCargosDocumentales
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CntCargosDocumentales]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CntCargosDocumentales](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [CodCia] [char](3) NOT NULL,
        [NroCargo] [varchar](20) NOT NULL,
        [TipoCargo] [varchar](30) NOT NULL,
        [FechaCargo] [datetime] NULL DEFAULT (getdate()),
        [UsuarioOrigen] [varchar](50) NULL,
        [AreaOrigen] [varchar](30) NULL,
        [UsuarioDestino] [varchar](50) NULL,
        [AreaDestino] [varchar](30) NULL,
        [Estado] [varchar](20) NULL DEFAULT ('PENDIENTE'),
        [FechaRecepcion] [datetime] NULL,
        [Observaciones] [varchar](500) NULL,
        [CreatedAt] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_CntCargosDocumentales] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: CntCompras
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CntCompras]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CntCompras](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [CodCia] [char](3) NOT NULL,
        [NumRuc] [varchar](11) NULL,
        [NomRazonSocial] [varchar](200) NULL,
        [CodCar] [varchar](50) NULL,
        [CodTipoCDP] [varchar](2) NULL,
        [DesTipoCDP] [varchar](50) NULL,
        [NumSerieCDP] [varchar](10) NULL,
        [NumCDP] [varchar](20) NULL,
        [FecEmision] [date] NULL,
        [FecVencPag] [date] NULL,
        [CodTipoDocIdProveedor] [varchar](2) NULL,
        [NumDocIdProveedor] [varchar](15) NULL,
        [NomRazonSocialProveedor] [varchar](200) NULL,
        [CodTipoCarga] [varchar](2) NULL,
        [CodSituacion] [varchar](2) NULL,
        [CodMoneda] [varchar](3) NULL,
        [CodEstadoComprobante] [varchar](2) NULL,
        [DesEstadoComprobante] [varchar](50) NULL,
        [IndOperGratuita] [varchar](5) NULL,
        [CodTipoMotivoNota] [varchar](5) NULL,
        [DesTipoMotivoNota] [varchar](100) NULL,
        [PerTributario] [varchar](6) NULL,
        [PorTasaIGV] [decimal](5, 4) NULL,
        [MtoBIGravadaDG] [decimal](12, 2) NULL,
        [MtoIgvIpmDG] [decimal](12, 2) NULL,
        [MtoBIGravadaDGNG] [decimal](12, 2) NULL,
        [MtoIgvIpmDGNG] [decimal](12, 2) NULL,
        [MtoBIGravadaDNG] [decimal](12, 2) NULL,
        [MtoIgvIpmDNG] [decimal](12, 2) NULL,
        [MtoValorAdqNG] [decimal](12, 2) NULL,
        [MtoIcbp] [decimal](12, 2) NULL,
        [MtoOtrosTrib] [decimal](12, 2) NULL,
        [MtoTotalCp] [decimal](12, 2) NULL,
        [MtoISC] [decimal](12, 2) NULL,
        [MtoIMB] [decimal](12, 2) NULL,
        [IndCargaTipoCambio] [varchar](2) NULL,
        [MtoCambioMonedaExtranjera] [decimal](12, 6) NULL,
        [MtoCambioMonedaDolares] [decimal](12, 6) NULL,
        [MtoTipoCambio] [decimal](12, 6) NULL,
        [CodUsuRegisApi] [varchar](100) NULL,
        [FecRegisApi] [datetime] NULL,
        [CodUsuModifApi] [varchar](100) NULL,
        [FecModifApi] [datetime] NULL,
        [IdApiOrg] [varchar](50) NULL,
        [CodEstadoCpe] [varchar](2) NULL,
        [DesEstadoCpe] [varchar](50) NULL,
        [IndFuenteCP] [varchar](5) NULL,
        [NumCorrelativo] [int] NULL,
        [IndIncluExcluCar] [int] NULL,
        [SyncedAt] [datetime] NULL DEFAULT (getdate()),
        [SyncPeriodo] [varchar](6) NULL,
        [SyncPagina] [int] NULL,
        [XmlDataJson] [varchar](max) NULL,
        CONSTRAINT [PK_CntCompras] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: CntFacturaArchivos
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CntFacturaArchivos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CntFacturaArchivos](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [FacturaCabId] [int] NOT NULL,
        [NombreArchivo] [varchar](300) NOT NULL,
        [RutaArchivo] [varchar](500) NOT NULL,
        [TipoDocumento] [varchar](50) NULL,
        [TamanioBytes] [bigint] NULL,
        [CreatedAt] [datetime] NULL DEFAULT (getdate()),
        [CreatedBy] [varchar](50) NULL,
        CONSTRAINT [PK_CntFacturaArchivos] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: CntFacturaCab
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CntFacturaCab]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CntFacturaCab](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [CodCia] [char](3) NOT NULL,
        [NumRucProveedor] [varchar](15) NULL,
        [NomProveedor] [varchar](500) NULL,
        [CodTipoDoc] [varchar](2) NULL,
        [Serie] [varchar](10) NULL,
        [Numero] [varchar](20) NULL,
        [FecEmision] [date] NULL,
        [FecVencimiento] [date] NULL,
        [FecRegistro] [date] NULL,
        [CodMoneda] [varchar](3) NULL,
        [TipoCambio] [decimal](12, 6) NULL,
        [SubTotal] [decimal](12, 2) NULL,
        [IGV] [decimal](12, 2) NULL,
        [OtrosTributos] [decimal](12, 2) NULL,
        [Total] [decimal](12, 2) NULL,
        [NroOrdenCompra] [varchar](20) NULL,
        [TipoOc] [varchar](5) NULL,
        [AnosOc] [varchar](4) NULL,
        [CodCiaOc] [char](3) NULL,
        [Estado] [varchar](20) NULL DEFAULT ('Registrada'),
        [Observaciones] [varchar](2000) NULL,
        [ModoRegistro] [varchar](10) NULL,
        [IdCompraRef] [int] NULL,
        [DirEmisor] [varchar](500) NULL,
        [UbigeoEmisor] [varchar](100) NULL,
        [DirReceptor] [varchar](500) NULL,
        [MtoTotalLetras] [varchar](500) NULL,
        [NomComercialEmisor] [varchar](500) NULL,
        [CreatedAt] [datetime] NULL DEFAULT (getdate()),
        [CreatedBy] [varchar](50) NULL,
        [UpdatedAt] [datetime] NULL,
        [Uuid] [varchar](50) NULL,
        [MtoGravado] [decimal](12, 2) NULL,
        [MtoExonerado] [decimal](12, 2) NULL,
        [MtoInafecto] [decimal](12, 2) NULL,
        [MtoGratuito] [decimal](12, 2) NULL,
        [MtoAnticipos] [decimal](12, 2) NULL,
        [MtoISC] [decimal](12, 2) NULL,
        [MtoICBPER] [decimal](12, 2) NULL,
        [MtoOtrosCargos] [decimal](12, 2) NULL,
        [DetLeyenda] [varchar](1000) NULL,
        [DetBienServicio] [varchar](500) NULL,
        [DetMedioPago] [varchar](100) NULL,
        [DetNroCuenta] [varchar](50) NULL,
        [DetPorcentaje] [decimal](5, 2) NULL,
        [DetMonto] [decimal](12, 2) NULL,
        [NomComercialProv] [varchar](500) NULL,
        [DirProveedor] [varchar](500) NULL,
        [UbigeoProveedor] [varchar](100) NULL,
        [DirReceptorFactura] [varchar](500) NULL,
        [CodTipTransaccion] [varchar](5) NULL,
        [IndEstadoCpe] [varchar](5) NULL,
        [IndProcedencia] [varchar](5) NULL,
        [PlacaVehicular] [varchar](20) NULL,
        [MtoExportacion] [decimal](18, 2) NULL,
        [MtoDescuentos] [decimal](18, 2) NULL,
        [MtoRedondeo] [decimal](18, 4) NULL,
        [CodTipoNota] [varchar](5) NULL,
        [DesTipoNota] [varchar](500) NULL,
        [DesMotivo] [varchar](1000) NULL,
        [DocModificaSerie] [varchar](10) NULL,
        [DocModificaNumero] [varchar](20) NULL,
        [DocModificaTipo] [varchar](5) NULL,
        [CreditoMtoPendiente] [decimal](18, 2) NULL,
        [CreditoFecPlazo] [date] NULL,
        [CreditoNumCuotas] [int] NULL,
        [CreditoCuotasJson] [varchar](max) NULL,
        [DocsRelacionadosJson] [varchar](max) NULL,
        [XmlDataJson] [varchar](max) NULL,
        [DocModificaFecha] [varchar](20) NULL,
        CONSTRAINT [PK_CntFacturaCab] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: CntFacturaDet
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CntFacturaDet]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CntFacturaDet](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [FacturaCabId] [int] NOT NULL,
        [NroItem] [int] NULL,
        [CodMaterial] [varchar](50) NULL,
        [Descripcion] [varchar](500) NULL,
        [UnidadMedida] [varchar](10) NULL,
        [Cantidad] [decimal](12, 4) NULL,
        [PrecioUnitario] [decimal](12, 4) NULL,
        [Descuento] [decimal](12, 2) NULL DEFAULT ((0)),
        [SubTotal] [decimal](12, 2) NULL,
        [IGV] [decimal](12, 2) NULL,
        [ICBPER] [decimal](12, 2) NULL DEFAULT ((0)),
        [Total] [decimal](12, 2) NULL,
        [CantidadOC] [decimal](12, 4) NULL,
        [CantidadAlmacen] [decimal](12, 4) NULL,
        [CodProveedor] [varchar](50) NULL,
        [DesUnidadMedida] [varchar](50) NULL,
        [MtoICBPERItem] [decimal](18, 4) NULL,
        [MtoDescuento] [decimal](18, 4) NULL,
        [Inci] [varchar](500) NULL,
        [Fabricante] [varchar](250) NULL,
        [Obs1] [varchar](500) NULL,
        [Obs2] [varchar](500) NULL,
        [Obs3] [varchar](500) NULL,
        [Obs4] [varchar](500) NULL,
        [ExtraDataJson] [varchar](max) NULL,
        [FechaVencimientoItem] [date] NULL,
        CONSTRAINT [PK_CntFacturaDet] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: CntFacturaDetArchivos
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CntFacturaDetArchivos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CntFacturaDetArchivos](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [FacturaCabId] [int] NOT NULL,
        [ItemIndex] [int] NOT NULL,
        [ObsField] [varchar](50) NOT NULL,
        [NombreArchivo] [varchar](255) NOT NULL,
        [RutaArchivo] [varchar](500) NOT NULL,
        [TamanioBytes] [int] NULL,
        [CreatedBy] [varchar](50) NULL,
        [CreatedAt] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_CntFacturaDetArchivos] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: CntTokensEmpresa
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CntTokensEmpresa]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CntTokensEmpresa](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [CodCia] [char](3) NOT NULL,
        [NomEmpresa] [varchar](200) NOT NULL,
        [NumRuc] [varchar](11) NOT NULL,
        [TokenMisCompras] [varchar](100) NULL,
        [TokenDatosCpe] [varchar](100) NULL,
        [TokenCorpo] [varchar](100) NULL,
        [Activo] [bit] NULL DEFAULT ((1)),
        [CreatedAt] [datetime] NULL DEFAULT (getdate()),
        [UpdatedAt] [datetime] NULL,
        [CreatedBy] [varchar](50) NULL,
        CONSTRAINT [PK_CntTokensEmpresa] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: Deliveries
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Deliveries]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Deliveries](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [sale_order_id] [int] NULL,
        [driver_id] [int] NULL,
        [vehicle_type] [varchar](20) NULL,
        [vehicle_plate] [varchar](20) NULL,
        [delivery_status] [varchar](50) NULL DEFAULT ('En Ruta'),
        [last_location_lat] [decimal](10, 8) NULL,
        [last_location_lon] [decimal](11, 8) NULL,
        [updated_at] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_Deliveries] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: Expense_Reports
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Expense_Reports]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Expense_Reports](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [employee_id] [int] NULL,
        [total_amount] [decimal](10, 2) NULL,
        [digital_receipt_url] [varchar](255) NULL,
        [status] [varchar](20) NULL DEFAULT ('En Revision'),
        [created_at] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_Expense_Reports] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: FinPagos
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FinPagos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[FinPagos](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [CodCia] [varchar](50) NOT NULL,
        [NroOrdenCompra] [varchar](50) NOT NULL,
        [DetalleId] [int] NOT NULL,
        [MontoPago] [decimal](18, 2) NOT NULL,
        [FechaPago] [date] NOT NULL,
        [BancoPago] [varchar](100) NULL,
        [Moneda] [varchar](20) NULL,
        [TipoPago] [varchar](50) NULL,
        [NroOperacion] [varchar](100) NULL,
        [Notas] [nvarchar](max) NULL,
        [UsuarioRegistro] [varchar](100) NULL,
        [FechaRegistro] [datetime] NULL DEFAULT (getdate()),
        [RucProveedor] [varchar](15) NULL,
        [Proveedor] [varchar](200) NULL,
        [TipoComprobante] [varchar](2) NULL,
        [FechaEmision] [date] NULL,
        [Serie] [varchar](10) NULL,
        [Numero] [varchar](20) NULL,
        [NroFactura] [varchar](30) NULL,
        [ConceptoPago] [varchar](50) NULL,
        [TipoOc] [varchar](5) NULL,
        [Uuid] [varchar](50) NULL,
        CONSTRAINT [PK_FinPagos] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: FinPagosAdjuntos
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FinPagosAdjuntos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[FinPagosAdjuntos](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [PagoId] [int] NOT NULL,
        [ArchivoNombre] [varchar](255) NOT NULL,
        [ArchivoRuta] [varchar](500) NOT NULL,
        [TipoMime] [varchar](100) NULL,
        [TamanoBytes] [bigint] NULL,
        [FechaCarga] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_FinPagosAdjuntos] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: FinPlanillaMovilidadAdjuntos
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FinPlanillaMovilidadAdjuntos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[FinPlanillaMovilidadAdjuntos](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [PlanillaId] [int] NOT NULL,
        [ArchivoNombre] [nvarchar](255) NOT NULL,
        [ArchivoRuta] [nvarchar](max) NOT NULL,
        [TipoMime] [varchar](100) NULL,
        [TamanoBytes] [bigint] NULL,
        CONSTRAINT [PK_FinPlanillaMovilidadAdjuntos] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: FinPlanillaMovilidadCab
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FinPlanillaMovilidadCab]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[FinPlanillaMovilidadCab](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [CodCia] [varchar](3) NOT NULL,
        [NroPlanilla] [varchar](50) NOT NULL,
        [FechaEmision] [date] NOT NULL,
        [Periodo] [varchar](50) NULL,
        [CodAux] [varchar](20) NOT NULL,
        [NomAux] [varchar](255) NULL,
        [RucDni] [varchar](20) NULL,
        [TotalGastado] [decimal](18, 2) NULL DEFAULT ((0)),
        [Estado] [varchar](20) NULL DEFAULT ('REGISTRADO'),
        [UsuarioRegistro] [varchar](50) NULL,
        [FechaRegistro] [datetime] NULL DEFAULT (getdate()),
        [UuidLink] [varchar](36) NULL,
        [AprobadorDocumento] [varchar](20) NULL,
        [AprobadorNombre] [varchar](150) NULL,
        [FechaAprobacion] [datetime] NULL,
        CONSTRAINT [PK_FinPlanillaMovilidadCab] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: FinPlanillaMovilidadDet
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FinPlanillaMovilidadDet]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[FinPlanillaMovilidadDet](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [PlanillaId] [int] NOT NULL,
        [Fecha] [date] NOT NULL,
        [Motivo] [varchar](255) NULL,
        [Desde] [varchar](255) NULL,
        [Hasta] [varchar](255) NULL,
        [Monto] [decimal](18, 2) NULL DEFAULT ((0)),
        CONSTRAINT [PK_FinPlanillaMovilidadDet] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: FinRendicionGastosAdjuntos
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FinRendicionGastosAdjuntos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[FinRendicionGastosAdjuntos](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [RendicionId] [int] NOT NULL,
        [ArchivoNombre] [nvarchar](255) NOT NULL,
        [ArchivoRuta] [nvarchar](max) NOT NULL,
        [TipoMime] [varchar](100) NULL,
        [TamanoBytes] [bigint] NULL,
        CONSTRAINT [PK_FinRendicionGastosAdjuntos] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: FinRendicionGastosCab
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FinRendicionGastosCab]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[FinRendicionGastosCab](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [CodCia] [varchar](3) NOT NULL,
        [NroRendicion] [varchar](50) NOT NULL,
        [Fecha] [date] NOT NULL,
        [Periodo] [varchar](50) NULL,
        [Moneda] [varchar](10) NULL DEFAULT ('Soles'),
        [CodAux] [varchar](20) NOT NULL,
        [NomAux] [varchar](255) NULL,
        [RucDni] [varchar](20) NULL,
        [TipoRendicion] [varchar](50) NULL,
        [SaldoInicial] [decimal](18, 2) NULL DEFAULT ((0)),
        [SaldoFinal] [decimal](18, 2) NULL DEFAULT ((0)),
        [TotalGastado] [decimal](18, 2) NULL DEFAULT ((0)),
        [TotalReembolso] [decimal](18, 2) NULL DEFAULT ((0)),
        [Estado] [varchar](20) NULL DEFAULT ('REGISTRADO'),
        [UsuarioRegistro] [varchar](50) NULL,
        [FechaRegistro] [datetime] NULL DEFAULT (getdate()),
        [UuidLink] [varchar](36) NULL,
        [AprobadorDocumento] [varchar](20) NULL,
        [AprobadorNombre] [varchar](150) NULL,
        [FechaAprobacion] [datetime] NULL,
        CONSTRAINT [PK_FinRendicionGastosCab] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: FinRendicionGastosDet
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FinRendicionGastosDet]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[FinRendicionGastosDet](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [RendicionId] [int] NOT NULL,
        [Fecha] [date] NOT NULL,
        [TipoDoc] [varchar](50) NULL,
        [Serie] [varchar](20) NULL,
        [Numero] [varchar](50) NULL,
        [RucPro] [varchar](20) NULL,
        [NomPro] [varchar](255) NULL,
        [ProjectCard] [varchar](100) NULL,
        [CentroCostos] [varchar](100) NULL,
        [ExpenseCategory] [varchar](100) NULL,
        [Detalles] [varchar](255) NULL,
        [ImporteSoles] [decimal](18, 2) NULL DEFAULT ((0)),
        [ImporteDolares] [decimal](18, 2) NULL DEFAULT ((0)),
        [DocReferenciaId] [int] NULL,
        CONSTRAINT [PK_FinRendicionGastosDet] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: Inventory_Movements
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Inventory_Movements]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Inventory_Movements](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [item_type] [varchar](20) NULL,
        [item_id] [int] NULL,
        [batch_number] [varchar](50) NULL,
        [warehouse_id] [int] NULL,
        [quantity] [decimal](10, 2) NULL,
        [movement_type] [varchar](10) NULL,
        [reason] [varchar](50) NULL,
        [movement_date] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_Inventory_Movements] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: LogHojasRuta
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[LogHojasRuta]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[LogHojasRuta](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [codcia] [char](3) NOT NULL,
        [cod_chofer] [varchar](20) NOT NULL,
        [cod_movilidad] [varchar](20) NOT NULL,
        [fecha_ruta] [date] NOT NULL,
        [estado] [varchar](20) NULL DEFAULT ('Generada'),
        [created_at] [datetime] NULL DEFAULT (getdate()),
        [created_by] [varchar](50) NULL,
        [codcia_chofer] [char](3) NULL,
        [codcia_movilidad] [char](3) NULL,
        [archivo_firmado] [varchar](255) NULL,
        CONSTRAINT [PK_LogHojasRuta] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: LogHojasRutaDet
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[LogHojasRutaDet]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[LogHojasRutaDet](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [hoja_ruta_id] [int] NULL,
        [solicitud_id] [int] NULL,
        [orden] [int] NULL DEFAULT ((0)),
        [estado] [varchar](20) NULL DEFAULT ('Asignado'),
        [obs_chofer] [nvarchar](max) NULL,
        [evidencias] [nvarchar](max) NULL,
        CONSTRAINT [PK_LogHojasRutaDet] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: LogOcAcciones
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[LogOcAcciones]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[LogOcAcciones](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [CodCia] [char](3) NOT NULL,
        [Anos] [varchar](4) NOT NULL,
        [NroDoc] [varchar](20) NOT NULL,
        [TipoOc] [varchar](5) NULL,
        [Accion] [varchar](20) NOT NULL,
        [UsuarioLogin] [varchar](50) NOT NULL,
        [UsuarioNombre] [varchar](100) NULL,
        [FechaHora] [datetime] NULL DEFAULT (getdate()),
        [Observacion] [varchar](500) NULL,
        CONSTRAINT [PK_LogOcAcciones] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: LogSolicitudesRecojo
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[LogSolicitudesRecojo]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[LogSolicitudesRecojo](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [tipo] [varchar](20) NULL DEFAULT ('OC'),
        [codcia] [char](3) NOT NULL,
        [nro_oc] [varchar](20) NULL,
        [fecha_recojo] [date] NOT NULL,
        [hora_recojo] [varchar](10) NULL,
        [origen] [varchar](255) NULL,
        [destino] [varchar](255) NULL,
        [contacto] [varchar](150) NULL,
        [responsable] [varchar](150) NULL,
        [estado] [varchar](20) NULL DEFAULT ('Pendiente'),
        [created_at] [datetime] NULL DEFAULT (getdate()),
        [created_by] [varchar](50) NULL,
        [proveedor_nombre] [varchar](150) NULL,
        [celular_contacto] [varchar](50) NULL,
        [observaciones] [text] NULL,
        [url_maps] [varchar](600) NULL,
        [proveedor_ruc] [varchar](20) NULL,
        CONSTRAINT [PK_LogSolicitudesRecojo] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: LogSolicitudesRecojoDet
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[LogSolicitudesRecojoDet]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[LogSolicitudesRecojoDet](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [solicitud_id] [int] NULL,
        [codmat] [varchar](20) NULL,
        [descripcion] [varchar](200) NULL,
        [cantidad] [decimal](10, 2) NULL,
        [unidad] [varchar](10) NULL,
        CONSTRAINT [PK_LogSolicitudesRecojoDet] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: Log_Aprobaciones
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Log_Aprobaciones]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Log_Aprobaciones](
        [IdAprob] [int] IDENTITY(1,1) NOT NULL,
        [DocTipo] [varchar](20) NULL,
        [DocId] [varchar](50) NULL,
        [Nivel] [varchar](50) NULL,
        [Estado] [varchar](20) NULL,
        [Usuario] [varchar](50) NULL,
        [Fecha] [datetime] NULL DEFAULT (getdate()),
        [Comentario] [varchar](500) NULL,
        CONSTRAINT [PK_Log_Aprobaciones] PRIMARY KEY CLUSTERED ([IdAprob] ASC)
    )
END
GO

-- TABLA: Log_CmpRCoti
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Log_CmpRCoti]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Log_CmpRCoti](
        [IdDetalle] [int] IDENTITY(1,1) NOT NULL,
        [IdCoti] [int] NULL,
        [NroItm] [int] NULL,
        [CodMat] [varchar](18) NULL,
        [DesMat] [varchar](200) NULL,
        [UndStk] [varchar](5) NULL,
        [Cantidad] [numeric](14, 4) NULL,
        [PreUni] [numeric](14, 4) NULL,
        [PorIgv] [numeric](6, 2) NULL,
        [ImpIgv] [numeric](14, 2) NULL,
        [ImpTot] [numeric](14, 2) NULL,
        CONSTRAINT [PK_Log_CmpRCoti] PRIMARY KEY CLUSTERED ([IdDetalle] ASC)
    )
END
GO

-- TABLA: Log_CmpVCoti
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Log_CmpVCoti]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Log_CmpVCoti](
        [IdCoti] [int] IDENTITY(1,1) NOT NULL,
        [CodCia] [char](3) NULL DEFAULT ('01'),
        [NroDoc] [varchar](20) NULL,
        [NroReq] [varchar](20) NULL,
        [Prov_RUC] [varchar](15) NULL,
        [Prov_Nom] [varchar](150) NULL,
        [FchDoc] [datetime] NULL DEFAULT (getdate()),
        [FchValidez] [datetime] NULL,
        [Estado] [varchar](20) NULL DEFAULT ('PENDIENTE'),
        [Moneda] [varchar](3) NULL DEFAULT ('PEN'),
        [TpoCmb] [numeric](10, 4) NULL,
        [ImpNet] [numeric](14, 2) NULL,
        [ImpIgv] [numeric](14, 2) NULL,
        [ImpTot] [numeric](14, 2) NULL,
        [Usuario] [varchar](50) NULL,
        [CondicionPago] [varchar](100) NULL,
        [TiempoEntrega] [varchar](50) NULL,
        CONSTRAINT [PK_Log_CmpVCoti] PRIMARY KEY CLUSTERED ([IdCoti] ASC)
    )
END
GO

-- TABLA: Log_ControlCalidad
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Log_ControlCalidad]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Log_ControlCalidad](
        [IdCC] [int] IDENTITY(1,1) NOT NULL,
        [NroLote] [varchar](50) NULL,
        [CodMat] [varchar](18) NULL,
        [FechaEval] [datetime] NULL DEFAULT (getdate()),
        [Estado] [varchar](20) NULL,
        [Archivo_COA] [varchar](255) NULL,
        [Archivo_MSDS] [varchar](255) NULL,
        [Archivo_FT] [varchar](255) NULL,
        [Usuario] [varchar](50) NULL,
        [Comentario] [varchar](500) NULL,
        CONSTRAINT [PK_Log_ControlCalidad] PRIMARY KEY CLUSTERED ([IdCC] ASC)
    )
END
GO

-- TABLA: Log_Prod_Costos
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Log_Prod_Costos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Log_Prod_Costos](
        [IdCosto] [int] IDENTITY(1,1) NOT NULL,
        [IdOrden] [int] NOT NULL,
        [IdEtapa] [int] NULL,
        [TipoCosto] [varchar](10) NOT NULL,
        [Fecha] [date] NOT NULL,
        [Detalle] [varchar](250) NOT NULL,
        [UnidadMedida] [varchar](10) NULL,
        [Cantidad] [decimal](12, 4) NOT NULL DEFAULT ((0)),
        [CostoUnitario] [decimal](12, 4) NOT NULL DEFAULT ((0)),
        [CostoTotal] [decimal](12, 4) NOT NULL DEFAULT ((0)),
        [ComprobanteRef] [varchar](50) NULL,
        CONSTRAINT [PK_Log_Prod_Costos] PRIMARY KEY CLUSTERED ([IdCosto] ASC)
    )
END
GO

-- TABLA: Log_Prod_Etapas
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Log_Prod_Etapas]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Log_Prod_Etapas](
        [IdEtapa] [int] IDENTITY(1,1) NOT NULL,
        [IdOrden] [int] NOT NULL,
        [NombreEtapa] [varchar](100) NOT NULL,
        [Descripcion] [varchar](200) NULL,
        [OrdenSecuencia] [int] NULL,
        [Estado] [varchar](20) NULL DEFAULT ('PENDIENTE'),
        CONSTRAINT [PK_Log_Prod_Etapas] PRIMARY KEY CLUSTERED ([IdEtapa] ASC)
    )
END
GO

-- TABLA: Log_Prod_Orden
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Log_Prod_Orden]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Log_Prod_Orden](
        [IdOrden] [int] IDENTITY(1,1) NOT NULL,
        [NroOrden] [varchar](20) NOT NULL,
        [Cliente] [varchar](100) NULL,
        [FchInicio] [date] NULL,
        [FchFin] [date] NULL,
        [FchEntrega] [date] NULL,
        [Almacen] [varchar](50) NULL,
        [LotePT] [varchar](50) NULL,
        [CodProducto] [varchar](50) NULL,
        [ProductoDesc] [varchar](150) NULL,
        [Presentacion] [varchar](100) NULL,
        [CantPlanificada] [decimal](12, 4) NULL,
        [CantProducida] [decimal](12, 4) NULL,
        [CantMuestras] [decimal](12, 4) NULL,
        [CantEntregada] [decimal](12, 4) NULL,
        [Estado] [varchar](20) NULL DEFAULT ('EN PROCESO'),
        [UsuarioCrea] [varchar](50) NULL,
        [FchRegistro] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_Log_Prod_Orden] PRIMARY KEY CLUSTERED ([IdOrden] ASC)
    )
END
GO

-- TABLA: Production_Orders
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Production_Orders]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Production_Orders](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [product_base_id] [int] NULL,
        [final_batch_number] [varchar](50) NOT NULL,
        [sanitary_registry] [varchar](100) NOT NULL,
        [technical_director] [varchar](150) NOT NULL,
        [planned_quantity] [decimal](10, 2) NULL,
        [produced_quantity] [decimal](10, 2) NULL,
        [status] [varchar](50) NULL DEFAULT ('Planificada'),
        [start_date] [datetime] NULL,
        [end_date] [datetime] NULL,
        [created_at] [datetime] NULL DEFAULT (getdate()),
        [product_name] [varchar](255) NULL,
        CONSTRAINT [PK_Production_Orders] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: Purchase_Orders
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Purchase_Orders]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Purchase_Orders](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [production_order_id] [int] NULL,
        [supplier_id] [int] NULL,
        [status] [varchar](20) NULL DEFAULT ('Pendiente'),
        [total_amount] [decimal](12, 2) NULL,
        [created_at] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_Purchase_Orders] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: RawMaterial_Batches
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[RawMaterial_Batches]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[RawMaterial_Batches](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [raw_material_id] [int] NULL,
        [batch_number] [varchar](50) NOT NULL,
        [expiry_date] [date] NOT NULL,
        [received_quantity] [decimal](10, 2) NULL,
        [current_quantity] [decimal](10, 2) NULL,
        [digemid_approval] [bit] NULL DEFAULT ((0)),
        [created_at] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_RawMaterial_Batches] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: Sales_Goals
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Sales_Goals]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Sales_Goals](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [salesperson_id] [int] NULL,
        [target_amount] [decimal](12, 2) NULL,
        [achieved_amount] [decimal](12, 2) NULL DEFAULT ((0)),
        [commission_rate] [decimal](5, 2) NULL,
        [goal_month] [int] NULL,
        [goal_year] [int] NULL,
        CONSTRAINT [PK_Sales_Goals] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: Traceability_Log
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Traceability_Log]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Traceability_Log](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [production_order_id] [int] NULL,
        [raw_material_batch_id] [int] NULL,
        [quantity_used] [decimal](10, 2) NULL,
        [registered_at] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_Traceability_Log] PRIMARY KEY CLUSTERED ([id] ASC)
    )
END
GO

-- TABLA: WebChatMensajes
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WebChatMensajes]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[WebChatMensajes](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [DeLogin] [varchar](50) NOT NULL,
        [ParaLogin] [varchar](50) NOT NULL,
        [Mensaje] [nvarchar](2000) NOT NULL,
        [Leido] [bit] NULL DEFAULT ((0)),
        [FechaEnvio] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_WebChatMensajes] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: WebModulos
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WebModulos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[WebModulos](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [Codigo] [varchar](50) NOT NULL,
        [Nombre] [varchar](100) NOT NULL,
        [RutaHtml] [varchar](200) NULL,
        [Seccion] [varchar](50) NULL,
        [Icono] [text] NULL,
        [Orden] [int] NULL DEFAULT ((0)),
        [Activo] [bit] NULL DEFAULT ((1)),
        [ParentId] [int] NULL,
        CONSTRAINT [PK_WebModulos] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: WebPermisos
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WebPermisos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[WebPermisos](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [Rol] [varchar](50) NOT NULL,
        [ModuloId] [int] NOT NULL,
        [PuedeVer] [bit] NULL DEFAULT ((0)),
        [PuedeEditar] [bit] NULL DEFAULT ((0)),
        [PuedeEliminar] [bit] NULL DEFAULT ((0)),
        [PuedeAprobar] [bit] NULL DEFAULT ((0)),
        CONSTRAINT [PK_WebPermisos] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: WebRoles
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WebRoles]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[WebRoles](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [Codigo] [varchar](50) NOT NULL,
        [Nombre] [varchar](100) NOT NULL,
        [Descripcion] [varchar](255) NULL,
        [Activo] [bit] NULL DEFAULT ((1)),
        [CreadoEn] [datetime] NULL DEFAULT (getdate()),
        CONSTRAINT [PK_WebRoles] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: WebUsuarioEmpresa
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WebUsuarioEmpresa]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[WebUsuarioEmpresa](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [Login] [varchar](50) NOT NULL,
        [CodCia] [char](3) NOT NULL,
        CONSTRAINT [PK_WebUsuarioEmpresa] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

-- TABLA: WebUsuarioTipoOc
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WebUsuarioTipoOc]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[WebUsuarioTipoOc](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [Login] [varchar](50) NOT NULL,
        [TipoOc] [varchar](5) NOT NULL,
        CONSTRAINT [PK_WebUsuarioTipoOc] PRIMARY KEY CLUSTERED ([Id] ASC)
    )
END
GO

