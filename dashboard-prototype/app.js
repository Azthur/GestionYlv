// Auth Guard y Manejo de Sesión
function checkAuth() {
    const token = localStorage.getItem('yelave_token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    
    try {
        const user = JSON.parse(localStorage.getItem('yelave_user'));
        return user;
    } catch (e) {
        window.location.href = 'login.html';
        return null;
    }
}

function renderUserInfo(user) {
    if (!user) return;
    const nameEl = document.getElementById('userNameDisplay');
    const roleEl = document.getElementById('userRoleDisplay');
    const avatarEl = document.getElementById('userAvatar');
    
    if (nameEl) nameEl.textContent = user.nombre || user.login;
    
    // Role display
    let roleLabel = 'Consultor';
    if (user.login === '71941916JL' || user.rol === 'ADMIN') {
        roleLabel = 'Administrador';
    } else if (user.rol) {
        roleLabel = user.rol;
    }
    if (roleEl) roleEl.textContent = roleLabel;
    
    if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nombre || user.login)}&background=2b3954&color=fff`;

    // Access Control (Superuser or Admin)
    const currentLogin = String(user.login || '').trim().toUpperCase();
    const isSuperuser = currentLogin === '71941916JL' || currentLogin.includes('71941916JL');
    const isAdmin = String(user.rol || '').trim().toUpperCase() === 'ADMIN';
    const userRol = String(user.rol || '').trim().toUpperCase();

    if (isSuperuser || isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
    }

    // Role-based navigation visibility
    document.querySelectorAll('.nav-item, .nav-group').forEach(el => {
        const href = (el.getAttribute('href') || '').toLowerCase();
        
        // Dashboard and Profile are always visible
        if (href.includes('index.html') || href.includes('profile.html')) {
            el.style.display = 'flex';
            return;
        }

        let isVisible = false;

        if (isSuperuser || isAdmin) {
            isVisible = true;
        } else if (userRol === 'LOGISTICA') {
            if (href.includes('orders.html')) isVisible = true;
        } else if (userRol === 'CONTROL_INTERNO') {
            if (href.includes('conciliacion.html')) isVisible = true;
        }
        // Others (USER or empty) only see index/profile (already handled above)

        if (!isVisible) {
            el.style.display = 'none';
        }
    });

    // Handle nav groups (Finanzas, Sistema)
    document.querySelectorAll('.nav-group').forEach(group => {
        const visibleItems = Array.from(group.querySelectorAll('.nav-item')).filter(item => item.style.display !== 'none');
        if (visibleItems.length === 0) {
            group.style.display = 'none';
        } else {
            group.style.display = 'block';
        }
    });
}

function logout() {
    localStorage.removeItem('yelave_token');
    localStorage.removeItem('yelave_user');
    window.location.href = 'login.html';
}

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
    const user = checkAuth();
    if (user) {
        renderUserInfo(user);
        loadProductionOrders(localStorage.getItem('yelave_token'));
    }
});
