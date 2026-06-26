# Diagrama de Entidad-Relación (ER) - ERP Yelave

Este documento presenta los diagramas de entidad-relación que describen el modelo de datos activo ("amarrado") en el sistema web del ERP. 

Para facilitar la comprensión del diseño, los diagramas se han separado por módulos de negocio independientes utilizando un carrusel interactivo.

````carousel
### 1. Seguridad, Usuarios y Accesos
El módulo de seguridad gestiona la autenticación, los permisos granulares asignados a roles, el acceso a vistas específicas y la asociación de usuarios con empresas autorizadas del holding.

```mermaid
erDiagram
    WebUsers {
        int Id PK
        string Username
        string Password
        int RoleId FK
        string Estado
    }
    WebRoles {
        int Id PK
        string Nombre
    }
    WebModulos {
        int Id PK
        string Nombre
        string Ruta
    }
    WebPermisos {
        int Id PK
        int RoleId FK
        int ModuloId FK
        bool Lectura
        bool Escritura
    }
    WebUsuarioEmpresa {
        int Id PK
        int UserWebId FK
        char CodCia FK
    }
    AdmMcias {
        char CodCia PK
        string NomCia
        string Ruc
    }
    WebUsuarioTipoOc {
        int Id PK
        int UserWebId FK
        string TipoOc
    }
    WebChatMensajes {
        int Id PK
        int RemitenteId FK
        int DestinatarioId FK
        string Mensaje
    }

    WebUsers }|..|| WebRoles : "pertenece a"
    WebRoles ||--o{ WebPermisos : "define permisos"
    WebModulos ||--o{ WebPermisos : "es regulado por"
    WebUsers ||--o{ WebUsuarioEmpresa : "tiene acceso a"
    AdmMcias ||--o{ WebUsuarioEmpresa : "vinculada a"
    WebUsers ||--o{ WebUsuarioTipoOc : "puede gestionar tipo"
    WebUsers ||--o{ WebChatMensajes : "envía/recibe"
```
<!-- slide -->
### 2. Cuentas por Pagar (Cargos y Facturas)
Este sub-sistema permite la carga de facturas de proveedores, su verificación contra las compras informadas a SUNAT, y su agrupación lógica en "Cargos" para derivarlas a aprobación contable.

```mermaid
erDiagram
    CntCargosDocumentales {
        int Id PK
        string NroCargo
        string TipoCargo
        string Estado
        char CodCia
    }
    CntCargosDetalle {
        int Id PK
        int CargoId FK
        string NroFactura FK
        string NroOrdenCompra
        decimal MontoFactura
    }
    CntFacturaCab {
        int Id PK
        string NomProveedor
        string NumRucProveedor
        string Serie
        string Numero
        decimal Total
        date FecPeriodoContable FK
        int IdCompraRef FK
    }
    CntFacturaDet {
        int Id PK
        int FacturaCabId FK
        string CodMat
        decimal Cantidad
    }
    CntFacturaArchivos {
        int Id PK
        int FacturaCabId FK
        string RutaArchivo
    }
    CntFacturaDetArchivos {
        int Id PK
        int FacturaCabId FK
        string RutaArchivo
    }
    CntCompras {
        int Id PK
        string NumCDP
        string NomRazonSocial
        decimal MtoTotalCp
    }
    CntPeriodoContable {
        int Id PK
        char CodCia
        int Ano
        int Mes
        string Estado
    }
    CmpROcom {
        string NroOrdenCompra PK
        char CodCia PK
        string Proveedor
    }

    CntCargosDocumentales ||--o{ CntCargosDetalle : "contiene"
    CntCargosDetalle }|..o| CntFacturaCab : "agrupa/vincula"
    CntFacturaCab ||--o{ CntFacturaDet : "contiene items"
    CntFacturaCab ||--o{ CntFacturaArchivos : "tiene adjuntos"
    CntFacturaCab ||--o{ CntFacturaDetArchivos : "tiene adjuntos items"
    CntFacturaCab }|..o| CntCompras : "valida datos vs SUNAT"
    CntFacturaCab }|..o| CmpROcom : "asociada a"
    CntFacturaCab }|..|| CntPeriodoContable : "valida mes contable"
```
<!-- slide -->
### 3. Gastos, Rendiciones y Movilidad
Controla el flujo de caja chica, viáticos y gastos de movilidad del personal. Estos flujos también pueden agruparse en los Cargos Documentales para pase a pago.

```mermaid
erDiagram
    FinRendicionGastosCab {
        int Id PK
        string Colaborador
        decimal Total
        string Estado
    }
    FinRendicionGastosDet {
        int Id PK
        int RendicionCabId FK
        int ConceptoGastoId FK
        string Proveedor
        decimal Monto
    }
    FinRendicionGastosAdjuntos {
        int Id PK
        int RendicionCabId FK
        string RutaArchivo
    }
    FinPlanillaMovilidadCab {
        int Id PK
        string Colaborador
        decimal Total
        date FecPeriodoContable
    }
    FinPlanillaMovilidadDet {
        int Id PK
        int MovilidadCabId FK
        string Origen
        string Destino
        decimal Costo
        int ConceptoGastoId FK
    }
    FinPlanillaMovilidadAdjuntos {
        int Id PK
        int MovilidadCabId FK
        string RutaArchivo
    }
    CONGASTO {
        int Id PK
        string DesGasto
        string CodCta
    }
    CntCargosDetalle {
        int Id PK
        int CargoId FK
        decimal MontoRendicion
    }

    FinRendicionGastosCab ||--o{ FinRendicionGastosDet : "contiene egresos"
    FinRendicionGastosCab ||--o{ FinRendicionGastosAdjuntos : "posee fotos/sustentos"
    FinPlanillaMovilidadCab ||--o{ FinPlanillaMovilidadDet : "contiene tramos"
    FinPlanillaMovilidadCab ||--o{ FinPlanillaMovilidadAdjuntos : "tiene firmas"
    FinRendicionGastosDet }|..|| CONGASTO : "clasificado como"
    FinPlanillaMovilidadDet }|..|| CONGASTO : "clasificado como"
    CntCargosDetalle }|..o| FinRendicionGastosCab : "agrupa en cargo"
```
<!-- slide -->
### 4. Tesorería, Pagos y Conciliación Bancaria
Registra los desembolsos de dinero (pagos) para liquidar facturas y rendiciones, y permite conciliar dichos pagos contra los extractos reales de cuentas bancarias.

```mermaid
erDiagram
    FinPagos {
        int Id PK
        date FechaPago
        string NroOperacion
        decimal MontoPagado
        int FacturaCabId FK
    }
    FinPagosAdjuntos {
        int Id PK
        int PagoId FK
        string RutaArchivo
    }
    BankMovements {
        int Id PK
        date FechaMov
        string Descripcion
        decimal Importe
        string Moneda
    }
    ReconciliationDetail {
        int Id PK
        int MovementId FK
        int PagoId FK
        string Estado
    }
    tbl_Conciliados {
        int Id PK
        int ConciliacionId
        string Observacion
    }
    POSTARJE {
        int Id PK
        date FechaVenta
        decimal ImporteNeto
    }
    CntFacturaCab {
        int Id PK
        decimal Total
    }

    FinPagos ||--o{ FinPagosAdjuntos : "tiene constancia de transferencia"
    FinPagos }|..o| CntFacturaCab : "cancela deuda"
    BankMovements ||--o{ ReconciliationDetail : "se asocia en"
    FinPagos ||--o{ ReconciliationDetail : "se empareja con"
    ReconciliationDetail }|..|| tbl_Conciliados : "genera registro conciliado"
    POSTARJE }|..o{ BankMovements : "cuadra abonos de tarjetas"
```
<!-- slide -->
### 5. Almacén, Lotes e Inventario (Kardex)
Define el catálogo de materias primas y productos, el almacenamiento detallado por lotes, y los movimientos de entrada, salida y saldo (Kardex).

```mermaid
erDiagram
    AlmmMatg {
        char CodMat PK
        string DesMat
        string UndStk
    }
    AlmmMate {
        char CodMat PK
        char Almcen PK
        decimal StkAct
    }
    AlmAcmLt {
        string NroLote PK
        char CodMat PK
        char Almcen PK
        decimal CanDes
        date FchLote
    }
    AlmRMovm {
        string NroDoc PK
        char CodCia PK
        date FchDoc
        char TpoMov FK
    }
    AlmVMovm {
        int Id PK
        string NroDoc FK
        char CodMat FK
        decimal Cantidad
    }
    AlmTMovm {
        char TpoMov PK
        string DesMov
    }
    AlmTabla {
        char CodAlm PK
        string DesAlm
    }

    AlmmMatg ||--o{ AlmmMate : "registra stock en"
    AlmmMatg ||--o{ AlmAcmLt : "lotes del producto"
    AlmRMovm ||--o{ AlmVMovm : "contiene items"
    AlmVMovm }|..|| AlmmMatg : "mueve material"
    AlmRMovm }|..|| AlmTMovm : "clasificado como tipo"
    AlmRMovm }|..|| AlmTabla : "origen/destino"
```
<!-- slide -->
### 6. Logística, Compras (OC) y Producción
Representa el flujo de abastecimiento y manufactura del negocio. Las Órdenes de Compra (OC) y los pedidos de manufactura generan los lotes de stock de la planta.

```mermaid
erDiagram
    CmpROcom {
        string NroOrdenCompra PK
        char CodCia PK
        string Proveedor
        string Estado
    }
    CmpVOcom {
        int Id PK
        string NroOrdenCompra FK
        char CodMat FK
        decimal Cantidad
        decimal PreUto
    }
    LogOcAcciones {
        int Id PK
        string NroOrdenCompra FK
        string Accion
        string Usuario
    }
    Production_Orders {
        int Id PK
        string ProductName
        string FinalBatchNumber
        decimal PlannedQuantity
        string Status
    }
    Log_Prod_Orden {
        int Id PK
        int ProductionOrderId FK
        string Observacion
    }
    Log_Prod_Etapas {
        int Id PK
        int ProductionOrderId FK
        string Etapa
    }
    Log_Prod_Costos {
        int Id PK
        int ProductionOrderId FK
        decimal CostoReal
    }
    formula {
        int Id PK
        string DesFormula
    }
    dformula {
        int Id PK
        int FormulaId FK
        char CodMat FK
        decimal CantidadStandard
    }
    AlmmMatg {
        char CodMat PK
    }

    CmpROcom ||--o{ CmpVOcom : "contiene lineas"
    CmpROcom ||--o{ LogOcAcciones : "registra auditoria de"
    CmpVOcom }|..|| AlmmMatg : "solicita item"
    Production_Orders ||--o{ Log_Prod_Orden : "registra historial"
    Production_Orders ||--o{ Log_Prod_Etapas : "pasa por fases"
    Production_Orders ||--o{ Log_Prod_Costos : "acumula costos"
    formula ||--o{ dformula : "compuesta por"
    dformula }|..|| AlmmMatg : "requiere componente"
```
<!-- slide -->
### 7. Distribución, Despacho y Reparto
Mapea el transporte y entrega de pedidos facturados por el área comercial utilizando Hojas de Ruta de los transportistas asignados.

```mermaid
erDiagram
    LogHojasRuta {
        int Id PK
        string PlacaVehiculo
        string Chofer
        string Estado
    }
    LogHojasRutaDet {
        int Id PK
        int HojaRutaId FK
        string NroGuia FK
        string NroFactura
    }
    VtaVGuia {
        string NroGuia PK
        char CodCia PK
        string NomAuxCliente
    }
    LogSolicitudesRecojo {
        int Id PK
        string Chofer
        string Estado
    }
    LogSolicitudesRecojoDet {
        int Id PK
        int SolicitudId FK
        char CodMat FK
        decimal Cantidad
    }
    AlmmMatg {
        char CodMat PK
    }

    LogHojasRuta ||--o{ LogHojasRutaDet : "organiza entregas en"
    LogHojasRutaDet }|..o| VtaVGuia : "incluye despacho de"
    LogSolicitudesRecojo ||--o{ LogSolicitudesRecojoDet : "contiene recojos"
    LogSolicitudesRecojoDet }|..|| AlmmMatg : "recupera item"
```
````
