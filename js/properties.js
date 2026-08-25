// properties.js - Gestión de Propiedades (VERSIÓN CORREGIDA)
const API = {
    baseUrl: '/.netlify/functions',

    async request(endpoint, options = {}) {
        const token = sessionStorage.getItem('authToken');

        const isGet = !options.method || options.method === 'GET';
        if (isGet) {
            const cached = window.APICache ? window.APICache.get(endpoint, options) : null;
            if (cached) {
                return cached;
            }
        }

        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': token }),
            ...options.headers
        };

        try {
            console.log(`🌐 Llamando a ${endpoint}...`);
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...options,
                headers
            });

            if (response.status === 401) {
                sessionStorage.removeItem('authToken');
                sessionStorage.removeItem('user');
                if (window.UI) UI.toast('Sesión expirada', 'warning');
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 1500);
                throw new Error('Sesión expirada');
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error en la petición');
            }

            if (isGet && window.APICache) {
                window.APICache.set(endpoint, data, options);
            }

            return data;
        } catch (error) {
            console.error('❌ API Error:', error);
            throw error;
        }
    },

    async getProperties() {
        return this.request('/properties');
    },

    async createProperty(property) {
        return this.request('/properties', {
            method: 'POST',
            body: JSON.stringify(property)
        });
    },

    async updateProperty(property) {
        return this.request('/properties', {
            method: 'PUT',
            body: JSON.stringify(property)
        });
    },

    async deleteProperty(id) {
        return this.request(`/properties?id=${id}`, {
            method: 'DELETE'
        });
    },

    async getOwners() {
        return this.request('/owners');
    }
};

// Estado global
let currentProperties = [];
let currentOwners = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let filteredProperties = [];
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🏢 Página de propiedades cargada');

    const token = sessionStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    AppSidebar.init();
    initModals();
    initSearch();

    // Crear contenedor de paginación
    if (!document.getElementById('propertiesPagination')) {
        const tableContainer = document.querySelector('.bg-white.rounded-xl.shadow-sm.border.border-gray-100.overflow-hidden');
        if (tableContainer) {
            const paginationDiv = document.createElement('div');
            paginationDiv.id = 'propertiesPagination';
            paginationDiv.className = 'flex justify-between items-center px-6 py-3 bg-gray-50 border-t border-gray-200';
            tableContainer.appendChild(paginationDiv);
        }
    }

    await loadOwners();
    await loadProperties();

    const addBtn = document.getElementById('addPropertyBtn');
    if (addBtn) {
        if (!AUTH.hasPermission('canCreate')) {
            addBtn.style.display = 'none';
        }
        addBtn.addEventListener('click', () => {
            abrirModalNuevoPropiedad();
        });
    }
});

function initSearch() {
    const searchInput = document.getElementById('searchProperties');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filtrarPropiedades(e.target.value);
        }, 300);
    });
}

function initModals() {
    const modal = document.getElementById('propertyModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const form = document.getElementById('propertyForm');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await guardarPropiedad();
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

// ============================================
// CARGAR DATOS
// ============================================

async function loadOwners() {
    try {
        currentOwners = await API.getOwners();
        populateOwnerSelect();
    } catch (error) {
        console.error('Error cargando propietarios:', error);
        currentOwners = [];
        populateOwnerSelect();
    }
}

function populateOwnerSelect() {
    const select = document.getElementById('propertyOwnerId');
    if (!select) return;

    if (!currentOwners || currentOwners.length === 0) {
        select.innerHTML = '<option value="">No hay propietarios disponibles</option>';
        return;
    }

    select.innerHTML = '<option value="">Seleccionar propietario...</option>' +
        currentOwners.map(o => `<option value="${o.id}">${AppUtils.escapeHtml(o.name)}</option>`).join('');
}

async function loadProperties() {
    const tableBody = document.getElementById('propertiesTableBody');
    if (!tableBody) return;

    try {
        UI.showLoading('propertiesTableBody', 'Cargando propiedades...');
        
        const properties = await API.getProperties();
        currentProperties = properties || [];
        filteredProperties = [...currentProperties];
        currentPage = 1;
        renderizarPropiedadesPaginado();
    } catch (error) {
        console.error('Error cargando propiedades:', error);
        UI.toast('Error al cargar las propiedades: ' + error.message, 'error');
        currentProperties = [];
        filteredProperties = [];
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-exclamation-circle text-3xl mb-3 text-red-400"></i>
                    <p>Error al cargar las propiedades</p>
                    <button onclick="loadProperties()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                        <i class="fas fa-sync-alt mr-1"></i>Reintentar
                    </button>
                </td>
            </tr>
        `;
    } finally {
        UI.hideLoading('propertiesTableBody');
    }
}

// ============================================
// PAGINACIÓN
// ============================================

function renderizarPropiedadesPaginado() {
    const totalItems = filteredProperties.length;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageItems = filteredProperties.slice(start, end);

    renderizarTablaPropiedades(pageItems);
    renderPaginationProperties(totalItems, totalPages);
}

function renderizarTablaPropiedades(properties) {
    const tbody = document.getElementById('propertiesTableBody');
    if (!tbody) return;

    if (!properties || properties.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-building text-4xl mb-3 opacity-50"></i>
                    <p>No hay propiedades registradas</p>
                    ${AUTH.hasPermission('canCreate') ? `<button onclick="abrirModalNuevoPropiedad()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                        <i class="fas fa-plus mr-1"></i>Crear la primera
                    </button>` : ''}
                </td>
            </tr>
        `;
        return;
    }

    const canEdit = AUTH.hasPermission('canEdit');
    const canDelete = AUTH.hasPermission('canDelete');

    const statusMap = {
        'disponible': { label: 'Disponible', class: 'badge-success' },
        'alquilado': { label: 'Alquilado', class: 'badge-info' },
        'mantenimiento': { label: 'Mantenimiento', class: 'badge-warning' },
        'vendido': { label: 'Vendido', class: 'badge-danger' }
    };

    const typeMap = {
        'casa': 'Casa',
        'departamento': 'Departamento',
        'local_comercial': 'Local Comercial',
        'oficina': 'Oficina',
        'terreno': 'Terreno',
        'otro': 'Otro'
    };

    tbody.innerHTML = properties.map(prop => {
        const status = statusMap[prop.status] || { label: prop.status, class: 'badge-info' };
        const type = typeMap[prop.type] || prop.type;

        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-6 py-4 font-medium">${AppUtils.escapeHtml(prop.address)}</td>
                <td class="px-6 py-4">${type}</td>
                <td class="px-6 py-4">${prop.owner_name ? AppUtils.escapeHtml(prop.owner_name) : '-'}</td>
                <td class="px-6 py-4 text-center">${prop.rooms || 0}</td>
                <td class="px-6 py-4 text-center">${prop.covered_area ? prop.covered_area : '-'}</td>
                <td class="px-6 py-4">
                    <span class="badge ${status.class}">${status.label}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex gap-2">
                        ${canEdit ? `<button onclick="editarPropiedad(${prop.id})" class="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition" title="Editar propiedad" aria-label="Editar propiedad ${AppUtils.escapeHtml(prop.address)}"><i class="fas fa-edit"></i></button>` : ''}
                        ${canDelete ? `<button onclick="eliminarPropiedad(${prop.id})" class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition" title="Eliminar propiedad" aria-label="Eliminar propiedad ${AppUtils.escapeHtml(prop.address)}"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPaginationProperties(totalItems, totalPages) {
    const container = document.getElementById('propertiesPagination');
    if (!container) return;

    if (totalItems === 0) {
        container.innerHTML = '';
        return;
    }

    const startItem = (currentPage - 1) * PAGE_SIZE + 1;
    const endItem = Math.min(currentPage * PAGE_SIZE, totalItems);

    container.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-3 w-full">
            <div class="text-sm text-gray-600">
                Mostrando <span class="font-medium">${startItem}</span> - <span class="font-medium">${endItem}</span> de <span class="font-medium">${totalItems}</span> propiedades
            </div>
            <div class="flex items-center gap-2">
                <button onclick="irPaginaProperties(${currentPage - 1})" 
                        class="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${currentPage === 1 ? 'disabled' : ''}
                        aria-label="Página anterior">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="text-sm font-medium px-3 py-1 bg-blue-100 text-blue-700 rounded-lg">${currentPage} / ${totalPages}</span>
                <button onclick="irPaginaProperties(${currentPage + 1})" 
                        class="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${currentPage === totalPages ? 'disabled' : ''}
                        aria-label="Página siguiente">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

function irPaginaProperties(page) {
    const totalPages = Math.ceil(filteredProperties.length / PAGE_SIZE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderizarPropiedadesPaginado();
}

// ============================================
// BÚSQUEDA
// ============================================

function filtrarPropiedades(searchTerm) {
    if (!searchTerm.trim()) {
        filteredProperties = [...currentProperties];
    } else {
        const term = searchTerm.toLowerCase().trim();
        filteredProperties = currentProperties.filter(prop =>
            prop.address.toLowerCase().includes(term) ||
            (prop.owner_name && prop.owner_name.toLowerCase().includes(term)) ||
            (prop.type && prop.type.toLowerCase().includes(term))
        );
    }
    currentPage = 1;
    renderizarPropiedadesPaginado();

    if (filteredProperties.length === 0) {
        const tbody = document.getElementById('propertiesTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                        <i class="fas fa-search text-3xl mb-3 opacity-50"></i>
                        <p>No se encontraron resultados para "${AppUtils.escapeHtml(searchTerm)}"</p>
                        <button onclick="document.getElementById('searchProperties').value = ''; filtrarPropiedades('');" 
                                class="mt-3 text-blue-600 hover:text-blue-800">
                            <i class="fas fa-times mr-1"></i>Limpiar búsqueda
                        </button>
                    </td>
                </tr>
            `;
            const pagContainer = document.getElementById('propertiesPagination');
            if (pagContainer) pagContainer.innerHTML = '';
        }
    }
}

// ============================================
// MODAL - NUEVA/EDITAR PROPIEDAD
// ============================================

function abrirModalNuevoPropiedad() {
    const modal = document.getElementById('propertyModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('propertyForm');

    form.reset();
    document.getElementById('propertyId').value = '';
    title.textContent = 'Nueva Propiedad';
    UI.clearAllFieldErrors(form);

    document.getElementById('propertyRooms').value = 0;
    document.getElementById('propertyBathrooms').value = 0;
    document.getElementById('propertyStatus').value = 'disponible';
    document.getElementById('propertyType').value = 'casa';

    modal.classList.remove('hidden');
}

function abrirModalEditarPropiedad(propertyId) {
    const property = currentProperties.find(p => p.id === propertyId);
    if (!property) {
        UI.toast('Propiedad no encontrada', 'error');
        return;
    }

    const modal = document.getElementById('propertyModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('propertyForm');

    UI.clearAllFieldErrors(form);

    title.textContent = 'Editar Propiedad';
    document.getElementById('propertyId').value = property.id;
    document.getElementById('propertyAddress').value = property.address || '';
    document.getElementById('propertyOwnerId').value = property.owner_id || '';
    document.getElementById('propertyType').value = property.type || 'casa';
    document.getElementById('propertyRooms').value = property.rooms || 0;
    document.getElementById('propertyBathrooms').value = property.bathrooms || 0;
    document.getElementById('propertyCoveredArea').value = property.covered_area || '';
    document.getElementById('propertyUncoveredArea').value = property.uncovered_area || '';
    document.getElementById('propertyStatus').value = property.status || 'disponible';
    document.getElementById('propertyDescription').value = property.description || '';

    modal.classList.remove('hidden');
}

// ============================================
// GUARDAR PROPIEDAD CON VALIDACIONES
// ============================================

async function guardarPropiedad() {
    const form = document.getElementById('propertyForm');
    UI.clearAllFieldErrors(form);

    const addressInput = document.getElementById('propertyAddress');
    const ownerIdInput = document.getElementById('propertyOwnerId');
    const typeInput = document.getElementById('propertyType');
    const statusInput = document.getElementById('propertyStatus');

    let isValid = true;

    if (!UI.validateField(addressInput, null, null)) {
        isValid = false;
    }

    if (!ownerIdInput.value) {
        UI.showFieldError(ownerIdInput, 'Debes seleccionar un propietario');
        isValid = false;
    }

    if (!typeInput.value) {
        UI.showFieldError(typeInput, 'Debes seleccionar un tipo');
        isValid = false;
    }

    if (!statusInput.value) {
        UI.showFieldError(statusInput, 'Debes seleccionar un estado');
        isValid = false;
    }

    if (!isValid) return;

    const propertyData = {
        address: addressInput.value.trim(),
        owner_id: parseInt(ownerIdInput.value),
        type: typeInput.value,
        rooms: parseInt(document.getElementById('propertyRooms').value) || 0,
        bathrooms: parseInt(document.getElementById('propertyBathrooms').value) || 0,
        covered_area: parseFloat(document.getElementById('propertyCoveredArea').value) || null,
        uncovered_area: parseFloat(document.getElementById('propertyUncoveredArea').value) || null,
        status: statusInput.value,
        description: document.getElementById('propertyDescription').value.trim()
    };

    const id = document.getElementById('propertyId').value;
    if (id) propertyData.id = parseInt(id);

    const submitBtn = document.querySelector('#propertyForm button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';
    submitBtn.disabled = true;

    try {
        let result;
        if (id) {
            result = await API.updateProperty(propertyData);
            UI.toast('Propiedad actualizada', 'success');
        } else {
            result = await API.createProperty(propertyData);
            UI.toast('Propiedad creada', 'success');
        }

        document.getElementById('propertyModal').classList.add('hidden');
        await loadProperties();
    } catch (error) {
        console.error('Error:', error);
        UI.toast('Error: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// ============================================
// ELIMINAR PROPIEDAD
// ============================================

function eliminarPropiedad(id) {
    UI.confirm({
        title: 'Eliminar Propiedad',
        message: '¿Estás seguro? Esta acción no se puede deshacer. Los contratos asociados no se eliminarán.',
        type: 'danger',
        confirmText: 'Eliminar',
        onConfirm: async () => {
            try {
                UI.showLoading('propertiesTableBody', 'Eliminando...');
                await API.deleteProperty(id);
                UI.toast('Propiedad eliminada', 'success');
                await loadProperties();
            } catch (error) {
                UI.toast('Error: ' + error.message, 'error');
            } finally {
                UI.hideLoading('propertiesTableBody');
            }
        }
    });
}

// ============================================
// FUNCIONES GLOBALES
// ============================================

window.editarPropiedad = function(id) {
    abrirModalEditarPropiedad(id);
};

window.eliminarPropiedad = function(id) {
    eliminarPropiedad(id);
};

window.abrirModalNuevoPropiedad = function() {
    abrirModalNuevoPropiedad();
};

window.irPaginaProperties = irPaginaProperties;

console.log('✅ Funciones de propiedades configuradas correctamente');