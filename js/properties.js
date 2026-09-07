// js/properties.js - Gestión de Inmuebles y Propiedades
const PropertiesAPI = {
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

    getProperties() { return this.request('/properties'); },
    createProperty(data) { return this.request('/properties', { method: 'POST', body: JSON.stringify(data) }); },
    updateProperty(data) { return this.request('/properties', { method: 'PUT', body: JSON.stringify(data) }); },
    deleteProperty(id) { return this.request(`/properties?id=${id}`, { method: 'DELETE' }); },
    getOwners() { return this.request('/owners'); }
};

let allProperties = [];
let allOwners = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. INICIALIZAR UI Y BOTONES INMEDIATAMENTE (sin esperar a la red)
    if (window.AppSidebar) AppSidebar.init();
    if (window.Breadcrumbs) Breadcrumbs.init();

    initModalEvents();
    initSearch();

    // 2. Cargar datos en segundo plano
    cargarDatos();
});

function initModalEvents() {
    const modal = document.getElementById('propertyModal');
    const addBtn = document.getElementById('addPropertyBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const form = document.getElementById('propertyForm');

    // Botón "Nueva Propiedad"
    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            abrirModalNuevaPropiedad();
        });
    }

    // Botón Cancelar/Cerrar
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (modal) modal.classList.add('hidden');
        });
    }

    // Cerrar si hace clic fuera del contenido
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('bg-opacity-75')) {
                modal.classList.add('hidden');
            }
        });
    }

    // Guardar formulario
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await guardarPropiedad();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    });
}

function initSearch() {
    const searchInput = document.getElementById('searchProperties');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        const filtradas = allProperties.filter(p => 
            (p.address && p.address.toLowerCase().includes(term)) ||
            (p.owner_name && p.owner_name.toLowerCase().includes(term)) ||
            (p.type && p.type.toLowerCase().includes(term))
        );
        renderizarTabla(filtradas);
    });
}

async function cargarDatos() {
    try {
        await cargarOwners();
        await cargarProperties();
    } catch (err) {
        console.error('Error cargando datos de propiedades:', err);
    }
}

async function cargarOwners() {
    try {
        allOwners = await PropertiesAPI.getOwners();
        const select = document.getElementById('propertyOwnerId');
        if (!select) return;

        if (!allOwners || allOwners.length === 0) {
            select.innerHTML = '<option value="">No hay propietarios registrados</option>';
            return;
        }

        select.innerHTML = '<option value="">Seleccionar propietario...</option>' +
            allOwners.map(o => `<option value="${o.id}">${AppUtils.escapeHtml(o.name)}</option>`).join('');
    } catch (e) {
        console.warn('No se pudieron cargar propietarios:', e);
    }
}

async function cargarProperties() {
    const tbody = document.getElementById('propertiesTableBody');
    try {
        allProperties = await PropertiesAPI.getProperties();
        renderizarTabla(allProperties);
    } catch (error) {
        console.error(error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-500">Error al cargar las propiedades.</td></tr>`;
        }
    }
}

function renderizarTabla(lista) {
    const tbody = document.getElementById('propertiesTableBody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-gray-400">
                    <i class="fas fa-building text-3xl mb-2 opacity-50"></i>
                    <p>No hay propiedades registradas</p>
                </td>
            </tr>
        `;
        return;
    }

    const estadoClases = {
        'disponible': 'badge-success',
        'alquilado': 'badge-info',
        'mantenimiento': 'badge-warning',
        'vendido': 'badge-danger'
    };

    tbody.innerHTML = lista.map(p => {
        const badgeClass = estadoClases[p.status] || 'badge-info';
        const tipoFormateado = (p.type || 'Inmueble').replace('_', ' ').toUpperCase();

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition border-b border-gray-100 dark:border-slate-800">
                <td class="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                    ${AppUtils.escapeHtml(p.address)}
                </td>
                <td class="px-6 py-4 text-xs font-semibold text-slate-500">${tipoFormateado}</td>
                <td class="px-6 py-4 text-slate-600 dark:text-slate-300">${AppUtils.escapeHtml(p.owner_name || 'N/A')}</td>
                <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${p.rooms || 0} hab. / ${p.bathrooms || 0} baños</td>
                <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${p.covered_area ? `${p.covered_area} m²` : '-'}</td>
                <td class="px-6 py-4">
                    <span class="badge ${badgeClass}">${p.status || 'disponible'}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-1">
                        <button onclick="editarPropiedad(${p.id})" class="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="eliminarPropiedad(${p.id})" class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition" title="Eliminar">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function abrirModalNuevaPropiedad() {
    const modal = document.getElementById('propertyModal');
    const form = document.getElementById('propertyForm');
    const title = document.getElementById('modalTitle');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('propertyId').value = '';
    if (title) title.textContent = 'Nueva Propiedad';
    document.getElementById('propertyStatus').value = 'disponible';
    document.getElementById('propertyType').value = 'departamento';

    modal.classList.remove('hidden');
}

function editarPropiedad(id) {
    const p = allProperties.find(item => item.id === id);
    if (!p) return;

    const modal = document.getElementById('propertyModal');
    const form = document.getElementById('propertyForm');
    const title = document.getElementById('modalTitle');
    if (!modal || !form) return;

    form.reset();
    if (title) title.textContent = 'Editar Propiedad';

    document.getElementById('propertyId').value = p.id;
    document.getElementById('propertyAddress').value = p.address || '';
    document.getElementById('propertyOwnerId').value = p.owner_id || '';
    document.getElementById('propertyType').value = p.type || 'departamento';
    document.getElementById('propertyRooms').value = p.rooms || 0;
    document.getElementById('propertyBathrooms').value = p.bathrooms || 0;
    document.getElementById('propertyCoveredArea').value = p.covered_area || '';
    document.getElementById('propertyUncoveredArea').value = p.uncovered_area || '';
    document.getElementById('propertyStatus').value = p.status || 'disponible';
    document.getElementById('propertyDescription').value = p.description || '';

    modal.classList.remove('hidden');
}

async function guardarPropiedad() {
    const id = document.getElementById('propertyId').value;
    const address = document.getElementById('propertyAddress').value.trim();
    const owner_id = document.getElementById('propertyOwnerId').value;
    const type = document.getElementById('propertyType').value;
    const rooms = parseInt(document.getElementById('propertyRooms').value) || 0;
    const bathrooms = parseInt(document.getElementById('propertyBathrooms').value) || 0;
    const covered_area = parseFloat(document.getElementById('propertyCoveredArea').value) || 0;
    const uncovered_area = parseFloat(document.getElementById('propertyUncoveredArea').value) || 0;
    const status = document.getElementById('propertyStatus').value;
    const description = document.getElementById('propertyDescription').value.trim();

    if (!address || !owner_id) {
        UI.toast('Dirección y Propietario son obligatorios', 'warning');
        return;
    }

    const payload = {
        address,
        owner_id: parseInt(owner_id),
        type,
        rooms,
        bathrooms,
        covered_area,
        uncovered_area,
        status,
        description
    };

    try {
        if (id) {
            payload.id = parseInt(id);
            await PropertiesAPI.updateProperty(payload);
            UI.toast('Propiedad actualizada con éxito', 'success');
        } else {
            await PropertiesAPI.createProperty(payload);
            UI.toast('Propiedad creada con éxito', 'success');
        }

        document.getElementById('propertyModal').classList.add('hidden');
        await cargarProperties();
    } catch (e) {
        UI.toast(e.message || 'Error al guardar la propiedad', 'error');
    }
}

async function eliminarPropiedad(id) {
    if (!confirm('¿Estás seguro de eliminar esta propiedad?')) return;

    try {
        await PropertiesAPI.deleteProperty(id);
        UI.toast('Propiedad eliminada', 'success');
        await cargarProperties();
    } catch (err) {
        UI.toast(err.message || 'Error al eliminar propiedad', 'error');
    }
}

// Exponer al scope global para botones inline
window.abrirModalNuevaPropiedad = abrirModalNuevaPropiedad;
window.editarPropiedad = editarPropiedad;
window.eliminarPropiedad = eliminarPropiedad;