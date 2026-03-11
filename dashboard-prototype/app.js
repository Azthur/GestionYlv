// Interacciones Menu Movil
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.toggle('open');
    if (sidebar.classList.contains('open')) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

// Interacciones Modal
function openModal() {
    document.getElementById('productionModal').classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevenir scroll al abrir modal
}

function closeModal() {
    document.getElementById('productionModal').classList.remove('active');
    document.body.style.overflow = '';
}

// Cerrar modal al hacer clic en el overlay (afuera)
document.getElementById('productionModal').addEventListener('click', function (e) {
    if (e.target === this) {
        closeModal();
    }
});

// Cargar ordenes de produccion desde FastAPI
async function loadProductionOrders() {
    try {
        const response = await fetch('/api/production-orders');
        if (!response.ok) throw new Error('Error en API');
        const orders = await response.json();

        const tbody = document.getElementById('orders-tbody');
        tbody.innerHTML = '';

        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading-state">No hay órdenes de producción registradas.</td></tr>';
            return;
        }

        orders.forEach((order, index) => {
            let statusClass = 'planned'; // default
            if (order.status.includes('Proceso') || order.status.includes('Curso')) statusClass = 'progress';
            if (order.status.includes('Calidad') || order.status.includes('QA')) statusClass = 'qa';
            if (order.status.includes('Completado') || order.status.includes('Terminado')) statusClass = 'completed';

            const tr = document.createElement('tr');
            // Añadir un pequeño retraso en la animación para efecto en cascada
            tr.style.animation = `fadeIn 0.4s ease-out ${index * 0.05}s forwards`;
            tr.style.opacity = '0';

            tr.innerHTML = `
                <td><strong>OP-${new Date(order.created_at).getFullYear()}-${String(order.id).padStart(3, '0')}</strong></td>
                <td>${order.product_name || 'Producto Desconocido'}</td>
                <td><span class="badge lot">${order.final_batch_number}</span></td>
                <td>${order.sanitary_registry}</td>
                <td>${order.technical_director}</td>
                <td><span class="status ${statusClass}">${order.status}</span></td>
                <td><button class="btn-text">Ver Trazabilidad</button></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error al cargar ordenes:", error);
        const tbody = document.getElementById('orders-tbody');
        tbody.innerHTML = '<tr><td colspan="7" class="loading-state" style="color: var(--accent-hover) !important;">Error al cargar los datos. Verifique la conexión al servidor.</td></tr>';
    }
}

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    loadProductionOrders();
});
