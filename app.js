const API_BASE = "http://127.0.0.1:8000";
const API_PRODUCTOS = `${API_BASE}/productos`;

// Elementos del DOM
const formProducto = document.getElementById("formProducto");
const tablaProductos = document.getElementById("tablaProductos");
const totalProductos = document.getElementById("totalProductos");
const alertaContainer = document.getElementById("alertaContainer");

// Instancias globales de Chart.js
let chartProductos = null;
let chartFechas = null;

// Utilidad para formatear moneda
function formatearMoneda(valor) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
    }).format(valor);
}

// Mostrar notificación temporal
function mostrarAlerta(mensaje, tipo = "success") {
    alertaContainer.innerHTML = `
        <div class="alert alert-${tipo} alert-dismissible fade show py-2" role="alert">
            ${mensaje}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
        </div>
    `;
    setTimeout(() => {
        alertaContainer.innerHTML = "";
    }, 3500);
}

// ==========================================
// 1. GESTIÓN DE INVENTARIO (CRUD CSV)
// ==========================================

async function cargarProductos() {
    try {
        const respuesta = await fetch(API_PRODUCTOS);
        const productos = await respuesta.json();

        tablaProductos.innerHTML = "";
        totalProductos.textContent = `${productos.length} productos`;

        if (productos.length === 0) {
            tablaProductos.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-secondary py-4">
                        No hay productos registrados en productos.csv.
                    </td>
                </tr>`;
            return;
        }

        productos.forEach((p) => {
            const sinStock = p.cantidad <= 0;
            const badgeClase = sinStock
                ? "bg-danger"
                : p.cantidad < 6
                ? "bg-warning text-dark"
                : "bg-success";

            const fila = document.createElement("tr");
            fila.innerHTML = `
                <td class="ps-3 fw-bold text-secondary">#${p.id}</td>
                <td class="fw-semibold">${p.nombre}</td>
                <td class="text-info fw-bold">${formatearMoneda(p.precio)}</td>
                <td>
                    <span class="badge ${badgeClase}">
                        ${p.cantidad} uds.
                    </span>
                </td>
                <td class="text-end pe-3">
                    <button class="btn btn-outline-info btn-sm me-1" 
                            onclick="comprarProducto(${p.id})" 
                            ${sinStock ? "disabled" : ""}>
                        <i class="bi bi-cart-plus"></i> Comprar
                    </button>
                    <button class="btn btn-outline-danger btn-sm" 
                            onclick="eliminarProducto(${p.id})">
                        <i class="bi bi-trash3"></i> Eliminar
                    </button>
                </td>
            `;
            tablaProductos.appendChild(fila);
        });
    } catch (error) {
        console.error("Error al cargar productos:", error);
        mostrarAlerta("No se pudo conectar con el servidor FastAPI.", "danger");
    }
}

async function agregarProducto(event) {
    event.preventDefault();

    const nombre = document.getElementById("nombre").value.trim();
    const precio = parseFloat(document.getElementById("precio").value);
    const cantidad = parseInt(document.getElementById("cantidad").value, 10);

    try {
        const respuesta = await fetch(API_PRODUCTOS, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre, precio, cantidad }),
        });

        if (respuesta.ok) {
            formProducto.reset();
            mostrarAlerta(`Producto "${nombre}" agregado a productos.csv.`, "success");
            await cargarProductos();
        } else {
            const err = await respuesta.json();
            mostrarAlerta(err.detail || "Error al guardar el producto.", "danger");
        }
    } catch (error) {
        console.error("Error al agregar producto:", error);
    }
}

async function comprarProducto(idProducto) {
    try {
        const respuesta = await fetch(`${API_PRODUCTOS}/${idProducto}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });

        const data = await respuesta.json();

        if (respuesta.ok) {
            mostrarAlerta(`${data.mensaje}. Stock restante: ${data.stock_restante}`, "info");
            // Actualizar tabla, KPIs y gráficas en tiempo real
            await actualizarTodo();
        } else {
            mostrarAlerta(data.detail || "No se pudo realizar la compra.", "warning");
        }
    } catch (error) {
        console.error("Error al comprar producto:", error);
    }
}

async function eliminarProducto(idProducto) {
    try {
        const respuesta = await fetch(`${API_PRODUCTOS}/${idProducto}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
        });

        const data = await respuesta.json();

        if (respuesta.ok) {
            mostrarAlerta(data.mensaje, "warning");
            await cargarProductos();
        } else {
            mostrarAlerta(data.detail || "No se pudo eliminar el producto.", "danger");
        }
    } catch (error) {
        console.error("Error al eliminar producto:", error);
    }
}

// ==========================================
// 2. DASHBOARD ANALÍTICO (KPIs + CHART.JS)
// ==========================================

async function cargarKPIs() {
    try {
        const respuesta = await fetch(`${API_BASE}/analitica/kpis`);
        const kpis = await respuesta.json();

        document.getElementById("kpiIngresos").textContent = formatearMoneda(kpis.ingresos_totales);
        document.getElementById("kpiEstrella").textContent = kpis.producto_estrella;
        document.getElementById("kpiTransacciones").textContent = kpis.total_transacciones;
        document.getElementById("kpiTicket").textContent = formatearMoneda(kpis.ticket_promedio);
    } catch (error) {
        console.error("Error al cargar KPIs:", error);
    }
}

async function renderizarGraficaProductos() {
    try {
        const respuesta = await fetch(`${API_BASE}/analitica/ventas-producto`);
        const datos = await respuesta.json();

        const etiquetas = datos.map((item) => item.producto);
        const valoresIngresos = datos.map((item) => item.ingresos);

        const ctx = document.getElementById("graficaProductos").getContext("2d");

        // Destruir instancia previa antes de volver a dibujar
        if (chartProductos) {
            chartProductos.destroy();
        }

        chartProductos = new Chart(ctx, {
            type: "bar",
            data: {
                labels: etiquetas,
                datasets: [
                    {
                        label: "Ingresos Acumulados ($ MXN)",
                        data: valoresIngresos,
                        backgroundColor: "rgba(56, 189, 248, 0.75)",
                        borderColor: "#38bdf8",
                        borderWidth: 1,
                        borderRadius: 6,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: "#f8fafc" } },
                },
                scales: {
                    x: {
                        ticks: { color: "#94a3b8", maxRotation: 25, minRotation: 0 },
                        grid: { color: "rgba(51, 65, 85, 0.4)" },
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: "#94a3b8" },
                        grid: { color: "rgba(51, 65, 85, 0.4)" },
                    },
                },
            },
        });
    } catch (error) {
        console.error("Error al renderizar gráfica de productos:", error);
    }
}

async function renderizarGraficaFechas() {
    try {
        const respuesta = await fetch(`${API_BASE}/analitica/ventas-fecha`);
        const datos = await respuesta.json();

        const fechas = datos.map((item) => item.fecha);
        const ingresos = datos.map((item) => item.ingresos);

        const ctx = document.getElementById("graficaFechas").getContext("2d");

        // Destruir instancia previa antes de volver a dibujar
        if (chartFechas) {
            chartFechas.destroy();
        }

        chartFechas = new Chart(ctx, {
            type: "line",
            data: {
                labels: fechas,
                datasets: [
                    {
                        label: "Ventas Diarias ($ MXN)",
                        data: ingresos,
                        borderColor: "#fbbf24",
                        backgroundColor: "rgba(251, 191, 36, 0.15)",
                        borderWidth: 3,
                        pointBackgroundColor: "#fbbf24",
                        pointRadius: 4,
                        fill: true,
                        tension: 0.3,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: "#f8fafc" } },
                },
                scales: {
                    x: {
                        ticks: { color: "#94a3b8" },
                        grid: { color: "rgba(51, 65, 85, 0.4)" },
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: "#94a3b8" },
                        grid: { color: "rgba(51, 65, 85, 0.4)" },
                    },
                },
            },
        });
    } catch (error) {
        console.error("Error al renderizar gráfica de fechas:", error);
    }
}

async function actualizarTodo() {
    await Promise.all([
        cargarProductos(),
        cargarKPIs(),
        renderizarGraficaProductos(),
        renderizarGraficaFechas(),
    ]);
}

// Inicialización
document.addEventListener("DOMContentLoaded", actualizarTodo);
formProducto.addEventListener("submit", agregarProducto);