import os

path = r'c:\SistemaGestionyelave\dashboard-prototype\users.js'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# I will rewrite the loadUsers function to be more robust.
# The previous version was missing the appendChild and had some logical flaws with DT initialization.

new_load_users = """
async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    
    try {
        const token = localStorage.getItem('yelave_token');
        const res = await fetch('/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            if (res.status === 401) return logout();
            if (res.status === 403) { window.location.href = 'index.html'; return; }
            throw new Error('Error de servidor');
        }
        
        const users = await res.json();
        
        // 1. CLEAR THE DOM TBODY COMPLETELY before DT initialization to avoid "Incorrect column count"
        // DataTables hates seeing that "Cargando..." row with colspan=7 when it expects 7 columns.
        tbody.innerHTML = '';

        // 2. Initialize or Clear DataTable
        if (!dtInstance) {
            dtInstance = $('#usersTable').DataTable({
                language: {
                    url: 'https://cdn.datatables.net/plug-ins/1.13.8/i18n/es-ES.json',
                    search: "Buscar en todo el directorio:",
                    zeroRecords: "No se encontraron usuarios coincidentes",
                    info: "Mostrando _START_ a _END_ de _TOTAL_ usuarios",
                    infoFiltered: "(filtrado de _MAX_ registros totales)"
                },
                pageLength: 10,
                responsive: true,
                dom: '<"dt-top-actions"Bf>rtip',
                buttons: [
                    {
                        extend: 'excelHtml5',
                        text: 'Exportar a Excel',
                        className: 'btn btn-outline',
                        title: 'Directorio de Usuarios - YELAVE',
                        exportOptions: { columns: [0, 1, 2, 3, 4, 5] }
                    }
                ],
                columns: [
                    { data: 'login', render: (data) => `<strong>${data}</strong>` },
                    { data: 'nombre', render: (data) => data || '<span style="color:#9ca3af;font-style:italic">No definido</span>' },
                    { data: 'correo', render: (data) => data || '-' },
                    { data: 'celular', render: (data) => data || '-' },
                    { 
                        data: 'rol', 
                        render: (data) => {
                            if (data === 'ADMIN') return '<span class="badge admin">ADMIN</span>';
                            if (data === 'LOGISTICA') return '<span class="badge" style="background:#FEF3C7; color:#92400E;">LOGISTICA</span>';
                            if (data === 'CONTROL_INTERNO') return '<span class="badge" style="background:#E0F2FE; color:#0369A1;">CONTROL_INTERNO</span>';
                            return `<span class="badge user">${data || 'USER'}</span>`;
                        }
                    },
                    { 
                        data: 'activo', 
                        render: (data) => data ? '<span class="badge active">Activo</span>' : '<span class="badge inactive">Inactivo</span>'
                    },
                    {
                        data: null,
                        orderable: false,
                        render: (data, type, row) => {
                            const safeLogin = (row.login || '').replace(/'/g, "\\'");
                            const safeNombre = (row.nombre || '').replace(/'/g, "\\'");
                            const safeCorreo = (row.correo || '').replace(/'/g, "\\'");
                            const safeCel = (row.celular || '').replace(/'/g, "\\'");
                            const safeRol = (row.rol || 'USER').replace(/'/g, "\\'");
                            
                            return `
                                <button class="btn-text" onclick="openEditModal('${safeLogin}', '${safeNombre}', '${safeCorreo}', '${safeCel}', '${safeRol}', ${row.activo})" style="margin-right:0.5rem">Editar</button>
                                <button class="btn-text" onclick="openPwdModal('${safeLogin}')" style="color:var(--danger)">Reset</button>
                            `;
                        }
                    }
                ]
            });
        }

        // 3. Populate Data using DataTables API (Global Search Support)
        dtInstance.clear();
        dtInstance.rows.add(users);
        dtInstance.draw();

        console.log("DataTable indexado con", users.length, "usuarios.");

    } catch (err) {
        console.error("Error cargando usuarios:", err);
        tbody.innerHTML = `<tr><td colspan="7" class="loading-state" style="color:var(--danger)">${err.message}</td></tr>`;
    }
}
"""

import re
content = re.sub(r'async function loadUsers\(\) {.*?^}', new_load_users, content, flags=re.DOTALL | re.MULTILINE)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("users.js fixed for column count and global search")
