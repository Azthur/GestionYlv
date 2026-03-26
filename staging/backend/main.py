from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pyodbc

from database import get_db_connection

app = FastAPI(title="YELAVE ERP API")

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
    if request.method == "GET" and any(request.url.path.endswith(ext) for ext in [".html", ".js", ".css"]):
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
