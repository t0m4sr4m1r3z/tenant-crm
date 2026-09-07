// js/contracts.js - Gestión Integral de Contratos de Alquiler y Recibos
const API = {
    baseUrl: '/.netlify/functions',

    async request(endpoint, options = {}) {
        const token = sessionStorage.getItem('authToken');

        const isGet = !options.method || options.method === 'GET';
        if (isGet && window.APICache) {
            const cached = window.APICache.get(endpoint, options);
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
                }, 1200);
                throw new Error('Sesión expirada');
            }

            const text = await response.text();
            let data;
            try {
                data = text ? JSON.parse(text) : {};
            } catch (err) {
                throw new Error('Respuesta del servidor no válida');
            }

            if (!response.ok) {
                throw new Error(data.error || data.message || 'Error en la petición');
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

    getContracts() {
        return this.request('/contracts');
    },

    createContract(contract) {
        return this.request('/contracts', {
            method: 'POST',
            body: JSON.stringify(contract)
        });
    },

    updateContract(contract) {
        return this.request('/contracts', {
            method: 'PUT',
            body: JSON.stringify(contract)
        });
    },

    deleteContract(id) {
        return this.request(`/contracts?id=${id}`, {
            method: 'DELETE'
        });
    },

    getTenants() {
        return this.request('/tenants');
    },

    getOwners() {
        return this.request('/owners');
    },

    getProperties() {
        return this.request('/properties');
    },

    getIndices() {
        return this.request('/indices');
    },

    uploadFile(formData) {
        const token = sessionStorage.getItem('authToken');
        return fetch(`${this.baseUrl}/upload-file`, {
            method: 'POST',
            headers: {
                ...(token && { 'Authorization': token })
            },
            body: formData
        }).then(res => {
            if (!res.ok) throw new Error('Error al subir el archivo');
            return res.json();
        });
    }
};

// Estado global de la vista
let currentContracts = [];
let filteredContracts = [];
let currentPage = 1;
const PAGE_SIZE = 10;

let currentTenants = [];
let currentOwners = [];
let currentProperties = [];
let currentFilter = 'all';
let searchTimeout = null;

let currentReceiptData = null;
let currentContractFiles = [];

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    if (window.AppSidebar) AppSidebar.init();
    if (window.Breadcrumbs) Breadcrumbs.init();

    initSearch();
    initModals();
    initFileUpload();
    initEventListeners();

    // Contenedor de paginación si no existe en HTML
    if (!document.getElementById('contractsPagination')) {
        const tableCard = document.querySelector('.bg-white.rounded-xl.shadow-sm.border');
        if (tableCard) {
            const paginationDiv = document.createElement('div');
            paginationDiv.id = 'contractsPagination';
            paginationDiv.className = 'flex justify-between items-center px-6 py-3 bg-gray-50 dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700';
            tableCard.appendChild(paginationDiv);
        }
    }

    // Cargar datos dependientes en paralelo
    await Promise.all([
        loadTenants(),
        loadOwners(),
        loadProperties()
    ]);

    await loadContracts();

    // Ocultar botón "Nuevo Contrato" si no tiene permiso
    const addBtn = document.getElementById('addContractBtn');
    if (addBtn && window.AUTH && !AUTH.hasPermission('canCreate')) {
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
        }, 250);
    });
}

function initEventListeners() {
    const addBtn = document.getElementById('addContractBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            abrirModalNuevoContrato();
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

    // Control dinámico de input según tipo de incremento
    const increaseTypeSelect = document.getElementById('contractIncreaseType');
    if (increaseTypeSelect) {
        increaseTypeSelect.addEventListener('change', (e) => {
            const valInput = document.getElementById('contractIncreaseValue');
            if (!valInput) return;
            if (e.target.value === 'fixed') {
                valInput.disabled = false;
                valInput.placeholder = 'Ej: 10 (%)';
            } else {
                valInput.disabled = true;
                valInput.value = '';
                valInput.placeholder = 'Automático por índice';
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

    const cerrarModalContrato = () => {
        if (modal) modal.classList.add('hidden');
    };

    if (closeBtn) closeBtn.addEventListener('click', cerrarModalContrato);
    if (cancelBtn) cancelBtn.addEventListener('click', cerrarModalContrato);
    if (overlay) overlay.addEventListener('click', cerrarModalContrato);

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
            if (calcModal) calcModal.classList.add('hidden');
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
            if (calcModal && !calcModal.classList.contains('hidden')) calcModal.classList.add('hidden');
            const receiptModal = document.getElementById('receiptModal');
            if (receiptModal && !receiptModal.classList.contains('hidden')) receiptModal.classList.add('hidden');
        }
    });
}

function initFileUpload() {
    const uploadBtn = document.getElementById('uploadFileBtn');
    const fileInput = document.getElementById('fileInput');

    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                uploadBtn.disabled = true;
                uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Subiendo...';

                const res = await API.uploadFile(formData);
                currentContractFiles.push({
                    name: file.name,
                    url: res.secure_url || res.url,
                    type: file.type
                });

                renderContractFiles();
                UI.toast(`Archivo ${file.name} adjuntado`, 'success');
            } catch (err) {
                console.error(err);
                UI.toast(`Error al subir ${file.name}`, 'error');
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i>Subir documento (PDF, imagen)';
                fileInput.value = '';
            }
        }
    });
}

function renderContractFiles() {
    const list = document.getElementById('fileList');
    const noFilesMsg = document.getElementById('noFilesMsg');
    if (!list) return;

    list.innerHTML = '';

    if (!currentContractFiles || currentContractFiles.length === 0) {
        if (noFilesMsg) noFilesMsg.classList.remove('hidden');
        return;
    }

    if (noFilesMsg) noFilesMsg.classList.add('hidden');

    currentContractFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'relative p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col items-center justify-between text-center';
        
        const isPdf = file.name?.endsWith('.pdf') || file.type?.includes('pdf');
        const iconClass = isPdf ? 'fa-file-pdf text-red-500' : 'fa-file-image text-blue-500';

        item.innerHTML = `
            <i class="fas ${iconClass} text-2xl mb-1"></i>
            <span class="text-xs truncate w-full text-slate-700 dark:text-slate-300" title="${AppUtils.escapeHtml(file.name)}">${AppUtils.escapeHtml(file.name || 'Archivo')}</span>
            <div class="mt-2 flex gap-3">
                <a href="${file.url}" target="_blank" rel="noopener noreferrer" class="text-xs text-blue-600 hover:underline">Ver</a>
                <button type="button" onclick="eliminarArchivoContrato(${index})" class="text-xs text-red-600 hover:text-red-800">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
        list.appendChild(item);
    });
}

function eliminarArchivoContrato(index) {
    currentContractFiles.splice(index, 1);
    renderContractFiles();
}

// ============================================
// CARGA DE ENTIDADES
// ============================================

async function loadOwners() {
    try {
        currentOwners = await API.getOwners();
        const select = document.getElementById('contractOwnerId');
        if (!select) return;

        if (!currentOwners || currentOwners.length === 0) {
            select.innerHTML = '<option value="">No hay propietarios disponibles</option>';
            return;
        }

        select.innerHTML = '<option value="">Seleccionar propietario...</option>' +
            currentOwners.map(o => `<option value="${o.id}">${AppUtils.escapeHtml(o.name)}${o.dni ? ` (${AppUtils.escapeHtml(o.dni)})` : ''}</option>`).join('');
    } catch (error) {
        console.error('Error cargando propietarios:', error);
        currentOwners = [];
    }
}

async function loadTenants() {
    try {
        currentTenants = await API.getTenants();
        const select = document.getElementById('contractTenantId');
        if (!select) return;

        if (!currentTenants || currentTenants.length === 0) {
            select.innerHTML = '<option value="">No hay inquilinos disponibles</option>';
            return;
        }

        select.innerHTML = '<option value="">Seleccionar inquilino...</option>' +
            currentTenants.map(t => `<option value="${t.id}">${AppUtils.escapeHtml(t.name)} (${AppUtils.escapeHtml(t.dni)})</option>`).join('');
    } catch (error) {
        console.error('Error cargando inquilinos:', error);
        currentTenants = [];
    }
}

async function loadProperties() {
    try {
        currentProperties = await API.getProperties();
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
    } catch (error) {
        console.error('Error cargando propiedades:', error);
        currentProperties = [];
    }
}

// ============================================
// CARGA Y RENDERIZACIÓN DE CONTRATOS
// ============================================

async function loadContracts() {
    const tableBody = document.getElementById('contractsTableBody');
    if (!tableBody) return;

    try {
        if (window.UI) UI.showLoading('contractsTableBody', 'Cargando contratos...');
        currentContracts = await API.getContracts();
        filteredContracts = [...(currentContracts || [])];
        currentPage = 1;
        updateContractsCount();
        renderizarContratosPaginado();
    } catch (error) {
        console.error('Error cargando contratos:', error);
        if (window.UI) UI.toast('Error al cargar los contratos', 'error');
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-3 text-red-400"></i>
                    <p>Error al cargar los datos</p>
                    <button onclick="loadContracts()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                        <i class="fas fa-sync-alt mr-1"></i>Reintentar
                    </button>
                </td>
            </tr>
        `;
    } finally {
        if (window.UI) UI.hideLoading('contractsTableBody');
    }
}

function renderizarContratosPaginado() {
    const totalItems = filteredContracts.length;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
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
                    <p>No se encontraron contratos</p>
                    ${(window.AUTH && AUTH.hasPermission('canCreate')) ? `
                    <button onclick="abrirModalNuevoContrato()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                        <i class="fas fa-plus mr-1"></i>Crear Contrato
                    </button>` : ''}
                </td>
            </tr>
        `;
        return;
    }

    const canEdit = !window.AUTH || AUTH.hasPermission('canEdit');
    const canDelete = !window.AUTH || AUTH.hasPermission('canDelete');

    tableBody.innerHTML = contracts.map(contract => {
        const nextIncrease = contract.next_increase_date 
            ? AppUtils.formatDate(contract.next_increase_date)
            : 'No programado';

        const statusClasses = {
            'active': 'badge-success',
            'pending': 'badge-warning',
            'expired': 'badge-danger',
            'terminated': 'badge-info'
        };

        const statusTexts = {
            'active': 'Activo',
            'pending': 'Pendiente',
            'expired': 'Vencido',
            'terminated': 'Finalizado'
        };

        const statusClass = statusClasses[contract.status] || 'badge-info';
        const statusText = statusTexts[contract.status] || contract.status;

        let propertyDisplay = contract.property_address || 'Sin propiedad asignada';
        if (contract.property_id && currentProperties.length) {
            const prop = currentProperties.find(p => p.id === contract.property_id);
            if (prop) propertyDisplay = prop.address;
        }

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition border-b border-gray-100 dark:border-slate-800">
                <td class="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">${AppUtils.escapeHtml(contract.tenant_name || 'N/A')}</td>
                <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${AppUtils.escapeHtml(contract.owner_name || 'N/A')}</td>
                <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${AppUtils.escapeHtml(propertyDisplay)}</td>
                <td class="px-6 py-4 font-semibold text-slate-900 dark:text-white">${AppUtils.formatCurrency(contract.base_amount)}</td>
                <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${contract.duration} meses</td>
                <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${nextIncrease}</td>
                <td class="px-6 py-4">
                    <span class="badge ${statusClass}">${statusText}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-1">
                        <button onclick="calcularAumentoGlobal(${contract.id})" 
                                class="text-emerald-600 hover:text-emerald-800 p-2 rounded-lg hover:bg-emerald-50 transition"
                                title="Calcular Aumento">
                            <i class="fas fa-calculator"></i>
                        </button>
                        <button onclick="abrirReciboModal(${contract.id})" 
                                class="text-purple-600 hover:text-purple-800 p-2 rounded-lg hover:bg-purple-50 transition"
                                title="Ver / Generar Recibo">
                            <i class="fas fa-receipt"></i>
                        </button>
                        ${canEdit ? `
                        <button onclick="abrirModalEditarContrato(${contract.id})" 
                                class="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition"
                                title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>` : ''}
                        ${canDelete ? `
                        <button onclick="eliminarContratoGlobal(${contract.id})" 
                                class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition"
                                title="Eliminar">
                            <i class="fas fa-trash-alt"></i>
                        </button>` : ''}
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
            <div class="text-sm text-gray-600 dark:text-slate-400">
                Mostrando <span class="font-medium">${startItem}</span> - <span class="font-medium">${endItem}</span> de <span class="font-medium">${totalItems}</span> contratos
            </div>
            <div class="flex items-center gap-2">
                <button onclick="irPaginaContracts(${currentPage - 1})" 
                        class="px-3 py-1 rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${currentPage === 1 ? 'disabled' : ''}
                        aria-label="Anterior">
                    <i class="fas fa-chevron-left text-xs"></i>
                </button>
                <span class="text-sm font-medium px-3 py-1 bg-blue-50 dark:bg-slate-700 text-blue-600 dark:text-blue-400 rounded-lg">
                    ${currentPage} / ${totalPages}
                </span>
                <button onclick="irPaginaContracts(${currentPage + 1})" 
                        class="px-3 py-1 rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${currentPage === totalPages ? 'disabled' : ''}
                        aria-label="Siguiente">
                    <i class="fas fa-chevron-right text-xs"></i>
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
// FILTROS
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
    const searchInput = document.getElementById('searchContracts');
    filterContracts(searchInput ? searchInput.value : '');
}

// ============================================
// MODAL NUEVO / EDITAR
// ============================================

function abrirModalNuevoContrato() {
    const modal = document.getElementById('contractModal');
    const title = document.getElementById('contractModalTitle');
    const form = document.getElementById('contractForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('contractId').value = '';
    title.textContent = 'Nuevo Contrato';

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('contractStartDate').value = today;
    document.getElementById('contractDuration').value = '24';
    document.getElementById('contractIncreaseFrequency').value = '12';
    document.getElementById('contractAgentCommission').value = '5';
    document.getElementById('contractStatus').value = 'active';

    const incType = document.getElementById('contractIncreaseType');
    incType.value = 'fixed';
    document.getElementById('contractIncreaseValue').disabled = false;

    currentContractFiles = [];
    renderContractFiles();

    modal.classList.remove('hidden');
}

function abrirModalEditarContrato(contractId) {
    const modal = document.getElementById('contractModal');
    const title = document.getElementById('contractModalTitle');
    const form = document.getElementById('contractForm');
    if (!modal || !form) return;

    const contract = currentContracts.find(c => c.id === contractId);
    if (!contract) {
        UI.toast('Contrato no encontrado', 'error');
        return;
    }

    form.reset();
    title.textContent = 'Editar Contrato';

    document.getElementById('contractId').value = contract.id;
    document.getElementById('contractTenantId').value = contract.tenant_id || '';
    document.getElementById('contractOwnerId').value = contract.owner_id || '';
    document.getElementById('contractPropertyId').value = contract.property_id || '';

    document.getElementById('contractStartDate').value = contract.start_date ? contract.start_date.split('T')[0] : '';
    document.getElementById('contractReferenceDate').value = contract.reference_date ? contract.reference_date.split('T')[0] : '';
    document.getElementById('contractDuration').value = contract.duration || 12;
    document.getElementById('contractBaseAmount').value = contract.base_amount || '';

    const incType = document.getElementById('contractIncreaseType');
    incType.value = contract.increase_type || 'fixed';

    const incVal = document.getElementById('contractIncreaseValue');
    incVal.value = contract.increase_value || '';
    incVal.disabled = incType.value !== 'fixed';

    document.getElementById('contractIncreaseFrequency').value = contract.increase_frequency || 12;
    document.getElementById('contractAgentCommission').value = contract.agent_commission || 5;
    document.getElementById('contractStatus').value = contract.status || 'active';

    currentContractFiles = contract.documents || [];
    renderContractFiles();

    modal.classList.remove('hidden');
}

async function guardarContrato() {
    const form = document.getElementById('contractForm');
    UI.clearAllFieldErrors(form);

    const id = document.getElementById('contractId').value;
    const tenant_id = parseInt(document.getElementById('contractTenantId').value);
    const owner_id = parseInt(document.getElementById('contractOwnerId').value);
    const property_id = parseInt(document.getElementById('contractPropertyId').value);
    const start_date = document.getElementById('contractStartDate').value;
    const reference_date = document.getElementById('contractReferenceDate').value || null;
    const duration = parseInt(document.getElementById('contractDuration').value);
    const base_amount = parseFloat(document.getElementById('contractBaseAmount').value);
    const increase_type = document.getElementById('contractIncreaseType').value;
    const increase_value = parseFloat(document.getElementById('contractIncreaseValue').value) || 0;
    const increase_frequency = parseInt(document.getElementById('contractIncreaseFrequency').value) || 12;
    const agent_commission = parseFloat(document.getElementById('contractAgentCommission').value) || 0;
    const status = document.getElementById('contractStatus').value;

    let isValid = true;
    if (!tenant_id) { UI.showFieldError(document.getElementById('contractTenantId'), 'Selecciona un inquilino'); isValid = false; }
    if (!owner_id) { UI.showFieldError(document.getElementById('contractOwnerId'), 'Selecciona un propietario'); isValid = false; }
    if (!property_id) { UI.showFieldError(document.getElementById('contractPropertyId'), 'Selecciona una propiedad'); isValid = false; }
    if (!start_date) { UI.showFieldError(document.getElementById('contractStartDate'), 'Ingresa la fecha de inicio'); isValid = false; }
    if (isNaN(duration) || duration < 1) { UI.showFieldError(document.getElementById('contractDuration'), 'Duración mínima: 1 mes'); isValid = false; }
    if (isNaN(base_amount) || base_amount <= 0) { UI.showFieldError(document.getElementById('contractBaseAmount'), 'Monto inválido'); isValid = false; }

    if (!isValid) return;

    const payload = {
        tenant_id,
        owner_id,
        property_id,
        start_date,
        reference_date,
        duration,
        base_amount,
        increase_type,
        increase_value,
        increase_frequency,
        agent_commission,
        status,
        documents: currentContractFiles
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';
    submitBtn.disabled = true;

    try {
        if (id) {
            payload.id = parseInt(id);
            await API.updateContract(payload);
            UI.toast('Contrato actualizado con éxito', 'success');
        } else {
            await API.createContract(payload);
            UI.toast('Contrato creado con éxito', 'success');
        }

        document.getElementById('contractModal').classList.add('hidden');
        if (window.APICache) window.APICache.clear();
        await loadContracts();
    } catch (err) {
        console.error(err);
        UI.toast(err.message || 'Error al guardar el contrato', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function eliminarContratoGlobal(contractId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este contrato? Los pagos vinculados podrían verse afectados.')) {
        return;
    }

    try {
        await API.deleteContract(contractId);
        UI.toast('Contrato eliminado correctamente', 'success');
        if (window.APICache) window.APICache.clear();
        await loadContracts();
    } catch (error) {
        UI.toast(error.message || 'Error al eliminar el contrato', 'error');
    }
}

// ============================================
// CÁLCULO DE AUMENTOS
// ============================================

async function calcularAumentoGlobal(contractId) {
    const contract = currentContracts.find(c => c.id === contractId);
    if (!contract) return;

    let percentage = parseFloat(contract.increase_value || 0);

    if (contract.increase_type === 'ipc' || contract.increase_type === 'icl') {
        try {
            const indices = await API.getIndices();
            percentage = contract.increase_type === 'ipc' ? (indices.ipc || 0) : (indices.icl || 0);
        } catch (e) {
            console.warn('No se pudo obtener índice en tiempo real, usando fallback local.');
        }
    }

    const currentAmount = parseFloat(contract.base_amount);
    const newAmount = currentAmount * (1 + (percentage / 100));

    currentReceiptData = {
        contract,
        calculation: {
            currentAmount,
            percentage,
            newAmount,
            date: new Date().toISOString().split('T')[0]
        }
    };

    const modal = document.getElementById('calculationModal');
    const resultDiv = document.getElementById('calculationResult');

    resultDiv.innerHTML = `
        <div class="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-3">
            <div class="flex justify-between text-sm">
                <span class="text-slate-500">Inquilino:</span>
                <span class="font-bold text-slate-800 dark:text-white">${AppUtils.escapeHtml(contract.tenant_name || 'N/A')}</span>
            </div>
            <div class="flex justify-between text-sm">
                <span class="text-slate-500">Monto actual:</span>
                <span class="font-bold">${AppUtils.formatCurrency(currentAmount)}</span>
            </div>
            <div class="flex justify-between text-sm">
                <span class="text-slate-500">Índice aplicado (${contract.increase_type.toUpperCase()}):</span>
                <span class="font-bold text-blue-600">+${percentage.toFixed(2)}%</span>
            </div>
            <div class="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between text-base">
                <span class="font-semibold text-slate-800 dark:text-white">Nuevo Monto Calculado:</span>
                <span class="font-extrabold text-emerald-600 text-lg">${AppUtils.formatCurrency(newAmount)}</span>
            </div>
        </div>
        <div class="flex gap-3 justify-end mt-5">
            <button onclick="document.getElementById('calculationModal').classList.add('hidden')" class="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800">
                Cancelar
            </button>
            <button onclick="aplicarAumento(${contract.id}, ${newAmount})" class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">
                <i class="fas fa-check mr-1"></i> Aplicar y Actualizar
            </button>
        </div>
    `;

    modal.classList.remove('hidden');
}

async function aplicarAumento(contractId, nuevoMonto) {
    if (!confirm(`¿Confirmas actualizar el monto base del contrato a ${AppUtils.formatCurrency(nuevoMonto)}?`)) return;

    try {
        await API.updateContract({ id: contractId, base_amount: nuevoMonto });
        UI.toast('Contrato actualizado con el nuevo valor', 'success');
        document.getElementById('calculationModal').classList.add('hidden');
        if (window.APICache) window.APICache.clear();
        await loadContracts();
    } catch (e) {
        UI.toast('Error al aplicar aumento', 'error');
    }
}

// ============================================
// RECIBO (PDF, IMPRESIÓN, EMAIL Y WHATSAPP)
// ============================================

function abrirReciboModal(contractId) {
    const contract = currentContracts.find(c => c.id === contractId);
    if (!contract) return;

    const commission = (contract.base_amount * (contract.agent_commission || 5)) / 100;
    const netoPropietario = contract.base_amount - commission;

    currentReceiptData = {
        receiptNumber: `REC-${contract.id}-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        date: new Date().toLocaleDateString('es-AR'),
        contract,
        commission,
        netoPropietario
    };

    const modal = document.getElementById('receiptModal');
    const content = document.getElementById('receiptContent');

    content.innerHTML = `
        <div id="printableReceipt" class="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-6">
            <div class="flex justify-between items-start border-b pb-4 dark:border-slate-800">
                <div>
                    <h2 class="text-2xl font-bold text-slate-800 dark:text-white">RECIBO DE ALQUILER</h2>
                    <p class="text-sm text-slate-400">Comprobante Interno de Cobranza</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-slate-700 dark:text-slate-300">${currentReceiptData.receiptNumber}</p>
                    <p class="text-xs text-slate-400">Fecha: ${currentReceiptData.date}</p>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <p class="text-slate-400 text-xs uppercase font-medium">Inquilino</p>
                    <p class="font-semibold text-slate-800 dark:text-slate-200">${AppUtils.escapeHtml(contract.tenant_name || 'N/A')}</p>
                </div>
                <div>
                    <p class="text-slate-400 text-xs uppercase font-medium">Propietario</p>
                    <p class="font-semibold text-slate-800 dark:text-slate-200">${AppUtils.escapeHtml(contract.owner_name || 'N/A')}</p>
                </div>
                <div class="col-span-2">
                    <p class="text-slate-400 text-xs uppercase font-medium">Inmueble</p>
                    <p class="font-medium text-slate-700 dark:text-slate-300">${AppUtils.escapeHtml(contract.property_address || 'Sin especificar')}</p>
                </div>
            </div>

            <table class="w-full text-sm border-t border-b border-slate-200 dark:border-slate-800 my-4">
                <thead>
                    <tr class="text-slate-400 text-left">
                        <th class="py-2">Concepto</th>
                        <th class="py-2 text-right">Monto</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr>
                        <td class="py-3">Canon locativo mensual</td>
                        <td class="py-3 text-right font-semibold">${AppUtils.formatCurrency(contract.base_amount)}</td>
                    </tr>
                    <tr>
                        <td class="py-3 text-slate-500">Honorarios administración (${contract.agent_commission}%)</td>
                        <td class="py-3 text-right text-slate-500">-${AppUtils.formatCurrency(commission)}</td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr class="font-bold text-base">
                        <td class="py-3 text-slate-800 dark:text-white">Neto a Liquidar al Propietario</td>
                        <td class="py-3 text-right text-emerald-600">${AppUtils.formatCurrency(netoPropietario)}</td>
                    </tr>
                </tfoot>
            </table>

            <div class="text-xs text-slate-400 text-center pt-2">
                Documento extendido a título de constancia administrativa en el sistema Tenant CRM.
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

function cerrarRecibo() {
    const modal = document.getElementById('receiptModal');
    if (modal) modal.classList.add('hidden');
}

function imprimirRecibo() {
    window.print();
}

function descargarPDF() {
    if (!currentReceiptData || !window.jspdf) {
        UI.toast('Módulo PDF no disponible', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const d = currentReceiptData;

    doc.setFontSize(18);
    doc.text('RECIBO DE ALQUILER', 14, 22);

    doc.setFontSize(10);
    doc.text(`Comprobante: ${d.receiptNumber}`, 14, 30);
    doc.text(`Fecha: ${d.date}`, 14, 36);

    doc.line(14, 42, 196, 42);

    doc.text(`Inquilino: ${d.contract.tenant_name || 'N/A'}`, 14, 52);
    doc.text(`Propietario: ${d.contract.owner_name || 'N/A'}`, 14, 60);
    doc.text(`Propiedad: ${d.contract.property_address || 'Sin especificar'}`, 14, 68);

    if (doc.autoTable) {
        doc.autoTable({
            startY: 76,
            head: [['Concepto', 'Monto']],
            body: [
                ['Canon locativo base', AppUtils.formatCurrency(d.contract.base_amount)],
                [`Comisión Agente (${d.contract.agent_commission}%)`, `-${AppUtils.formatCurrency(d.commission)}`],
                ['Neto Propietario', AppUtils.formatCurrency(d.netoPropietario)]
            ],
            theme: 'grid'
        });
    }

    doc.save(`${d.receiptNumber}.pdf`);
    UI.toast('PDF generado con éxito', 'success');
}

function enviarReciboEmail() {
    if (!currentReceiptData) return;
    const d = currentReceiptData;
    const subject = encodeURIComponent(`Recibo de Alquiler - ${d.receiptNumber}`);
    const body = encodeURIComponent(
        `Estimado/a,\n\nAdjuntamos detalle de cobranza:\n` +
        `- Inmueble: ${d.contract.property_address || ''}\n` +
        `- Monto base: ${AppUtils.formatCurrency(d.contract.base_amount)}\n` +
        `- Fecha: ${d.date}\n\n` +
        `Saludos cordiales,\nAdministración.`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
}

function enviarReciboWhatsApp() {
    if (!currentReceiptData) {
        UI.toast('No hay datos del recibo disponibles', 'warning');
        return;
    }

    const d = currentReceiptData;

    // Obtener teléfono del contrato o buscarlo en la lista de inquilinos en memoria
    let phone = d.contract.tenant_phone;
    if (!phone && currentTenants.length > 0) {
        const tenant = currentTenants.find(t => t.id === d.contract.tenant_id);
        if (tenant) phone = tenant.phone;
    }

    if (!phone || !phone.trim()) {
        UI.toast('El inquilino no tiene un teléfono cargado en el sistema.', 'warning');
        return;
    }

    // Normalizar formato de teléfono (Argentina / Internacional)
    let cleanPhone = phone.replace(/\D/g, ''); // Quita espacios, guiones y paréntesis

    // Si tiene 10 dígitos (ej: 1123456789), agregar código de Argentina +54 9
    if (cleanPhone.length === 10) {
        cleanPhone = '549' + cleanPhone;
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith('15')) {
        cleanPhone = '549' + cleanPhone.substring(2);
    } else if (cleanPhone.startsWith('54') && !cleanPhone.startsWith('549')) {
        cleanPhone = '549' + cleanPhone.substring(2);
    } else if (!cleanPhone.startsWith('54') && cleanPhone.length <= 11) {
        cleanPhone = '549' + cleanPhone;
    }

    // Mensaje con formato enriquecido para WhatsApp
    const mensaje = 
`🧾 *RECIBO DE ALQUILER - COMPROBANTE*
----------------------------------------
*N° Recibo:* ${d.receiptNumber}
*Fecha:* ${d.date}

👤 *Inquilino:* ${d.contract.tenant_name || 'Inquilino'}
🏠 *Inmueble:* ${d.contract.property_address || 'Inmueble administrado'}
💰 *Canon locativo:* ${AppUtils.formatCurrency(d.contract.base_amount)}
📋 *Concepto:* Alquiler mensual

✅ *Estado:* Cobrado y registrado en el sistema.
----------------------------------------
_Documento generado por el sistema de gestión de Mortola Y Asociados Servicios Inmobiliarios._
¡Muchas gracias!`;

    const encodedMessage = encodeURIComponent(mensaje);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
    UI.toast('Abriendo WhatsApp...', 'success');
}

// ============================================
// EXPORTACIÓN A WINDOW
// ============================================

window.abrirModalNuevoContrato = abrirModalNuevoContrato;
window.abrirModalEditarContrato = abrirModalEditarContrato;
window.calcularAumentoGlobal = calcularAumentoGlobal;
window.eliminarContratoGlobal = eliminarContratoGlobal;
window.eliminarArchivoContrato = eliminarArchivoContrato;
window.aplicarAumento = aplicarAumento;
window.abrirReciboModal = abrirReciboModal;
window.cerrarRecibo = cerrarRecibo;
window.imprimirRecibo = imprimirRecibo;
window.descargarPDF = descargarPDF;
window.enviarReciboEmail = enviarReciboEmail;
window.enviarReciboWhatsApp = enviarReciboWhatsApp;
window.irPaginaContracts = irPaginaContracts;
window.loadContracts = loadContracts;