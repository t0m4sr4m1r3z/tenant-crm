// tenants.js - Versión DEFINITIVA (nombres únicos)
// API Client
const API = {
    baseUrl: '/.netlify/functions',
    
    async request(endpoint, options = {}) {
        const token = localStorage.getItem('authToken');
        
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
                localStorage.removeItem('authToken');
                localStorage.removeItem('user');
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

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 Página de inquilinos cargada');
    
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    if (!window.UI) {
        window.UI = {
            toast: (msg, type) => {
                console.log(`${type}: ${msg}`);
                alert(`${type.toUpperCase()}: ${msg}`);
            },
            confirm: (options) => {
                if (confirm(options.message)) options.onConfirm();
                else if (options.onCancel) options.onCancel();
            },
            showLoading: (id, msg) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = `<tr><td colspan="5" class="text-center py-4"><div class="spinner mx-auto mb-2"></div><p class="text-gray-500">${msg}</p></td></tr>`;
            },
            hideLoading: (id) => {},
            validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
            validatePhone: (phone) => /^[\d\s\+\-\(\)]{8,20}$/.test(phone)
        };
    }
    
    initSidebar();
    initTenantModal();
    initSearch();
    await loadTenants();
    
    const addBtn = document.getElementById('addTenantBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            abrirModalNuevoInquilinoInterno();
        });
    }
});

function initSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const closeBtn = document.getElementById('closeSidebarBtn');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.remove('hidden');
        });
    }
    
    if (closeBtn && sidebar) {
        closeBtn.addEventListener('click', () => {
            sidebar.classList.add('hidden');
        });
    }
    
    if (overlay && sidebar) {
        overlay.addEventListener('click', () => {
            sidebar.classList.add('hidden');
        });
    }
}

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

async function loadTenants() {
    const tableBody = document.getElementById('tenantsTableBody');
    if (!tableBody) return;
    
    try {
        UI.showLoading('tenantsTableBody', 'Cargando inquilinos...');
        
        console.log('🔍 Solicitando inquilinos...');
        currentTenants = await API.getTenants();
        console.log('✅ Inquilinos recibidos:', currentTenants);
        
        renderizarTabla(currentTenants);
        actualizarEstadisticas();
        
    } catch (error) {
        console.error('❌ Error cargando inquilinos:', error);
        
        UI.toast('Error al cargar los inquilinos: ' + error.message, 'error');
        
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

function renderizarTabla(tenants) {
    const tableBody = document.getElementById('tenantsTableBody');
    if (!tableBody) return;
    
    if (!tenants || tenants.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-users text-4xl mb-3 opacity-50"></i>
                    <p>No hay inquilinos registrados</p>
                    <button onclick="abrirModalNuevoInquilinoGlobal()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                        <i class="fas fa-plus mr-1"></i>Crear el primero
                    </button>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = tenants.map(tenant => `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4" data-label="DNI">${escapeHtml(tenant.dni)}</td>
            <td class="px-6 py-4 font-medium" data-label="Nombre">${escapeHtml(tenant.name)}</td>
            <td class="px-6 py-4" data-label="Email">
                <a href="mailto:${escapeHtml(tenant.email)}" class="text-blue-600 hover:text-blue-800">
                    ${escapeHtml(tenant.email)}
                </a>
            </td>
            <td class="px-6 py-4" data-label="Teléfono">
                ${tenant.phone ? escapeHtml(tenant.phone) : '-'}
            </td>
            <td class="px-6 py-4" data-label="Acciones">
                <div class="flex gap-2">
                    <button onclick="editarInquilinoGlobal(${tenant.id})" 
                            class="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition"
                            title="Editar inquilino">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="eliminarInquilinoGlobal(${tenant.id})" 
                            class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition"
                            title="Eliminar inquilino">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filtrarInquilinos(searchTerm) {
    if (!searchTerm.trim()) {
        renderizarTabla(currentTenants);
        return;
    }
    
    const term = searchTerm.toLowerCase().trim();
    const filtered = currentTenants.filter(tenant => 
        tenant.name.toLowerCase().includes(term) ||
        tenant.dni.toLowerCase().includes(term) ||
        tenant.email.toLowerCase().includes(term) ||
        (tenant.phone && tenant.phone.includes(term))
    );
    
    renderizarTabla(filtered);
    
    if (filtered.length === 0) {
        const tableBody = document.getElementById('tenantsTableBody');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-8 text-center text-gray-500">
                        <i class="fas fa-search text-3xl mb-3 opacity-50"></i>
                        <p>No se encontraron resultados para "${escapeHtml(searchTerm)}"</p>
                        <button onclick="document.getElementById('searchTenants').value = ''; filtrarInquilinos('');" 
                                class="mt-3 text-blue-600 hover:text-blue-800">
                            <i class="fas fa-times mr-1"></i>Limpiar búsqueda
                        </button>
                    </td>
                </tr>
            `;
        }
    }
}

// ============================================
// FUNCIONES INTERNAS (con nombres únicos)
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

async function guardarInquilino() {
    const tenantData = {
        dni: document.getElementById('tenantDni').value.trim(),
        name: document.getElementById('tenantName').value.trim(),
        email: document.getElementById('tenantEmail').value.trim(),
        phone: document.getElementById('tenantPhone').value.trim(),
        address: document.getElementById('tenantAddress').value.trim()
    };
    
    const id = document.getElementById('tenantId').value;
    if (id) tenantData.id = parseInt(id);
    
    if (!tenantData.dni) return UI.toast('El DNI es obligatorio', 'warning');
    if (!tenantData.name) return UI.toast('El nombre es obligatorio', 'warning');
    if (!tenantData.email) return UI.toast('El email es obligatorio', 'warning');
    if (!UI.validateEmail(tenantData.email)) return UI.toast('Email no válido', 'error');
    
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

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================
// FUNCIONES GLOBALES (con nombres diferentes)
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

console.log('✅ Funciones globales configuradas correctamente');