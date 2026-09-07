// js/tenants.js - Gestión de Inquilinos
const TenantsAPI = {
    baseUrl: '/.netlify/functions',

    async request(endpoint, options = {}) {
        const token = sessionStorage.getItem('authToken');
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': token }),
            ...options.headers
        };

        const res = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });
        if (res.status === 401) {
            window.location.href = '/login.html';
            throw new Error('Sesión expirada');
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || 'Error en la petición');
        }
        return res.json();
    },

    getTenants() { return this.request('/tenants'); },
    createTenant(data) { return this.request('/tenants', { method: 'POST', body: JSON.stringify(data) }); },
    updateTenant(data) { return this.request('/tenants', { method: 'PUT', body: JSON.stringify(data) }); },
    deleteTenant(id) { return this.request(`/tenants?id=${id}`, { method: 'DELETE' }); }
};

let allTenants = [];

document.addEventListener('DOMContentLoaded', () => {
    if (window.AppSidebar) AppSidebar.init();
    if (window.Breadcrumbs) Breadcrumbs.init();

    // Inicializar listeners inmediatamente
    initModalEvents();
    initSearch();

    // Cargar datos
    cargarTenants();
});

function initModalEvents() {
    const modal = document.getElementById('tenantModal');
    const addBtn = document.getElementById('addTenantBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const form = document.getElementById('tenantForm');

    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            abrirModalNuevoInquilino();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (modal) modal.classList.add('hidden');
        });
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('bg-opacity-75')) {
                modal.classList.add('hidden');
            }
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await guardarInquilino();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    });
}

function initSearch() {
    const searchInput = document.getElementById('searchTenants');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        const filtrados = allTenants.filter(t => 
            (t.name && t.name.toLowerCase().includes(term)) ||
            (t.dni && t.dni.toLowerCase().includes(term)) ||
            (t.email && t.email.toLowerCase().includes(term)) ||
            (t.phone && t.phone.toLowerCase().includes(term))
        );
        renderizarTablaTenants(filtrados);
    });
}

async function cargarTenants() {
    const tbody = document.getElementById('tenantsTableBody');
    try {
        UI.showLoading('tenantsTableBody', 'Cargando inquilinos...');
        allTenants = await TenantsAPI.getTenants();
        renderizarTablaTenants(allTenants);
    } catch (error) {
        console.error(error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-red-500">Error al cargar inquilinos</td></tr>`;
        }
    } finally {
        UI.hideLoading('tenantsTableBody');
    }
}

function renderizarTablaTenants(lista) {
    const tbody = document.getElementById('tenantsTableBody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-8 text-center text-gray-400">
                    <i class="fas fa-users text-3xl mb-2 opacity-50"></i>
                    <p>No hay inquilinos registrados</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = lista.map(t => `
        <tr class="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition border-b border-gray-100 dark:border-slate-800">
            <td class="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">${AppUtils.escapeHtml(t.dni || '-')}</td>
            <td class="px-6 py-4 font-bold text-slate-900 dark:text-white">${AppUtils.escapeHtml(t.name)}</td>
            <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${AppUtils.escapeHtml(t.email || '-')}</td>
            <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${AppUtils.escapeHtml(t.phone || '-')}</td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-1">
                    <button onclick="editarInquilino(${t.id})" class="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="eliminarInquilino(${t.id})" class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition" title="Eliminar">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function abrirModalNuevoInquilino() {
    const modal = document.getElementById('tenantModal');
    const form = document.getElementById('tenantForm');
    const title = document.getElementById('modalTitle');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('tenantId').value = '';
    if (title) title.textContent = 'Nuevo Inquilino';

    modal.classList.remove('hidden');
}

function editarInquilino(id) {
    const t = allTenants.find(item => item.id === id);
    if (!t) return;

    const modal = document.getElementById('tenantModal');
    const title = document.getElementById('modalTitle');
    if (!modal) return;

    document.getElementById('tenantId').value = t.id;
    document.getElementById('tenantDni').value = t.dni || '';
    document.getElementById('tenantName').value = t.name || '';
    document.getElementById('tenantEmail').value = t.email || '';
    document.getElementById('tenantPhone').value = t.phone || '';
    document.getElementById('tenantAddress').value = t.address || '';

    if (title) title.textContent = 'Editar Inquilino';
    modal.classList.remove('hidden');
}

async function guardarInquilino() {
    const id = document.getElementById('tenantId').value;
    const dni = document.getElementById('tenantDni').value.trim();
    const name = document.getElementById('tenantName').value.trim();
    const email = document.getElementById('tenantEmail').value.trim();
    const phone = document.getElementById('tenantPhone').value.trim();
    const address = document.getElementById('tenantAddress').value.trim();

    if (!name) {
        UI.toast('El nombre es obligatorio', 'warning');
        return;
    }

    const payload = { dni, name, email, phone, address };

    try {
        if (id) {
            payload.id = parseInt(id);
            await TenantsAPI.updateTenant(payload);
            UI.toast('Inquilino actualizado con éxito', 'success');
        } else {
            await TenantsAPI.createTenant(payload);
            UI.toast('Inquilino registrado con éxito', 'success');
        }

        document.getElementById('tenantModal').classList.add('hidden');
        await cargarTenants();
    } catch (e) {
        UI.toast(e.message || 'Error al procesar inquilino', 'error');
    }
}

async function eliminarInquilino(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este inquilino?')) return;

    try {
        await TenantsAPI.deleteTenant(id);
        UI.toast('Inquilino eliminado', 'success');
        await cargarTenants();
    } catch (err) {
        UI.toast(err.message || 'No se pudo eliminar el inquilino', 'error');
    }
}

window.abrirModalNuevoInquilino = abrirModalNuevoInquilino;
window.editarInquilino = editarInquilino;
window.eliminarInquilino = eliminarInquilino;