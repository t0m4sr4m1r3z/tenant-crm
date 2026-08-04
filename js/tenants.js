// tenants.js - Gestión de Inquilinos (Versión con permisos) – CORREGIDO
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
            
            console.log(`📡 Respuesta status:`, response.status);
            
            if (response.status === 401) {
                sessionStorage.removeItem('authToken');
                sessionStorage.removeItem('user');
                if (window.UI) UI.toast('Sesión expirada', 'warning');
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 1500);
                throw new Error('Sesión expirada');
            }
            
            const text = await response.text();
            console.log('📦 Respuesta texto:', text.substring(0, 200) + '...');
            
            try {
                const data = JSON.parse(text);
                
                if (!response.ok) {
                    throw new Error(data.error || data.message || 'Error en la petición');
                }

                if (isGet && window.APICache) {
                    window.APICache.set(endpoint, data, options);
                }
                
                return data;
            } catch (parseError) {
                console.error('❌ Error parseando JSON:', parseError);
                console.error('Respuesta recibida:', text);
                throw new Error(`La respuesta del servidor no es JSON válido: ${text.substring(0, 100)}`);
            }
            
        } catch (error) {
            console.error('❌ API Error:', error);
            throw error;
        }
    },
    
    async getTenants() {
        return this.request('/tenants');
    },
    
    async createTenant(tenant) {
        return this.request('/tenants', {
            method: 'POST',
            body: JSON.stringify(tenant)
        });
    },
    
    async updateTenant(tenant) {
        return this.request('/tenants', {
            method: 'PUT',
            body: JSON.stringify(tenant)
        });
    },
    
    async deleteTenant(id) {
        return this.request(`/tenants?id=${id}`, {
            method: 'DELETE'
        });
    }
};

// Estado de la aplicación
let currentTenants = [];
let searchTimeout = null;
let currentPage = 1;
const PAGE_SIZE = 10;
let filteredTenants = [];

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 Página de inquilinos cargada');
    
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    AppSidebar.init();
    initTenantModal();
    initSearch();
    
    // Crear contenedor de paginación si no existe
    if (!document.getElementById('tenantsPagination')) {
        const tableContainer = document.querySelector('.bg-white.rounded-xl.shadow-sm.border.border-gray-100.overflow-hidden');
        if (tableContainer) {
            const paginationDiv = document.createElement('div');
            paginationDiv.id = 'tenantsPagination';
            paginationDiv.className = 'flex justify-between items-center px-6 py-3 bg-gray-50 border-t border-gray-200';
            tableContainer.appendChild(paginationDiv);
        }
    }
    
    await loadTenants();
    
    const addBtn = document.getElementById('addTenantBtn');
    if (addBtn) {
        if (!AUTH.hasPermission('canCreate')) {
            addBtn.style.display = 'none';
        }
        addBtn.addEventListener('click', () => {
            abrirModalNuevoInquilinoInterno();
        });
    }
});

function initSearch() {
    const searchInput = document.getElementById('searchTenants');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filtrarInquilinos(e.target.value);
        }, 300);
    });
}

function initTenantModal() {
    const modal = document.getElementById('tenantModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.querySelector('#tenantModal button[type="button"]');
    const form = document.getElementById('tenantForm');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await guardarInquilino();
        });
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }
}

// ============================================
// FUNCIONES DE PAGINACIÓN
// ============================================

async function loadTenants() {
    const tableBody = document.getElementById('tenantsTableBody');
    if (!tableBody) return;
    
    try {
        UI.showLoading('tenantsTableBody', 'Cargando inquilinos...');
        
        console.log('🔍 Solicitando inquilinos...');
        currentTenants = await API.getTenants();
        console.log('✅ Inquilinos recibidos:', currentTenants);
        
        filteredTenants = [...currentTenants];
        currentPage = 1;
        renderizarTenantsPaginado();
        actualizarEstadisticas();
        
    } catch (error) {
        console.error('❌ Error cargando inquilinos:', error);
        
        UI.toast('Error al cargar los inquilinos: ' + error.message, 'error');
        currentTenants = [];
        filteredTenants = [];
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-3 text-red-400"></i>
                    <p class="text-red-600">${error.message}</p>
                    <button onclick="location.reload()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        <i class="fas fa-sync-alt mr-1"></i>Reintentar
                    </button>
                </td>
            </tr>
        `;
    } finally {
        UI.hideLoading('tenantsTableBody');
    }
}

function renderizarTenantsPaginado() {
    const totalItems = filteredTenants.length;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageItems = filteredTenants.slice(start, end);
    
    renderizarTablaTenants(pageItems);
    renderPaginationTenants(totalItems, totalPages);
}

function renderizarTablaTenants(tenants) {
    const tableBody = document.getElementById('tenantsTableBody');
    if (!tableBody) return;
    
    if (!tenants || tenants.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-users text-4xl mb-3 opacity-50"></i>
                    <p>No hay inquilinos registrados</p>
                    ${AUTH.hasPermission('canCreate') ? `<button onclick="abrirModalNuevoInquilinoGlobal()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                        <i class="fas fa-plus mr-1"></i>Crear el primero
                    </button>` : ''}
                </td>
            </tr>
        `;
        return;
    }
    
    const canEdit = AUTH.hasPermission('canEdit');
    const canDelete = AUTH.hasPermission('canDelete');
    
    tableBody.innerHTML = tenants.map(tenant => `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4" data-label="DNI">${AppUtils.escapeHtml(tenant.dni)}</td>
            <td class="px-6 py-4 font-medium" data-label="Nombre">${AppUtils.escapeHtml(tenant.name)}</td>
            <td class="px-6 py-4" data-label="Email">
                <a href="mailto:${AppUtils.escapeHtml(tenant.email)}" class="text-blue-600 hover:text-blue-800">
                    ${AppUtils.escapeHtml(tenant.email)}
                </a>
            </td>
            <td class="px-6 py-4" data-label="Teléfono">
                ${tenant.phone ? AppUtils.escapeHtml(tenant.phone) : '-'}
            </td>
            <td class="px-6 py-4" data-label="Acciones">
                <div class="flex gap-2">
                    ${canEdit ? `<button onclick="editarInquilinoGlobal(${tenant.id})" class="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition" title="Editar inquilino" data-action="edit"><i class="fas fa-edit"></i></button>` : ''}
                    ${canDelete ? `<button onclick="eliminarInquilinoGlobal(${tenant.id})" class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition" title="Eliminar inquilino" data-action="delete"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

function renderPaginationTenants(totalItems, totalPages) {
    const container = document.getElementById('tenantsPagination');
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
                Mostrando <span class="font-medium">${startItem}</span> - <span class="font-medium">${endItem}</span> de <span class="font-medium">${totalItems}</span> inquilinos
            </div>
            <div class="flex items-center gap-2">
                <button onclick="irPaginaTenants(${currentPage - 1})" 
                        class="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${currentPage === 1 ? 'disabled' : ''}
                        aria-label="Página anterior">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="text-sm font-medium px-3 py-1 bg-blue-100 text-blue-700 rounded-lg">${currentPage} / ${totalPages}</span>
                <button onclick="irPaginaTenants(${currentPage + 1})" 
                        class="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${currentPage === totalPages ? 'disabled' : ''}
                        aria-label="Página siguiente">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

function irPaginaTenants(page) {
    const totalPages = Math.ceil(filteredTenants.length / PAGE_SIZE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderizarTenantsPaginado();
}

// ============================================
// BÚSQUEDA Y FILTROS
// ============================================

function filtrarInquilinos(searchTerm) {
    if (!searchTerm.trim()) {
        filteredTenants = [...currentTenants];
    } else {
        const term = searchTerm.toLowerCase().trim();
        filteredTenants = currentTenants.filter(tenant => 
            tenant.name.toLowerCase().includes(term) ||
            tenant.dni.toLowerCase().includes(term) ||
            tenant.email.toLowerCase().includes(term) ||
            (tenant.phone && tenant.phone.includes(term))
        );
    }
    
    currentPage = 1;
    renderizarTenantsPaginado();
    
    if (filteredTenants.length === 0) {
        const tableBody = document.getElementById('tenantsTableBody');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-8 text-center text-gray-500">
                        <i class="fas fa-search text-3xl mb-3 opacity-50"></i>
                        <p>No se encontraron resultados para "${AppUtils.escapeHtml(searchTerm)}"</p>
                        <button onclick="document.getElementById('searchTenants').value = ''; filtrarInquilinos('');" 
                                class="mt-3 text-blue-600 hover:text-blue-800">
                            <i class="fas fa-times mr-1"></i>Limpiar búsqueda
                        </button>
                    </td>
                </tr>
            `;
            const pagContainer = document.getElementById('tenantsPagination');
            if (pagContainer) pagContainer.innerHTML = '';
        }
    }
}

// ============================================
// FUNCIONES INTERNAS
// ============================================

function abrirModalNuevoInquilinoInterno() {
    console.log('🔵 abrirModalNuevoInquilinoInterno');
    
    const modal = document.getElementById('tenantModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('tenantForm');
    
    if (!modal || !title || !form) {
        console.error('❌ No se encontraron los elementos del modal');
        return;
    }
    
    form.reset();
    document.getElementById('tenantId').value = '';
    title.textContent = 'Nuevo Inquilino';
    
    modal.classList.remove('hidden');
}

function abrirModalEditarInquilinoInterno(tenantId) {
    console.log('🔵 abrirModalEditarInquilinoInterno, tenantId:', tenantId);
    
    const modal = document.getElementById('tenantModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('tenantForm');
    
    if (!modal || !title || !form) {
        console.error('❌ No se encontraron los elementos del modal');
        return;
    }
    
    const tenant = currentTenants.find(t => t.id === tenantId);
    if (!tenant) {
        console.error('❌ Inquilino no encontrado:', tenantId);
        return;
    }
    
    title.textContent = 'Editar Inquilino';
    document.getElementById('tenantId').value = tenant.id;
    document.getElementById('tenantDni').value = tenant.dni || '';
    document.getElementById('tenantName').value = tenant.name || '';
    document.getElementById('tenantEmail').value = tenant.email || '';
    document.getElementById('tenantPhone').value = tenant.phone || '';
    document.getElementById('tenantAddress').value = tenant.address || '';
    
    modal.classList.remove('hidden');
}

// ============================================
// GUARDAR INQUILINO CON VALIDACIONES MEJORADAS
// ============================================

async function guardarInquilino() {
    const form = document.getElementById('tenantForm');
    UI.clearAllFieldErrors(form);
    
    const dniInput = document.getElementById('tenantDni');
    const nameInput = document.getElementById('tenantName');
    const emailInput = document.getElementById('tenantEmail');
    const phoneInput = document.getElementById('tenantPhone');
    
    let isValid = true;
    
    if (!UI.validateField(dniInput, null, null)) {
        isValid = false;
    }
    
    if (!UI.validateField(nameInput, null, null)) {
        isValid = false;
    }
    
    if (!UI.validateField(emailInput, UI.validateEmail, 'El email no es válido')) {
        isValid = false;
    }
    
    if (phoneInput.value.trim() && !UI.validatePhone(phoneInput.value.trim())) {
        UI.showFieldError(phoneInput, 'El teléfono debe tener al menos 8 dígitos');
        isValid = false;
    }
    
    if (!isValid) return;
    
    const tenantData = {
        dni: dniInput.value.trim(),
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        phone: phoneInput.value.trim(),
        address: document.getElementById('tenantAddress').value.trim()
    };
    
    const id = document.getElementById('tenantId').value;
    if (id) tenantData.id = parseInt(id);
    
    const submitBtn = document.querySelector('#tenantForm button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';
    submitBtn.disabled = true;
    
    try {
        if (tenantData.id) {
            await API.updateTenant(tenantData);
            UI.toast('Inquilino actualizado', 'success');
        } else {
            await API.createTenant(tenantData);
            UI.toast('Inquilino creado', 'success');
        }
        
        document.getElementById('tenantModal').classList.add('hidden');
        await loadTenants();
        
    } catch (error) {
        console.error('Error:', error);
        UI.toast('Error: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function eliminarInquilino(id) {
    UI.confirm({
        title: 'Eliminar Inquilino',
        message: '¿Estás seguro? Esta acción no se puede deshacer.',
        type: 'danger',
        confirmText: 'Eliminar',
        onConfirm: async () => {
            try {
                UI.showLoading('tenantsTableBody', 'Eliminando...');
                await API.deleteTenant(id);
                UI.toast('Inquilino eliminado', 'success');
                await loadTenants();
            } catch (error) {
                UI.toast('Error: ' + error.message, 'error');
            } finally {
                UI.hideLoading('tenantsTableBody');
            }
        }
    });
}

function actualizarEstadisticas() {
    const totalElement = document.getElementById('totalTenants');
    if (totalElement) totalElement.textContent = currentTenants.length;
}

// ============================================
// FUNCIONES GLOBALES
// ============================================

window.editarInquilinoGlobal = function(id) {
    console.log('👆 editarInquilinoGlobal llamado con id:', id);
    abrirModalEditarInquilinoInterno(id);
};

window.eliminarInquilinoGlobal = function(id) {
    console.log('👆 eliminarInquilinoGlobal llamado con id:', id);
    eliminarInquilino(id);
};

window.abrirModalNuevoInquilinoGlobal = function() {
    console.log('👆 abrirModalNuevoInquilinoGlobal llamado');
    abrirModalNuevoInquilinoInterno();
};

window.irPaginaTenants = irPaginaTenants;

console.log('✅ Funciones globales configuradas correctamente');