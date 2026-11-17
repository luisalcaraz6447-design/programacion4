# Aura Tech Store — Proyecto 3 (Programación IV)

Sistema web Full-Stack para la gestión de inventario y análisis de ventas de una tienda de tecnología y periféricos, con persistencia en archivos planos (`CSV`), procesamiento analítico con **Pandas** y visualización dinámica mediante **Chart.js**.

## Stack Tecnológico
- **Backend:** Python, FastAPI, Uvicorn, Pandas
- **Persistencia:** Archivos CSV (`productos.csv` y `ventas.csv`)
- **Frontend:** HTML5, CSS3, Bootstrap 5, JavaScript (Fetch API), Chart.js

## Estructura del Proyecto
```text
├── main.py           # API REST con endpoints CRUD y analítica con Pandas
├── productos.csv     # Base de datos plana del catálogo e inventario
├── ventas.csv        # Historial persistente de transacciones
├── index.html        # Interfaz web y estructura del dashboard
├── app.js            # Consumo asíncrono de API y renderizado de Chart.js
└── README.md         # Documentación del proyecto