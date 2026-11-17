"""
Título: Aura Tech Store - API Full-Stack con Persistencia CSV y Analítica
Autor: Diego Ayala
Descripción: Gestión de inventario, registro de ventas en CSV y métricas con Pandas.
"""

import asyncio
import csv
import os
from datetime import datetime
import pandas as pd
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="API Aura Tech Store", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

lock = asyncio.Lock()

ARCHIVO_PRODUCTOS = "productos.csv"
ARCHIVO_VENTAS = "ventas.csv"
CAMPOS_PRODUCTOS = ["id", "nombre", "precio", "cantidad"]
CAMPOS_VENTAS = ["fecha", "producto", "precio", "cantidad", "total"]


# Modelos de Pydantic
class CrearProducto(BaseModel):
    nombre: str = Field(..., min_length=1, description="Nombre del producto")
    precio: float = Field(..., gt=0, description="Precio del producto")
    cantidad: int = Field(..., ge=0, description="Stock disponible")


class RespuestaProducto(BaseModel):
    id: int
    nombre: str
    precio: float
    cantidad: int


# Funciones auxiliares de persistencia CSV
def inicializar_archivos():
    if not os.path.exists(ARCHIVO_PRODUCTOS):
        with open(ARCHIVO_PRODUCTOS, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CAMPOS_PRODUCTOS)
            writer.writeheader()

    if not os.path.exists(ARCHIVO_VENTAS):
        with open(ARCHIVO_VENTAS, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CAMPOS_VENTAS)
            writer.writeheader()


def leer_productos() -> list[dict]:
    inicializar_archivos()
    productos = []
    with open(ARCHIVO_PRODUCTOS, mode="r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for fila in reader:
            productos.append({
                "id": int(fila["id"]),
                "nombre": fila["nombre"],
                "precio": float(fila["precio"]),
                "cantidad": int(fila["cantidad"]),
            })
    return productos


def guardar_productos(productos: list[dict]):
    with open(ARCHIVO_PRODUCTOS, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CAMPOS_PRODUCTOS)
        writer.writeheader()
        writer.writerows(productos)


def registrar_venta(producto: str, precio: float, cantidad: int):
    inicializar_archivos()
    fecha_actual = datetime.now().strftime("%Y-%m-%d")
    total = round(precio * cantidad, 2)
    with open(ARCHIVO_VENTAS, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CAMPOS_VENTAS)
        writer.writerow({
            "fecha": fecha_actual,
            "producto": producto,
            "precio": precio,
            "cantidad": cantidad,
            "total": total,
        })


@app.on_event("startup")
def startup_event():
    inicializar_archivos()


@app.get("/")
def home():
    return {"message": "API de Aura Tech Store operativa con persistencia CSV"}


# ==========================================
# ENDPOINTS CRUD CON PERSISTENCIA EN CSV
# ==========================================

@app.get("/productos", response_model=list[RespuestaProducto])
def get_productos():
    try:
        return leer_productos()
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al leer el inventario: {str(error)}",
        )


@app.post("/productos", response_model=RespuestaProducto, status_code=status.HTTP_201_CREATED)
async def add_producto(producto: CrearProducto):
    try:
        async with lock:
            productos = leer_productos()
            nuevo_id = max((p["id"] for p in productos), default=0) + 1
            nuevo_producto = {
                "id": nuevo_id,
                "nombre": producto.nombre.strip(),
                "precio": round(producto.precio, 2),
                "cantidad": producto.cantidad,
            }
            productos.append(nuevo_producto)
            guardar_productos(productos)
            return nuevo_producto
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al agregar el producto: {str(error)}",
        )


@app.post("/productos/{producto_id}")
async def comprar_producto(producto_id: int):
    try:
        async with lock:
            productos = leer_productos()
            for item in productos:
                if item["id"] == producto_id:
                    if item["cantidad"] > 0:
                        item["cantidad"] -= 1
                        guardar_productos(productos)
                        registrar_venta(item["nombre"], item["precio"], 1)
                        return {
                            "mensaje": f"Compra registrada: {item['nombre']}",
                            "stock_restante": item["cantidad"],
                        }
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="No hay stock disponible de este producto",
                        )

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No existe el ID de ese producto",
            )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar la compra: {str(error)}",
        )


@app.delete("/productos/{producto_id}")
async def delete_producto(producto_id: int):
    try:
        async with lock:
            productos = leer_productos()
            productos_filtrados = [p for p in productos if p["id"] != producto_id]

            if len(productos_filtrados) == len(productos):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Producto no encontrado para eliminar",
                )

            guardar_productos(productos_filtrados)
            return {"mensaje": "Producto eliminado correctamente del archivo CSV"}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al eliminar el producto: {str(error)}",
        )


# ==========================================
# ENDPOINTS ANALÍTICOS CON PANDAS
# ==========================================

@app.get("/analitica/kpis")
def obtener_kpis():
    inicializar_archivos()
    try:
        df = pd.read_csv(ARCHIVO_VENTAS)
        if df.empty:
            return {
                "ingresos_totales": 0.0,
                "total_transacciones": 0,
                "unidades_vendidas": 0,
                "ticket_promedio": 0.0,
                "producto_estrella": "Sin ventas aún",
            }

        ingresos_totales = float(df["total"].sum())
        total_transacciones = int(len(df))
        unidades_vendidas = int(df["cantidad"].sum())
        ticket_promedio = float(df["total"].mean())

        agrupado_producto = df.groupby("producto")["cantidad"].sum()
        producto_estrella = str(agrupado_producto.idxmax())

        return {
            "ingresos_totales": round(ingresos_totales, 2),
            "total_transacciones": total_transacciones,
            "unidades_vendidas": unidades_vendidas,
            "ticket_promedio": round(ticket_promedio, 2),
            "producto_estrella": producto_estrella,
        }
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al calcular KPIs: {str(error)}",
        )


@app.get("/analitica/ventas-producto")
def ventas_por_producto():
    inicializar_archivos()
    try:
        df = pd.read_csv(ARCHIVO_VENTAS)
        if df.empty:
            return []

        resumen = (
            df.groupby("producto", as_index=False)
            .agg(unidades=("cantidad", "sum"), ingresos=("total", "sum"))
            .sort_values(by="ingresos", ascending=False)
        )
        return resumen.to_dict(orient="records")
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al agrupar ventas por producto: {str(error)}",
        )


@app.get("/analitica/ventas-fecha")
def ventas_por_fecha():
    inicializar_archivos()
    try:
        df = pd.read_csv(ARCHIVO_VENTAS)
        if df.empty:
            return []

        evolucion = (
            df.groupby("fecha", as_index=False)
            .agg(ingresos=("total", "sum"), transacciones=("cantidad", "count"))
            .sort_values(by="fecha", ascending=True)
        )
        return evolucion.to_dict(orient="records")
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al agrupar ventas por fecha: {str(error)}",
        )