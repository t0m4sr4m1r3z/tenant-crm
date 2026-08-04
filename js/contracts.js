// contracts.js - Gestión de Contratos (Versión con permisos) – CORREGIDO
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
            
            const text = await response.text();
            
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
                throw new Error('Error en la respuesta del servidor');
            }
            
        } catch (error) {
            console.error('❌ API Error:', error);
            throw error;
        }
    },
    
    async getContracts() {
        return this.request('/contracts');
    },
    
    async createContract(contract) {
        return this.request('/contracts', {
            method: 'POST',
            body: JSON.stringify(contract)
        });
    },
    
    async updateContract(contract) {
        return this.request('/contracts', {
            method: 'PUT',
            body: JSON.stringify(contract)
        });
    },
    
    async deleteContract(id) {
        return this.request(`/contracts?id=${id}`, {
            method: 'DELETE'
        });
    },
    
    async getTenants() {
        return this.request('/tenants');
    },
    
    async getOwners() {
        return this.request('/owners');
    },

    async getProperties() {
        return this.request('/properties');
    }
};

// Estado global
let currentContracts = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let filteredContracts = [];
let currentTenants = [];
let currentOwners = [];
let currentProperties = [];
let currentFilter = 'all';
let searchTimeout = null;
let currentReceiptData = null;
let cachedIndices = null;
let lastIndicesUpdate = null;
let currentContractFiles = [];
const cloudinaryCloudName = 'dwapdg9aq';

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 Página de contratos cargada');
    
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    AppSidebar.init();
    initModals();
    initSearch();
    
    // Crear contenedor de paginación
    if (!document.getElementById('contractsPagination')) {
        const tableContainer = document.querySelector('.bg-white.rounded-xl.shadow-sm.border.border-gray-100.overflow-hidden');
        if (tableContainer) {
            const paginationDiv = document.createElement('div');
            paginationDiv.id = 'contractsPagination';
            paginationDiv.className = 'flex justify-between items-center px-6 py-3 bg-gray-50 border-t border-gray-200';
            tableContainer.appendChild(paginationDiv);
        }
    }
    
    // Cargar datos en paralelo
    await Promise.all([
        loadTenants(),
        loadOwners(),
        loadProperties()
    ]);
    
    await loadContracts();
    initEventListeners();

    // Ocultar botón de nuevo si no tiene permiso
    const addBtn = document.getElementById('addContractBtn');
    if (addBtn && !AUTH.hasPermission('canCreate')) {
        addBtn.style.display = 'none';
    }
});

function initSearch() {
    const searchInput = document.getElementById('searchContracts');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filterContracts(e.target.value);
        }, 300);
    });
}

function initEventListeners() {
    const addBtn = document.getElementById('addContractBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            abrirModalNuevoContratoInterno();
        });
    }
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => 
                b.classList.remove('active', 'bg-blue-600', 'text-white')
            );
            btn.classList.add('active', 'bg-blue-600', 'text-white');
            currentFilter = btn.dataset.filter;
            applyFilter();
        });
    });
    
    const viewReceiptBtn = document.getElementById('viewReceiptBtn');
    if (viewReceiptBtn) {
        viewReceiptBtn.addEventListener('click', verReciboProfesional);
    }
    
    const applyIncreaseBtn = document.getElementById('applyIncreaseBtn');
    if (applyIncreaseBtn) {
        applyIncreaseBtn.addEventListener('click', () => {
            if (currentReceiptData) {
                aplicarAumento(currentReceiptData.contract.id, currentReceiptData.calculation.newAmount);
            }
        });
    }
}

function initModals() {
    const modal = document.getElementById('contractModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelModalBtn');
    const overlay = document.getElementById('modalOverlay');
    const form = document.getElementById('contractForm');
    
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
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await guardarContrato();
        });
    }
    
    const calcModal = document.getElementById('calculationModal');
    const closeCalcBtn = document.getElementById('closeCalculationBtn');
    
    if (closeCalcBtn) {
        closeCalcBtn.addEventListener('click', () => {
            calcModal.classList.add('hidden');
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modal && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
            if (calcModal && !calcModal.classList.contains('hidden')) {
                calcModal.classList.add('hidden');
            }
            const receiptModal = document.getElementById('receiptModal');
            if (receiptModal && !receiptModal.classList.contains('hidden')) {
                receiptModal.classList.add('hidden');
            }
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
    }
}

function populateOwnerSelect() {
    const select = document.getElementById('contractOwnerId');
    if (!select) return;
    
    if (!currentOwners || currentOwners.length === 0) {
        select.innerHTML = '<option value="">No hay propietarios disponibles</option>';
        return;
    }
    
    select.innerHTML = '<option value="">Seleccionar propietario...</option>' +
        currentOwners.map(o => `<option value="${o.id}">${AppUtils.escapeHtml(o.name)}${o.dni ? ` (${AppUtils.escapeHtml(o.dni)})` : ''}</option>`).join('');
}

async function loadTenants() {
    try {
        currentTenants = await API.getTenants();
        populateTenantSelect();
    } catch (error) {
        console.error('Error cargando inquilinos:', error);
        currentTenants = [];
    }
}

function populateTenantSelect() {
    const select = document.getElementById('contractTenantId');
    if (!select) return;
    
    if (!currentTenants || currentTenants.length === 0) {
        select.innerHTML = '<option value="">No hay inquilinos disponibles</option>';
        return;
    }
    
    select.innerHTML = '<option value="">Seleccionar inquilino...</option>' +
        currentTenants.map(t => `<option value="${t.id}">${AppUtils.escapeHtml(t.name)} (${AppUtils.escapeHtml(t.dni)})</option>`).join('');
}

async function loadProperties() {
    try {
        currentProperties = await API.getProperties();
        populatePropertySelect();
    } catch (error) {
        console.error('Error cargando propiedades:', error);
        currentProperties = [];
        const select = document.getElementById('contractPropertyId');
        if (select) {
            select.innerHTML = '<option value="">Error al cargar propiedades</option>';
        }
    }
}

function populatePropertySelect() {
    const select = document.getElementById('contractPropertyId');
    if (!select) return;
    
    if (!currentProperties || currentProperties.length === 0) {
        select.innerHTML = '<option value="">No hay propiedades disponibles</option>';
        return;
    }
    
    select.innerHTML = '<option value="">Seleccionar propiedad...</option>' +
        currentProperties.map(p => {
            const address = AppUtils.escapeHtml(p.address);
            const ownerName = p.owner_name ? ` (${AppUtils.escapeHtml(p.owner_name)})` : '';
            return `<option value="${p.id}">${address}${ownerName}</option>`;
        }).join('');
}

// ============================================
// FUNCIONES DE PAGINACIÓN
// ============================================

async function loadContracts() {
    const tableBody = document.getElementById('contractsTableBody');
    if (!tableBody) return;
    
    try {
        UI.showLoading('contractsTableBody', 'Cargando contratos...');
        currentContracts = await API.getContracts();
        filteredContracts = [...(currentContracts || [])];
        currentPage = 1;
        updateContractsCount();
        renderizarContratosPaginado();
    } catch (error) {
        console.error('Error cargando contratos:', error);
        UI.toast('Error al cargar los contratos', 'error');
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-3 text-red-400"></i>
                    <p>Error al cargar los datos</p>
                    <button onclick="location.reload()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        <i class="fas fa-sync-alt mr-1"></i>Reintentar
                    </button>
                </td>
            </tr>
        `;
    } finally {
        UI.hideLoading('contractsTableBody');
    }
}

function renderizarContratosPaginado() {
    const totalItems = filteredContracts.length;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageItems = filteredContracts.slice(start, end);
    
    renderizarTablaContratos(pageItems);
    renderPaginationContracts(totalItems, totalPages);
}

function renderizarTablaContratos(contracts) {
    const tableBody = document.getElementById('contractsTableBody');
    if (!tableBody) return;
    
    if (!contracts || contracts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-file-contract text-4xl mb-3 opacity-50"></i>
                    <p>No hay contratos registrados</p>
                    ${AUTH.hasPermission('canCreate') ? `<button onclick="abrirModalNuevoContratoGlobal()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                        <i class="fas fa-plus mr-1"></i>Crear el primero
                    </button>` : ''}
                </td>
            </tr>
        `;
        return;
    }

    const canEdit = AUTH.hasPermission('canEdit');
    const canDelete = AUTH.hasPermission('canDelete');
    
    tableBody.innerHTML = contracts.map(contract => {
        const nextIncrease = contract.next_increase_date 
            ? AppUtils.formatDate(contract.next_increase_date)
            : 'No programado';
        
        const statusClass = {
            'active': 'badge-success',
            'pending': 'badge-warning',
            'expired': 'badge-danger',
            'terminated': 'badge-info'
        }[contract.status] || 'badge-info';
        
        const statusText = {
            'active': 'Activo',
            'pending': 'Pendiente',
            'expired': 'Vencido',
            'terminated': 'Terminado'
        }[contract.status] || contract.status;

        let propertyDisplay = contract.property_address || 'Sin propiedad';
        if (contract.property_id && currentProperties && currentProperties.length > 0) {
            const prop = currentProperties.find(p => p.id === contract.property_id);
            if (prop) {
                propertyDisplay = prop.address;
            }
        }
        
        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-6 py-4">${AppUtils.escapeHtml(contract.tenant_name || 'N/A')}</td>
                <td class="px-6 py-4">${AppUtils.escapeHtml(contract.owner_name || 'N/A')}</td>
                <td class="px-6 py-4">${AppUtils.escapeHtml(propertyDisplay)}</td>
                <td class="px-6 py-4">${AppUtils.formatCurrency(contract.base_amount)}</td>
                <td class="px-6 py-4">${contract.duration} meses</td>
                <td class="px-6 py-4">${nextIncrease}</td>
                <td class="px-6 py-4">
                    <span class="badge ${statusClass}">${statusText}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex gap-2">
                        <button onclick="calcularAumentoGlobal(${contract.id})" 
                                class="text-green-600 hover:text-green-800 p-2 rounded-lg hover:bg-green-50 transition"
                                title="Calcular aumento">
                            <i class="fas fa-calculator"></i>
                        </button>
                        ${canEdit ? `<button onclick="editarContratoGlobal(${contract.id})" class="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition" title="Editar contrato"><i class="fas fa-edit"></i></button>` : ''}
                        ${canDelete ? `<button onclick="eliminarContratoGlobal(${contract.id})" class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition" title="Eliminar contrato"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPaginationContracts(totalItems, totalPages) {
    const container = document.getElementById('contractsPagination');
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
                Mostrando <span class="font-medium">${startItem}</span> - <span class="font-medium">${endItem}</span> de <span class="font-medium">${totalItems}</span> contratos
            </div>
            <div class="flex items-center gap-2">
                <button onclick="irPaginaContracts(${currentPage - 1})" 
                        class="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${currentPage === 1 ? 'disabled' : ''}
                        aria-label="Página anterior">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="text-sm font-medium px-3 py-1 bg-blue-100 text-blue-700 rounded-lg">${currentPage} / ${totalPages}</span>
                <button onclick="irPaginaContracts(${currentPage + 1})" 
                        class="px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-50 transition ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${currentPage === totalPages ? 'disabled' : ''}
                        aria-label="Página siguiente">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

function irPaginaContracts(page) {
    const totalPages = Math.ceil(filteredContracts.length / PAGE_SIZE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderizarContratosPaginado();
}

function updateContractsCount() {
    const countSpan = document.getElementById('contractsCount');
    if (countSpan) {
        countSpan.textContent = currentContracts.length;
    }
}

// ============================================
// FILTROS Y BÚSQUEDA
// ============================================

function filterContracts(searchTerm) {
    if (searchTerm && searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        filteredContracts = currentContracts.filter(c => 
            (c.tenant_name && c.tenant_name.toLowerCase().includes(term)) ||
            (c.owner_name && c.owner_name.toLowerCase().includes(term)) ||
            (c.property_address && c.property_address.toLowerCase().includes(term))
        );
    } else {
        filteredContracts = [...currentContracts];
    }
    
    if (currentFilter !== 'all') {
        filteredContracts = filteredContracts.filter(c => c.status === currentFilter);
    }
    
    currentPage = 1;
    renderizarContratosPaginado();
}

function applyFilter() {
    const searchTerm = document.getElementById('searchContracts').value;
    filterContracts(searchTerm);
}

// ============================================
// FUNCIONES DE MODAL (Nuevo/Editar)
// ============================================

function abrirModalNuevoContratoInterno() {
    console.log('🔵 abrirModalNuevoContratoInterno');
    
    const modal = document.getElementById('contractModal');
    const title = document.getElementById('contractModalTitle');
    const form = document.getElementById('contractForm');
    
    if (!modal || !title || !form) return;
    
    form.reset();
    document.getElementById('contractId').value = '';
    title.textContent = 'Nuevo Contrato';
    
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById('contractStartDate');
    const referenceDateInput = document.getElementById('contractReferenceDate');
    const frequencyInput = document.getElementById('contractIncreaseFrequency');
    const commissionInput = document.getElementById('contractAgentCommission');
    const statusInput = document.getElementById('contractStatus');
    const propertySelect = document.getElementById('contractPropertyId');
    
    if (startDateInput) startDateInput.value = today;
    if (referenceDateInput) referenceDateInput.value = '';
    if (frequencyInput) frequencyInput.value = '12';
    if (commissionInput) commissionInput.value = '5';
    if (statusInput) statusInput.value = 'active';
    if (propertySelect) propertySelect.value = '';
    
    modal.classList.remove('hidden');
}

function abrirModalEditarContratoInterno(contractId) {
    console.log('🔵 abrirModalEditarContratoInterno, contractId:', contractId);
    
    const modal = document.getElementById('contractModal');
    const title = document.getElementById('contractModalTitle');
    const form = document.getElementById('contractForm');
    
    if (!modal || !title || !form) return;
    
    const contract = currentContracts.find(c => c.id === contractId);
    if (!contract) {
        UI.toast('Contrato no encontrado', 'error');
        return;
    }
    
    title.textContent = 'Editar Contrato';
    document.getElementById('contractId').value = contract.id;
    document.getElementById('contractTenantId').value = contract.tenant_id || '';
    document.getElementById('contractOwnerId').value = contract.owner_id || '';
    
    const propertySelect = document.getElementById('contractPropertyId');
    if (propertySelect) {
        propertySelect.value = contract.property_id || '';
    }
    
    document.getElementById('contractBaseAmount').value = contract.base_amount;
    document.getElementById('contractDuration').value = contract.duration;
    document.getElementById('contractStartDate').value = contract.start_date;
    const referenceDateInput = document.getElementById('contractReferenceDate');
    if (referenceDateInput && contract.reference_date) {
        referenceDateInput.value = contract.reference_date;
    }
    document.getElementById('contractIncreaseType').value = contract.increase_type || 'fixed';
    document.getElementById('contractIncreaseValue').value = contract.increase_value || '';
    document.getElementById('contractIncreaseFrequency').value = contract.increase_frequency || 12;
    document.getElementById('contractAgentCommission').value = contract.agent_commission || 5;
    document.getElementById('contractStatus').value = contract.status || 'active';
    
    modal.classList.remove('hidden');
    
    currentContractFiles = [];
    mostrarArchivos([]);
    
    cargarArchivosContrato(contractId);
    initFileUpload(contractId);
}

// ============================================
// GUARDAR CONTRATO CON VALIDACIONES MEJORADAS
// ============================================

async function guardarContrato() {
    const form = document.getElementById('contractForm');
    UI.clearAllFieldErrors(form);
    
    const tenantIdInput = document.getElementById('contractTenantId');
    const ownerIdInput = document.getElementById('contractOwnerId');
    const propertyIdInput = document.getElementById('contractPropertyId');
    const baseAmountInput = document.getElementById('contractBaseAmount');
    const startDateInput = document.getElementById('contractStartDate');
    const durationInput = document.getElementById('contractDuration');
    const frequencyInput = document.getElementById('contractIncreaseFrequency');
    const commissionInput = document.getElementById('contractAgentCommission');
    
    let isValid = true;
    
    if (!tenantIdInput.value) {
        UI.showFieldError(tenantIdInput, 'Debes seleccionar un inquilino');
        isValid = false;
    }
    
    if (!ownerIdInput.value) {
        UI.showFieldError(ownerIdInput, 'Debes seleccionar un propietario');
        isValid = false;
    }
    
    if (!propertyIdInput || !propertyIdInput.value) {
        UI.showFieldError(propertyIdInput, 'Debes seleccionar una propiedad');
        isValid = false;
    }
    
    if (!UI.validateField(baseAmountInput, null, null)) {
        isValid = false;
    } else if (parseFloat(baseAmountInput.value) <= 0) {
        UI.showFieldError(baseAmountInput, 'El monto debe ser mayor a 0');
        isValid = false;
    }
    
    if (!UI.validateField(startDateInput, null, null)) {
        isValid = false;
    }
    
    if (!UI.validateField(durationInput, null, null)) {
        isValid = false;
    } else if (parseInt(durationInput.value) < 1) {
        UI.showFieldError(durationInput, 'La duración debe ser al menos 1 mes');
        isValid = false;
    }
    
    if (!UI.validateField(frequencyInput, null, null)) {
        isValid = false;
    } else if (parseInt(frequencyInput.value) < 1) {
        UI.showFieldError(frequencyInput, 'La frecuencia debe ser al menos 1 mes');
        isValid = false;
    }
    
    if (!UI.validateField(commissionInput, null, null)) {
        isValid = false;
    } else if (parseFloat(commissionInput.value) < 0) {
        UI.showFieldError(commissionInput, 'La comisión no puede ser negativa');
        isValid = false;
    }
    
    if (!isValid) return;
    
    const propertyId = parseInt(propertyIdInput.value);
    const selectedProperty = currentProperties.find(p => p.id === propertyId);
    const propertyAddress = selectedProperty ? selectedProperty.address : '';
    
    const contractData = {
        tenantId: parseInt(tenantIdInput.value),
        ownerId: parseInt(ownerIdInput.value) || null,
        owner: ownerIdInput.options[ownerIdInput.selectedIndex]?.text || '',
        propertyId: propertyId,
        propertyAddress: propertyAddress,
        baseAmount: parseFloat(baseAmountInput.value),
        duration: parseInt(durationInput.value),
        startDate: startDateInput.value,
        referenceDate: document.getElementById('contractReferenceDate')?.value || null,
        increaseType: document.getElementById('contractIncreaseType').value,
        increaseValue: document.getElementById('contractIncreaseValue').value ? parseFloat(document.getElementById('contractIncreaseValue').value) : null,
        increaseFrequency: parseInt(frequencyInput.value),
        agentCommission: parseFloat(commissionInput.value),
        status: document.getElementById('contractStatus').value
    };
    
    const id = document.getElementById('contractId').value;
    if (id) contractData.id = parseInt(id);
    
    const submitBtn = document.querySelector('#contractForm button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';
    submitBtn.disabled = true;
    
    try {
        if (contractData.id) {
            await API.updateContract(contractData);
            UI.toast('Contrato actualizado', 'success');
        } else {
            await API.createContract(contractData);
            UI.toast('Contrato creado', 'success');
        }
        
        document.getElementById('contractModal').classList.add('hidden');
        await loadContracts();
    } catch (error) {
        console.error('Error:', error);
        UI.toast('Error: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// ============================================
// FUNCIONES PARA ÍNDICES EN TIEMPO REAL
// ============================================

async function cargarIndices() {
    if (window.getIndices) {
        const indices = window.getIndices();
        cachedIndices = {
            ipc: { monthly: indices.ipc, yearly: 0, date: indices.ipcFecha || '2026-03' },
            icl: { monthly: indices.icl, date: indices.iclFecha || '2026-03' },
            updatedAt: new Date().toISOString()
        };
        lastIndicesUpdate = new Date();
        console.log('📊 Índices cargados desde sistema central:', cachedIndices);
        return cachedIndices;
    }
    
    const savedIndices = localStorage.getItem('indices_globales');
    if (savedIndices) {
        try {
            const manual = JSON.parse(savedIndices);
            cachedIndices = {
                ipc: { monthly: manual.ipc?.mensual || 2.0, yearly: 0, date: manual.ipc?.fecha || '2026-03' },
                icl: { monthly: manual.icl?.mensual || 2.1, date: manual.icl?.fecha || '2026-03' },
                updatedAt: manual.actualizado || new Date().toISOString()
            };
            lastIndicesUpdate = new Date();
            console.log('📊 Índices cargados desde localStorage:', cachedIndices);
            return cachedIndices;
        } catch (e) {
            console.error('Error parsing saved indices:', e);
        }
    }
    
    cachedIndices = {
        ipc: { monthly: 2.0, yearly: 15.2, value: 100, date: '2026-03' },
        icl: { monthly: 2.1, value: 100, date: '2026-03' },
        updatedAt: new Date().toISOString()
    };
    lastIndicesUpdate = new Date();
    console.log('📊 Usando valores por defecto:', cachedIndices);
    return cachedIndices;
}

function calcularMesesDesdeUltimoAumento(contract) {
    let fechaReferencia;
    
    if (contract.reference_date) {
        fechaReferencia = new Date(contract.reference_date);
    } else if (contract.last_increase_date) {
        fechaReferencia = new Date(contract.last_increase_date);
    } else {
        fechaReferencia = new Date(contract.start_date);
    }
    
    const today = new Date();
    let meses = (today.getFullYear() - fechaReferencia.getFullYear()) * 12;
    meses += today.getMonth() - fechaReferencia.getMonth();
    
    if (today.getDate() < fechaReferencia.getDate()) {
        meses--;
    }
    
    return Math.max(meses, 1);
}

function calcularIPCCompuesto(ipcMensual, meses) {
    const tasa = ipcMensual / 100;
    const compuesto = Math.pow(1 + tasa, meses) - 1;
    return (compuesto * 100).toFixed(2);
}

// ============================================
// FUNCIÓN DE CALCULADORA
// ============================================

async function calcularAumento(contractId) {
    console.log('🧮 calcularAumento para contractId:', contractId);
    
    const contract = currentContracts.find(c => c.id === contractId);
    if (!contract) {
        UI.toast('Contrato no encontrado', 'error');
        return;
    }
    
    const baseAmount = parseFloat(contract.base_amount) || 0;
    let newAmount = baseAmount;
    let increasePercentage = 0;
    let increaseDescription = '';
    let indices = null;
    
    if (contract.increase_type === 'ipc' || contract.increase_type === 'ips') {
        UI.toast('Obteniendo índices actualizados...', 'info');
        indices = await cargarIndices();
    }
    
    switch(contract.increase_type) {
        case 'fixed':
            increasePercentage = parseFloat(contract.increase_value) || 0;
            newAmount = baseAmount * (1 + increasePercentage / 100);
            increaseDescription = `Aumento fijo del ${increasePercentage}%`;
            break;
        case 'ipc':
            if (indices && indices.ipc) {
                const mesesDesdeUltimo = calcularMesesDesdeUltimoAumento(contract);
                const ipcMensual = parseFloat(indices.ipc.monthly) || 3.5;
                const ipcAcumulado = calcularIPCCompuesto(ipcMensual, mesesDesdeUltimo);
                increasePercentage = parseFloat(ipcAcumulado);
                newAmount = baseAmount * (1 + increasePercentage / 100);
                increaseDescription = `Aumento por IPC (${increasePercentage}% acumulado en ${mesesDesdeUltimo} meses)`;
            } else {
                increasePercentage = 3.5;
                newAmount = baseAmount * 1.035;
                increaseDescription = 'Aumento por IPC (valor estimado)';
            }
            break;
        case 'ips':
            if (indices && indices.icl) {
                increasePercentage = parseFloat(indices.icl.monthly) || 4.0;
                newAmount = baseAmount * (1 + increasePercentage / 100);
                increaseDescription = `Aumento por ICL (${increasePercentage}% mensual)`;
            } else {
                increasePercentage = 4.0;
                newAmount = baseAmount * 1.04;
                increaseDescription = 'Aumento por ICL (valor estimado)';
            }
            break;
        default:
            increasePercentage = 0;
            newAmount = baseAmount;
            increaseDescription = 'Sin aumento programado';
    }
    
    const commission = newAmount * (parseFloat(contract.agent_commission) / 100);
    const totalWithCommission = newAmount + commission;
    
    let nextIncreaseDate = 'No programado';
    if (contract.next_increase_date) {
        const date = new Date(contract.next_increase_date);
        const today = new Date();
        const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
            nextIncreaseDate = `${date.toLocaleDateString()} (en ${diffDays} días)`;
        } else if (diffDays === 0) {
            nextIncreaseDate = `${date.toLocaleDateString()} (hoy)`;
        } else {
            nextIncreaseDate = `${date.toLocaleDateString()} (vencido)`;
        }
    }
    
    currentReceiptData = {
        contract,
        calculation: {
            baseAmount,
            newAmount,
            increasePercentage,
            increaseDescription,
            commission,
            totalWithCommission,
            nextIncreaseDate: contract.next_increase_date ? new Date(contract.next_increase_date).toLocaleDateString() : 'No programado',
            indicesUsed: indices ? { ipc: indices.ipc, icl: indices.icl, updatedAt: indices.updatedAt } : null
        }
    };
    
    const calcModal = document.getElementById('calculationModal');
    const calcResult = document.getElementById('calculationResult');
    
    if (!calcModal || !calcResult) {
        console.error('No se encontró el modal de cálculo');
        return;
    }
    
    let indicesHtml = '';
    if (indices && (contract.increase_type === 'ipc' || contract.increase_type === 'ips')) {
        indicesHtml = `
            <div class="mt-3 p-2 bg-gray-100 rounded-lg text-xs text-gray-500">
                <i class="fas fa-chart-line mr-1"></i>
                Índices actualizados: 
                ${indices.ipc ? `IPC: ${indices.ipc.monthly}%` : ''}
                ${indices.icl ? `| ICL: ${indices.icl.monthly}%` : ''}
                <span class="text-gray-400 ml-1">(${new Date(indices.updatedAt).toLocaleTimeString()})</span>
            </div>
        `;
    }
    
    calcResult.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center justify-between border-b pb-3">
                <div>
                    <p class="text-sm text-gray-500">Contrato #${contract.id}</p>
                    <p class="font-semibold text-lg">${AppUtils.escapeHtml(contract.tenant_name || 'N/A')}</p>
                </div>
                <span class="badge badge-info">${(contract.increase_type || 'N/A').toUpperCase()}</span>
            </div>
            
            <div class="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                <div><p class="text-xs text-gray-500">Monto Actual</p><p class="font-bold text-lg">${AppUtils.formatCurrency(baseAmount)}</p></div>
                <div><p class="text-xs text-gray-500">Porcentaje</p><p class="font-bold text-lg text-blue-600">+${increasePercentage}%</p></div>
                <div><p class="text-xs text-gray-500">Nuevo Monto</p><p class="font-bold text-lg text-green-600">${AppUtils.formatCurrency(newAmount)}</p></div>
                <div><p class="text-xs text-gray-500">Comisión (${parseFloat(contract.agent_commission || 5)}%)</p><p class="font-bold text-lg text-purple-600">${AppUtils.formatCurrency(commission)}</p></div>
            </div>
            
            <div class="border-t border-b py-3">
                <div class="flex justify-between items-center">
                    <span class="font-semibold">Total a pagar (con comisión):</span>
                    <span class="font-bold text-xl text-blue-600">${AppUtils.formatCurrency(totalWithCommission)}</span>
                </div>
            </div>
            
            <div class="text-sm space-y-2">
                <p class="flex items-center gap-2"><i class="fas fa-calendar text-gray-400 w-4"></i><span class="text-gray-600">Próximo aumento:</span><span class="font-medium">${nextIncreaseDate}</span></p>
                <p class="flex items-center gap-2"><i class="fas fa-info-circle text-gray-400 w-4"></i><span class="text-gray-600">Detalle:</span><span class="font-medium">${increaseDescription}</span></p>
                ${contract.property_address ? `<p class="flex items-center gap-2"><i class="fas fa-map-marker-alt text-gray-400 w-4"></i><span class="text-gray-600">Propiedad:</span><span class="font-medium">${AppUtils.escapeHtml(contract.property_address)}</span></p>` : ''}
            </div>
            
            ${indicesHtml}
            
            <div class="flex gap-3 pt-4 border-t">
                <button onclick="verReciboProfesional()" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2">
                    <i class="fas fa-file-invoice"></i><span>Ver Recibo</span>
                </button>
                <button onclick="aplicarAumentoGlobal(${contract.id}, ${newAmount})" class="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2">
                    <i class="fas fa-check"></i><span>Aplicar Aumento</span>
                </button>
            </div>
        </div>
    `;
    
    calcModal.classList.remove('hidden');
}

// ============================================
// FUNCIONES DE ELIMINACIÓN
// ============================================

function eliminarContrato(id) {
    UI.confirm({
        title: 'Eliminar Contrato',
        message: '¿Estás seguro de eliminar este contrato?',
        type: 'danger',
        confirmText: 'Eliminar',
        onConfirm: async () => {
            try {
                UI.showLoading('contractsTableBody', 'Eliminando...');
                await API.deleteContract(id);
                UI.toast('Contrato eliminado', 'success');
                await loadContracts();
            } catch (error) {
                UI.toast('Error: ' + error.message, 'error');
            } finally {
                UI.hideLoading('contractsTableBody');
            }
        }
    });
}

function aplicarAumento(contractId, newAmount) {
    const contract = currentContracts.find(c => c.id === contractId);
    if (!contract) return;
    
    UI.confirm({
        title: 'Aplicar Aumento',
        message: `¿Estás seguro de aplicar el aumento a ${contract.tenant_name}? El monto pasará de ${AppUtils.formatCurrency(contract.base_amount)} a ${AppUtils.formatCurrency(newAmount)}.`,
        type: 'warning',
        confirmText: 'Aplicar',
        onConfirm: async () => {
            try {
                await API.updateContract({
                    id: contract.id,
                    tenantId: contract.tenant_id,
                    ownerId: contract.owner_id,
                    owner: contract.owner,
                    propertyId: contract.property_id,
                    propertyAddress: contract.property_address,
                    baseAmount: newAmount,
                    duration: contract.duration,
                    startDate: contract.start_date,
                    increaseType: contract.increase_type,
                    increaseValue: contract.increase_value,
                    increaseFrequency: contract.increase_frequency,
                    agentCommission: contract.agent_commission,
                    status: contract.status
                });
                UI.toast('Aumento aplicado correctamente', 'success');
                document.getElementById('calculationModal').classList.add('hidden');
                await loadContracts();
            } catch (error) {
                console.error('Error:', error);
                UI.toast('Error al aplicar el aumento', 'error');
            }
        }
    });
}

// ============================================
// FUNCIONES PARA EL RECIBO PROFESIONAL
// ============================================

function verReciboProfesional() {
    console.log('🧾 verReciboProfesional');
    
    if (!currentReceiptData) {
        UI.toast('No hay datos de recibo para mostrar', 'error');
        return;
    }
    
    const receiptContent = document.getElementById('receiptContent');
    const contract = currentReceiptData.contract;
    const calculation = currentReceiptData.calculation;
    
    const fechaEmision = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 15);
    const fechaVencimientoStr = fechaVencimiento.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    
    receiptContent.innerHTML = `
        <div class="bg-white p-8 rounded-lg" id="receiptPrintable">
            <div class="flex justify-between items-start border-b pb-6 mb-6">
                <div><h1 class="text-3xl font-bold text-blue-600">TENANT CRM</h1><p class="text-gray-500">Sistema de Gestión de Inquilinos</p></div>
                <div class="text-right"><p class="text-sm text-gray-500">Recibo N°: <span class="font-bold">${String(contract.id).padStart(6, '0')}</span></p><p class="text-sm text-gray-500">Fecha de emisión: <span class="font-bold">${fechaEmision}</span></p></div>
            </div>
            
            <div class="grid grid-cols-2 gap-6 mb-6">
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h2 class="font-semibold text-gray-700 mb-3">Datos del Inquilino</h2>
                    <p><span class="text-gray-500">Nombre:</span> ${AppUtils.escapeHtml(contract.tenant_name || 'N/A')}</p>
                    <p><span class="text-gray-500">Email:</span> ${AppUtils.escapeHtml(contract.tenant_email || 'N/A')}</p>
                    <p><span class="text-gray-500">Documento:</span> ${AppUtils.escapeHtml(contract.tenant_dni || 'N/A')}</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h2 class="font-semibold text-gray-700 mb-3">Datos del Inmueble</h2>
                    <p><span class="text-gray-500">Propietario:</span> ${AppUtils.escapeHtml(contract.owner || 'N/A')}</p>
                    <p><span class="text-gray-500">Dirección:</span> ${AppUtils.escapeHtml(contract.property_address || 'N/A')}</p>
                    <p><span class="text-gray-500">Contrato N°:</span> ${contract.id}</p>
                </div>
            </div>

            <div class="bg-gray-50 p-4 rounded-lg mb-6">
                <h2 class="font-semibold text-gray-700 mb-3">📈 Información del Aumento</h2>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div><p><span class="text-gray-500">Fecha de referencia:</span></p><p class="font-medium">${contract.reference_date ? AppUtils.formatDate(contract.reference_date) : AppUtils.formatDate(contract.start_date)}</p></div>
                    <div><p><span class="text-gray-500">Meses acumulados:</span></p><p class="font-medium">${calcularMesesDesdeUltimoAumento(contract)} meses</p></div>
                </div>
            </div>
            
            <div class="mb-6">
                <h2 class="font-semibold text-gray-700 mb-3">Detalle del Aumento</h2>
                <table class="w-full">
                    <thead class="bg-gray-100"><tr><th class="px-4 py-2 text-left text-sm font-medium text-gray-600">Concepto</th><th class="px-4 py-2 text-right text-sm font-medium text-gray-600">Importe</th></tr></thead>
                    <tbody class="divide-y">
                        <tr><td class="px-4 py-3">Monto actual</td><td class="px-4 py-3 text-right">${AppUtils.formatCurrency(calculation.baseAmount)}</td></tr>
                        <tr><td class="px-4 py-3">Tipo de aumento</td><td class="px-4 py-3 text-right capitalize">${calculation.increaseDescription}</td></tr>
                        <tr><td class="px-4 py-3">Porcentaje de aumento</td><td class="px-4 py-3 text-right text-blue-600 font-medium">+${calculation.increasePercentage}%</td></tr>
                        <tr><td class="px-4 py-3">Nuevo monto</td><td class="px-4 py-3 text-right text-green-600 font-bold">${AppUtils.formatCurrency(calculation.newAmount)}</td></tr>
                    </tbody>
                    <tfoot class="bg-gray-50"><tr><td class="px-4 py-3 font-bold">TOTAL A PAGAR</td><td class="px-4 py-3 text-right font-bold text-xl text-blue-600">${AppUtils.formatCurrency(calculation.newAmount)}</td></tr></tfoot>
                </table>
            </div>
            
            <div class="grid grid-cols-2 gap-6 mb-6">
                <div><p class="text-sm text-gray-500">Fecha de vencimiento:</p><p class="font-bold text-lg text-red-600">${fechaVencimientoStr}</p></div>
                <div><p class="text-sm text-gray-500">Próximo aumento programado:</p><p class="font-bold">${calculation.nextIncreaseDate}</p></div>
            </div>
            
            <div class="border-t pt-6 text-sm text-gray-500">
                <p class="mb-2"><strong>Nota:</strong> Este recibo es un comprobante válido de la actualización de tu contrato de alquiler.</p>
                <p>El pago debe realizarse dentro de los 15 días hábiles posteriores a la fecha de emisión.</p>
                <p class="mt-4 text-xs text-center">Tenant CRM - Sistema de Gestión de Inquilinos</p>
            </div>
        </div>
    `;
    
    document.getElementById('receiptModal').classList.remove('hidden');
}

function cerrarRecibo() {
    document.getElementById('receiptModal').classList.add('hidden');
}

function imprimirRecibo() {
    if (!currentReceiptData) return;
    const printContent = document.getElementById('receiptPrintable').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Recibo de Alquiler</title><script src="https://cdn.tailwindcss.com"><\/script><style>@media print{body{padding:20px}.no-print{display:none}}</style></head><body>${printContent}<div class="no-print text-center mt-8"><button onclick="window.print()" class="px-4 py-2 bg-blue-600 text-white rounded-lg">Imprimir</button></div></body></html>`);
    printWindow.document.close();
}

function descargarPDF() {
    if (!currentReceiptData) return;
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const contract = currentReceiptData.contract;
        const calculation = currentReceiptData.calculation;
        const fechaEmision = new Date().toLocaleDateString('es-ES');
        const fechaVencimiento = new Date();
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 15);
        
        doc.setFontSize(20);
        doc.setTextColor(37, 99, 235);
        doc.text('TENANT CRM', 14, 22);
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(`Recibo de Alquiler - ${fechaEmision}`, 14, 32);
        doc.text(`Recibo N°: ${String(contract.id).padStart(6, '0')}`, 14, 38);
        
        doc.setFontSize(10);
        doc.text('DATOS DEL INQUILINO:', 14, 48);
        doc.text(`Nombre: ${contract.tenant_name || 'N/A'}`, 14, 54);
        doc.text(`Email: ${contract.tenant_email || 'N/A'}`, 14, 60);
        doc.text(`Documento: ${contract.tenant_dni || 'N/A'}`, 14, 66);
        
        doc.text('DATOS DEL INMUEBLE:', 14, 76);
        doc.text(`Propietario: ${contract.owner || 'N/A'}`, 14, 82);
        doc.text(`Dirección: ${contract.property_address || 'N/A'}`, 14, 88);
        
        const tableRows = [
            ["Monto actual", AppUtils.formatCurrency(calculation.baseAmount)],
            ["Tipo de aumento", calculation.increaseDescription],
            ["Porcentaje", `+${calculation.increasePercentage}%`],
            ["Nuevo monto", AppUtils.formatCurrency(calculation.newAmount)],
            ["TOTAL A PAGAR", AppUtils.formatCurrency(calculation.newAmount)]
        ];
        
        doc.autoTable({
            head: [["Concepto", "Importe"]],
            body: tableRows,
            startY: 100,
            theme: 'striped',
            styles: { fontSize: 10 },
            headStyles: { fillColor: [37, 99, 235] }
        });
        
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.text(`Fecha de vencimiento: ${fechaVencimiento.toLocaleDateString('es-ES')}`, 14, finalY);
        doc.text(`Próximo aumento: ${calculation.nextIncreaseDate}`, 14, finalY + 6);
        
        doc.save(`recibo_${contract.id}_${new Date().toISOString().split('T')[0]}.pdf`);
        UI.toast('PDF descargado correctamente', 'success');
    } catch (error) {
        console.error('Error generando PDF:', error);
        UI.toast('Error al generar el PDF', 'error');
    }
}

function enviarReciboEmail() {
    if (!currentReceiptData) {
        UI.toast('No hay datos de recibo para enviar', 'error');
        return;
    }
    
    const contract = currentReceiptData.contract;
    const calculation = currentReceiptData.calculation;
    
    const tenantEmail = contract.tenant_email;
    
    if (!tenantEmail) {
        UI.toast('El inquilino no tiene email registrado', 'warning');
        return;
    }
    
    const subject = `Actualización de Contrato - Nuevo Monto de Alquiler - Contrato #${contract.id}`;
    const body = generarTextoAumento(contract, calculation);
    
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    let mailtoLink;
    
    if (isMobile) {
        mailtoLink = `intent://mailto:${tenantEmail}?subject=${encodedSubject}&body=${encodedBody}#Intent;scheme=mailto;package=com.google.android.gm;end`;
    } else {
        mailtoLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${tenantEmail}&su=${encodedSubject}&body=${encodedBody}`;
    }
    
    window.open(mailtoLink, '_blank');
    UI.toast('Abriendo Gmail para enviar el recibo al inquilino...', 'info');
}

function generarTextoAumento(contract, calculation) {
    const fecha = new Date().toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 15);
    
    let text = `========================================\n`;
    text += `📄 NOTIFICACIÓN DE ACTUALIZACIÓN DE CONTRATO\n`;
    text += `========================================\n\n`;
    text += `👤 INQUILINO: ${AppUtils.escapeHtml(contract.tenant_name || 'N/A')}\n`;
    text += `📅 FECHA: ${fecha}\n\n`;
    text += `========================================\n`;
    text += `📊 DETALLE DEL AUMENTO\n`;
    text += `========================================\n\n`;
    text += `🏠 PROPIEDAD: ${AppUtils.escapeHtml(contract.property_address || 'No especificada')}\n`;
    text += `👤 PROPIETARIO: ${AppUtils.escapeHtml(contract.owner || 'N/A')}\n`;
    text += `💰 MONTO ACTUAL: ${AppUtils.formatCurrency(calculation.baseAmount || 0)}\n`;
    text += `📈 PORCENTAJE DE AUMENTO: +${calculation.increasePercentage}%\n`;
    text += `💵 NUEVO MONTO: ${AppUtils.formatCurrency(calculation.newAmount || 0)}\n`;
    if (calculation.commission) {
        text += `💸 COMISIÓN (${contract.agent_commission}%): ${AppUtils.formatCurrency(calculation.commission || 0)}\n`;
    }
    text += `💰 TOTAL A PAGAR: ${AppUtils.formatCurrency(calculation.totalWithCommission || calculation.newAmount || 0)}\n\n`;
    text += `========================================\n`;
    text += `📅 FECHAS IMPORTANTES\n`;
    text += `========================================\n`;
    text += `📆 FECHA DE VENCIMIENTO: ${fechaVencimiento.toLocaleDateString()}\n`;
    text += `📈 PRÓXIMO AUMENTO PROGRAMADO: ${calculation.nextIncreaseDate || 'No programado'}\n\n`;
    text += `========================================\n`;
    text += `📝 DESCRIPCIÓN\n`;
    text += `========================================\n`;
    text += `${calculation.increaseDescription}\n\n`;
    text += `========================================\n`;
    text += `📧 Este es un comprobante válido de actualización de contrato.\n`;
    text += `========================================\n`;
    
    return text;
}

window.addEventListener('indicesActualizados', () => {
    console.log('🔄 Índices actualizados, recargando...');
    cargarIndices();
});

// ============================================
// GESTIÓN DE ARCHIVOS DE CONTRATOS
// ============================================

async function subirArchivoCloudinary(file, contractId) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'tenant_crm');
        formData.append('folder', `contratos/${contractId}`);
        
        fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/upload`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.secure_url) {
                return fetch('/.netlify/functions/upload-file', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': sessionStorage.getItem('authToken')
                    },
                    body: JSON.stringify({
                        contract_id: contractId,
                        file_url: data.secure_url,
                        file_name: file.name,
                        file_type: file.type,
                        file_size: file.size
                    })
                });
            }
            throw new Error('Error al subir a Cloudinary');
        })
        .then(response => response.json())
        .then(data => resolve(data))
        .catch(err => reject(err));
    });
}

async function cargarArchivosContrato(contractId) {
    try {
        const token = sessionStorage.getItem('authToken');
        const response = await fetch(`/.netlify/functions/upload-file?contract_id=${contractId}`, {
            headers: { 'Authorization': token }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (Array.isArray(data)) {
            currentContractFiles = data;
            mostrarArchivos(data);
        } else {
            console.warn('La respuesta no es un array:', data);
            currentContractFiles = [];
            mostrarArchivos([]);
        }
        
    } catch (error) {
        console.error('Error cargando archivos:', error);
        currentContractFiles = [];
        mostrarArchivos([]);
    }
}

function mostrarArchivos(archivos) {
    const container = document.getElementById('fileList');
    if (!container) return;
    
    if (!Array.isArray(archivos)) {
        console.warn('archivos no es un array:', archivos);
        archivos = [];
    }
    
    if (archivos.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 col-span-full py-4" id="noFilesMsg">
                <i class="fas fa-file-alt text-3xl mb-2 opacity-50"></i>
                <p class="text-sm">No hay documentos adjuntos</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = archivos.map(file => `
        <div class="border rounded-lg p-2 relative group bg-white">
            ${file.file_type && file.file_type.includes('image') ? 
                `<img src="${file.file_url}" class="h-20 w-full object-cover rounded" alt="${AppUtils.escapeHtml(file.file_name)}">` :
                `<div class="h-20 bg-gray-100 rounded flex flex-col items-center justify-center">
                    <i class="fas ${file.file_name?.toLowerCase().includes('.pdf') ? 'fa-file-pdf text-red-500' : 'fa-file-alt text-blue-500'} text-3xl"></i>
                    <span class="text-xs mt-1 truncate w-full px-1">${AppUtils.escapeHtml(file.file_name?.substring(0, 15) || 'Archivo')}</span>
                 </div>`
            }
            <button onclick="eliminarArchivo(${file.id})" 
                    class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

async function eliminarArchivo(fileId) {
    if (!confirm('¿Eliminar este documento?')) return;
    
    try {
        const token = sessionStorage.getItem('authToken');
        await fetch('/.netlify/functions/upload-file', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ file_id: fileId })
        });
        
        UI.toast('Documento eliminado', 'success');
        if (currentReceiptData?.contract?.id) {
            await cargarArchivosContrato(currentReceiptData.contract.id);
        }
    } catch (error) {
        console.error('Error:', error);
        UI.toast('Error al eliminar', 'error');
    }
}

function initFileUpload(contractId) {
    const uploadBtn = document.getElementById('uploadFileBtn');
    const fileInput = document.getElementById('fileInput');
    
    if (!uploadBtn || !fileInput) return;
    
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        
        if (files.length === 0) return;
        
        UI.toast(`Subiendo ${files.length} archivo(s)...`, 'info');
        
        for (const file of files) {
            try {
                await subirArchivoCloudinary(file, contractId);
                UI.toast(`${AppUtils.escapeHtml(file.name)} subido`, 'success');
            } catch (error) {
                UI.toast(`Error al subir ${AppUtils.escapeHtml(file.name)}`, 'error');
            }
        }
        
        fileInput.value = '';
        await cargarArchivosContrato(contractId);
    });
}

// ============================================
// FUNCIONES GLOBALES
// ============================================

window.editarContratoGlobal = function(id) {
    abrirModalEditarContratoInterno(id);
};

window.eliminarContratoGlobal = function(id) {
    eliminarContrato(id);
};

window.calcularAumentoGlobal = function(id) {
    calcularAumento(id);
};

window.abrirModalNuevoContratoGlobal = function() {
    abrirModalNuevoContratoInterno();
};

window.aplicarAumentoGlobal = function(contractId, newAmount) {
    aplicarAumento(contractId, newAmount);
};

window.verReciboProfesional = verReciboProfesional;
window.cerrarRecibo = cerrarRecibo;
window.imprimirRecibo = imprimirRecibo;
window.descargarPDF = descargarPDF;
window.enviarReciboEmail = enviarReciboEmail;
window.eliminarArchivo = eliminarArchivo;
window.irPaginaContracts = irPaginaContracts;

console.log('✅ Funciones de contratos configuradas correctamente');