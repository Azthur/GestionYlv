from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pyodbc
import anyio

from database import get_db_connection, setup_periodos_contables_tables

app = FastAPI(title="YELAVE ERP API")

@app.on_event("startup")
async def increase_threadpool():
    """Aumentar threadpool para endpoints sincronos.
    FastAPI despacha funciones 'def' al threadpool default de AnyIO.
    Si el pool default (40) se satura con polls de chat, TODO se ralentiza."""
    limiter = anyio.to_thread.current_default_thread_limiter()
    limiter.total_tokens = 200

# Register routers
from conciliacion import router as conciliacion_router
app.include_router(conciliacion_router)

from db_config import router as db_config_router
app.include_router(db_config_router)

from auth import router as auth_router
app.include_router(auth_router)

from users import router as users_router
app.include_router(users_router)

from logistics import router as logistics_router
app.include_router(logistics_router)

from logistics_modules import router as logistics_modules_router
app.include_router(logistics_modules_router)

from reparto import router as reparto_router
app.include_router(reparto_router)

from production_modules import router as production_modules_router
app.include_router(production_modules_router)

from kardex import router as kardex_router
app.include_router(kardex_router)

from cuentas_cobrar import router as cuentas_cobrar_router
app.include_router(cuentas_cobrar_router)

from historial_cancelaciones import router as historial_cancelaciones_router
app.include_router(historial_cancelaciones_router)

from auditoria_comprobantes import router as auditoria_comprobantes_router
app.include_router(auditoria_comprobantes_router)

from contabilidad import router as contabilidad_router
app.include_router(contabilidad_router)

from cargos_documentales import router as cargos_router
app.include_router(cargos_router)

# Router separado para generar cargo con prefijo diferente para evitar conflictos
from fastapi import APIRouter
from cargos_documentales import generar_cargo, CargoCreate
generar_router = APIRouter(prefix="/api/cargos-crear", tags=["Generar Cargo"])

@generar_router.post("/generar")
def generar_cargo_endpoint(payload: CargoCreate):
    return generar_cargo(payload)

app.include_router(generar_router)

from gastos_rendiciones import router as finanzas_router
app.include_router(finanzas_router)

from permisos import router as permisos_router, setup_permisos_tables
app.include_router(permisos_router)

from chat import router as chat_router, setup_chat_tables
app.include_router(chat_router)

from dashboard_gerencial import router as dashboard_gerencial_router
app.include_router(dashboard_gerencial_router)

# Crear tablas al iniciar
setup_permisos_tables()
setup_chat_tables()
setup_periodos_contables_tables()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    # Solo aplicar no-cache a archivos estáticos del frontend
    path = request.url.path
    if request.method == "GET" and not path.startswith("/api/") and any(path.endswith(ext) for ext in [".html", ".js", ".css"]):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

class ProductionOrderCreate(BaseModel):
    product_base_id: int
    product_name: str
    final_batch_number: str
    sanitary_registry: str
    technical_director: str
    planned_quantity: float
    status: Optional[str] = "Planificada"

@app.get("/api/production-orders")
def get_production_orders():
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, product_base_id, final_batch_number, sanitary_registry, 
               technical_director, planned_quantity, produced_quantity, 
               status, start_date, created_at, product_name 
        FROM Production_Orders
        ORDER BY created_at DESC
    """)
    columns = [column[0] for column in cursor.description]
    results = []
    for row in cursor.fetchall():
        results.append(dict(zip(columns, row)))
    conn.close()
    return results

@app.post("/api/production-orders")
def create_production_order(order: ProductionOrderCreate):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="DB Error")
    
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO Production_Orders 
            (product_base_id, product_name, final_batch_number, sanitary_registry, technical_director, planned_quantity, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (order.product_base_id, order.product_name, order.final_batch_number, order.sanitary_registry, order.technical_director, order.planned_quantity, order.status))
        conn.commit()
        conn.close()
        return {"status": "success", "message": "Orden de producción creada."}
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health/db")
def health_db():
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT @@VERSION")
            row = cursor.fetchone()
            conn.close()
            return {"status": "ok", "db_version": row[0]}
        except pyodbc.Error as e:
            conn.close()
            raise HTTPException(status_code=500, detail=f"Database query error: {str(e)}")
    else:
        raise HTTPException(status_code=500, detail="Database connection failed. Please check credentials or firewall settings.")

# Mount static files to serve the frontend prototype directly at root
app.mount("/", StaticFiles(directory="../dashboard-prototype", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
