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

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# Mount static files to serve the frontend prototype
app.mount("/dashboard", StaticFiles(directory="../dashboard-prototype", html=True), name="dashboard")

@app.get("/")
def read_root():
    # Redirigir la raiz al dashboard
    return RedirectResponse(url="/dashboard")

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
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
