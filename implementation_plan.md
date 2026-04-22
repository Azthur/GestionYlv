# Implementación: Filtro de Usuario y Control de Tipos de OC

Este plan detalla los cambios requeridos para implementar filtros de seguridad a nivel de registros propios y segregación de tipos de Orden de Compra (M, S, T) por usuario, tanto en frontend como en el motor SQL de la API.

> [!CAUTION]
> Revisión Requerida:
> - ¿Está de acuerdo con gestionar las opciones de "Ver Todo" y "Tipos de OC" dentro de la actual ventana de **"Editar Usuario"** en la sección de Usuarios (`users.html`) del panel administrador?

---

## Cambios Propuestos

### Componente: Base de Datos & Configuración (`backend/auth.py`, `backend/permisos.py`)
Modificaremos el esquema de seguridad actual para dotarlo de mayor granularidad.

#### [MODIFY] `backend/permisos.py`
- Añadir la creación automática de la tabla `WebUsuarioTipoOc (Login, TipoOc)`.
- Añadir una instrucción dinámica para alterar la tabla `WebUsers` agregando la columna `PuedeVerTodo BIT DEFAULT 0` si no existe.
- Crear nuevos endpoints: `GET /api/admin/usuario-tipooc/{login}` y `POST /api/admin/usuario-tipooc/{login}` idénticos a la lógica de empresas asignadas para asegurar su persistencia.
- Modificar `GET /api/permisos/me` para enviar en el esquema de permisos si el usuario "puede ver todo" y sus tipos de OC permitidos, habilitando acceso asíncrono para el frontend.

---

### Componente: Backend Analytics (`backend/logistics.py`, `backend/contabilidad.py`)
Aquí impondremos la lógica dura donde sin importar qué haga el cliente web, los datos sensibles no saldrán.

#### [MODIFY] `backend/logistics.py`
- En la función `get_purchase_orders()`, obligar a requerir el `current_user` y el flag opcional `solo_mis_registros`.
- Modificar el Query Base SQL inyectando el query de restricción:
  - Si el usuario **no** tiene permiso global: Forzar `WHERE c.usuari = user.login`.
  - Si no es `ADMIN`, forzar `WHERE c.tipooc IN (SELECT TipoOc FROM WebUsuarioTipoOc WHERE Login = ...)`

#### [MODIFY] `backend/contabilidad.py`
- Extender la misma seguridad inquebrantable a la función `get_trazabilidad_global()`.

---

### Componente: UI Frontend (Interfaz de Gestión)

#### [MODIFY] `dashboard-prototype/users.html` y `users.js`
- Modificar el modal de "Editar Usuario" para incluir:
  1. Checkbox **"Puede Ver Todos los Registros"**.
  2. Multi-selecciones (Checkboxes): **Tipos de OC Autorizados (M, S, T)**.
- Extender `update_user_info` para interactuar con la API salvando estas 2 nuevas restricciones en sus respectivas tablas.

#### [MODIFY] `dashboard-prototype/orders.html` e `inventario.html`/`trazabilidad_global.html`
- Colocar dinámicamente el checkbox "✅ Mostrar solo mis registros" (Marcarlo por defecto).
- Ocultar el checkbox completamente si el sistema detecta vía API que el usuario carece de la bandera `PuedeVerTodo`.
- Ocultar dinámicamente del `<select id="filterTipoOc">` las letras a las cuales no tenga permiso, evitando errores gráficos visualmente.

---

## Preguntas Abiertas
> [!IMPORTANT]
> 1. Para los usuarios ADMINISTRADORES (como GERENCIA o ADMIN), ¿desea que el sistema les asigne por defecto ver "Todos los Registros" y "Todos los Tipos de OC", o prefiere que incluso ellos tengan que estar marcados explícitamente en el panel de usuarios?
> 2. Si un usuario tiene múltiples credenciales o cambia de área, ¿los registros que hizo previamente deben seguir siendo invisibles si se le quita el acceso global?

---

## Plan de Verificación

### Pruebas Manuales y Visuales
1. Entrar como ADMIN, asignar permisos `Tipo M` y `Tipo S` al usuario de prueba.
2. Quitar el checkbox de `PuedeVerTodo` a dicho usuario de prueba.
3. Iniciar sesión con el usuario de prueba, abrir *Trazabilidad*, y *Órdenes de Compra*. 
4. **Verificación Esperada**: La opción `T` en el filtro debe desaparecer. El checkbox de "Mostrar Solo mis Registros" debe estar oculto y forzar la vista de su propia bandeja exclusivamente.
