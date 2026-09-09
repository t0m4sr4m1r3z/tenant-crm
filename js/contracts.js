// js/contracts.js - Gestión de Contratos y Recibos Oficiales (Mórtola & Asociados)
const API = {
    baseUrl: '/.netlify/functions',

    async request(endpoint, options = {}) {
        const token = sessionStorage.getItem('authToken');

        const isGet = !options.method || options.method === 'GET';
        if (isGet && window.APICache) {
            const cached = window.APICache.get(endpoint, options);
            if (cached) return cached;
        }

        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': token }),
            ...options.headers
        };

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });

            if (response.status === 401) {
                sessionStorage.removeItem('authToken');
                sessionStorage.removeItem('user');
                if (window.UI) UI.toast('Sesión expirada', 'warning');
                setTimeout(() => { window.location.href = '/login.html'; }, 1200);
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

    getContracts() { return this.request('/contracts'); },
    createContract(contract) { return this.request('/contracts', { method: 'POST', body: JSON.stringify(contract) }); },
    updateContract(contract) { return this.request('/contracts', { method: 'PUT', body: JSON.stringify(contract) }); },
    deleteContract(id) { return this.request(`/contracts?id=${id}`, { method: 'DELETE' }); },
    getTenants() { return this.request('/tenants'); },
    getOwners() { return this.request('/owners'); },
    getProperties() { return this.request('/properties'); },
    getIndices() { return this.request('/indices'); },

    uploadFile(formData) {
        const token = sessionStorage.getItem('authToken');
        return fetch(`${this.baseUrl}/upload-file`, {
            method: 'POST',
            headers: { ...(token && { 'Authorization': token }) },
            body: formData
        }).then(res => {
            if (!res.ok) throw new Error('Error al subir archivo');
            return res.json();
        });
    }
};

// Estado global
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

    if (!document.getElementById('contractsPagination')) {
        const tableCard = document.querySelector('.bg-white.rounded-xl.shadow-sm.border');
        if (tableCard) {
            const paginationDiv = document.createElement('div');
            paginationDiv.id = 'contractsPagination';
            paginationDiv.className = 'flex justify-between items-center px-6 py-3 bg-gray-50 dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700';
            tableCard.appendChild(paginationDiv);
        }
    }

    await Promise.all([
        loadTenants(),
        loadOwners(),
        loadProperties()
    ]);

    await loadContracts();

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

    const cerrarModalContrato = () => { if (modal) modal.classList.add('hidden'); };

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
        closeCalcBtn.addEventListener('click', () => { if (calcModal) calcModal.classList.add('hidden'); });
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
                if (window.UI) UI.toast(`Archivo ${file.name} adjuntado`, 'success');
            } catch (err) {
                console.error(err);
                if (window.UI) UI.toast(`Error al subir ${file.name}`, 'error');
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
    if (!container || totalItems === 0) {
        if (container) container.innerHTML = '';
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
                        ${currentPage === 1 ? 'disabled' : ''} aria-label="Anterior">
                    <i class="fas fa-chevron-left text-xs"></i>
                </button>
                <span class="text-sm font-medium px-3 py-1 bg-blue-50 dark:bg-slate-700 text-blue-600 dark:text-blue-400 rounded-lg">
                    ${currentPage} / ${totalPages}
                </span>
                <button onclick="irPaginaContracts(${currentPage + 1})" 
                        class="px-3 py-1 rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${currentPage === totalPages ? 'disabled' : ''} aria-label="Siguiente">
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
    if (countSpan) countSpan.textContent = currentContracts.length;
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
// CRUD CONTRATOS
// ============================================

function abrirModalNuevoContrato() {
    const form = document.getElementById('contractForm');
    if (form) form.reset();
    if (window.UI) UI.clearAllFieldErrors(form);

    document.getElementById('contractId').value = '';
    document.getElementById('contractModalTitle').textContent = 'Nuevo Contrato';
    
    // Valores predeterminados
    const hoy = new Date().toISOString().slice(0, 10);
    document.getElementById('contractStartDate').value = hoy;
    document.getElementById('contractDuration').value = '24';
    document.getElementById('contractIncreaseFrequency').value = '12';
    document.getElementById('contractAgentCommission').value = '5';
    document.getElementById('contractIncreaseType').value = 'fixed';
    
    const valInput = document.getElementById('contractIncreaseValue');
    if (valInput) {
        valInput.disabled = false;
        valInput.value = '10';
    }

    currentContractFiles = [];
    renderContractFiles();

    document.getElementById('contractModal').classList.remove('hidden');
}

function abrirModalEditarContrato(id) {
    const contract = currentContracts.find(c => c.id === id);
    if (!contract) return;

    const form = document.getElementById('contractForm');
    if (window.UI) UI.clearAllFieldErrors(form);

    document.getElementById('contractId').value = contract.id;
    document.getElementById('contractModalTitle').textContent = 'Editar Contrato';

    document.getElementById('contractTenantId').value = contract.tenant_id || '';
    document.getElementById('contractOwnerId').value = contract.owner_id || '';
    document.getElementById('contractPropertyId').value = contract.property_id || '';
    document.getElementById('contractStartDate').value = contract.start_date ? contract.start_date.slice(0, 10) : '';
    document.getElementById('contractReferenceDate').value = contract.reference_date ? contract.reference_date.slice(0, 10) : '';
    document.getElementById('contractDuration').value = contract.duration || '';
    document.getElementById('contractBaseAmount').value = contract.base_amount || '';
    
    document.getElementById('contractIncreaseType').value = contract.increase_type || 'fixed';
    const valInput = document.getElementById('contractIncreaseValue');
    if (valInput) {
        if (contract.increase_type === 'fixed') {
            valInput.disabled = false;
            valInput.value = contract.increase_value || '';
        } else {
            valInput.disabled = true;
            valInput.value = '';
        }
    }

    document.getElementById('contractIncreaseFrequency').value = contract.increase_frequency || '12';
    document.getElementById('contractAgentCommission').value = contract.agent_commission || '5';
    document.getElementById('contractStatus').value = contract.status || 'active';

    try {
        currentContractFiles = Array.isArray(contract.files) ? [...contract.files] : (contract.files ? JSON.parse(contract.files) : []);
    } catch (e) {
        currentContractFiles = [];
    }
    renderContractFiles();

    document.getElementById('contractModal').classList.remove('hidden');
}

async function guardarContrato() {
    const form = document.getElementById('contractForm');
    if (!form) return;

    if (window.UI) UI.clearAllFieldErrors(form);

    const id = document.getElementById('contractId').value;
    const tenant_id = document.getElementById('contractTenantId').value;
    const owner_id = document.getElementById('contractOwnerId').value;
    const property_id = document.getElementById('contractPropertyId').value;
    const start_date = document.getElementById('contractStartDate').value;
    const reference_date = document.getElementById('contractReferenceDate').value || start_date;
    const duration = parseInt(document.getElementById('contractDuration').value, 10);
    const base_amount = parseFloat(document.getElementById('contractBaseAmount').value);
    const increase_type = document.getElementById('contractIncreaseType').value;
    const increase_value = increase_type === 'fixed' ? parseFloat(document.getElementById('contractIncreaseValue').value || 0) : 0;
    const increase_frequency = parseInt(document.getElementById('contractIncreaseFrequency').value, 10);
    const agent_commission = parseFloat(document.getElementById('contractAgentCommission').value || 0);
    const status = document.getElementById('contractStatus').value;

    let valid = true;
    if (!tenant_id) { UI.showFieldError(document.getElementById('contractTenantId'), 'Selecciona un inquilino'); valid = false; }
    if (!owner_id) { UI.showFieldError(document.getElementById('contractOwnerId'), 'Selecciona un propietario'); valid = false; }
    if (!property_id) { UI.showFieldError(document.getElementById('contractPropertyId'), 'Selecciona una propiedad'); valid = false; }
    if (!start_date) { UI.showFieldError(document.getElementById('contractStartDate'), 'Fecha requerida'); valid = false; }
    if (isNaN(duration) || duration <= 0) { UI.showFieldError(document.getElementById('contractDuration'), 'Duración inválida'); valid = false; }
    if (isNaN(base_amount) || base_amount <= 0) { UI.showFieldError(document.getElementById('contractBaseAmount'), 'Monto inválido'); valid = false; }

    if (!valid) return;

    const payload = {
        tenant_id: parseInt(tenant_id, 10),
        owner_id: parseInt(owner_id, 10),
        property_id: parseInt(property_id, 10),
        start_date,
        reference_date,
        duration,
        base_amount,
        increase_type,
        increase_value,
        increase_frequency,
        agent_commission,
        status,
        files: currentContractFiles
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';
    submitBtn.disabled = true;

    try {
        if (id) {
            payload.id = parseInt(id, 10);
            await API.updateContract(payload);
            if (window.UI) UI.toast('Contrato actualizado con éxito', 'success');
        } else {
            await API.createContract(payload);
            if (window.UI) UI.toast('Contrato creado con éxito', 'success');
        }

        if (window.APICache) APICache.clear();
        document.getElementById('contractModal').classList.add('hidden');
        await loadContracts();
    } catch (error) {
        console.error('Error al guardar contrato:', error);
        if (window.UI) UI.toast(error.message || 'Error al guardar contrato', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function eliminarContratoGlobal(id) {
    if (!confirm('¿Estás seguro de eliminar este contrato? Esta acción eliminará los pagos asociados.')) return;

    try {
        await API.deleteContract(id);
        if (window.UI) UI.toast('Contrato eliminado correctamente', 'success');
        if (window.APICache) APICache.clear();
        await loadContracts();
    } catch (error) {
        console.error('Error al eliminar contrato:', error);
        if (window.UI) UI.toast(error.message || 'No se pudo eliminar el contrato', 'error');
    }
}

// ============================================
// CÁLCULO DE AUMENTOS
// ============================================

async function calcularAumentoGlobal(contractId) {
    const contract = currentContracts.find(c => c.id === contractId);
    if (!contract) return;

    const modal = document.getElementById('calculationModal');
    const resultDiv = document.getElementById('calculationResult');
    if (!modal || !resultDiv) return;

    resultDiv.innerHTML = '<div class="text-center py-6"><i class="fas fa-spinner fa-spin text-2xl text-blue-600"></i><p class="mt-2 text-sm text-gray-500">Calculando índices...</p></div>';
    modal.classList.remove('hidden');

    try {
        let porcentaje = parseFloat(contract.increase_value) || 0;
        let detalleCalculo = '';

        if (contract.increase_type !== 'fixed') {
            const indicesData = await API.getIndices().catch(() => ({}));
            const tipo = (contract.increase_type || 'ipc').toLowerCase();
            const indiceMes = indicesData[tipo] || 3.5;
            const meses = contract.increase_frequency || 12;
            
            porcentaje = (indiceMes * (meses / 12) * 10).toFixed(2);
            detalleCalculo = `Índice ${tipo.toUpperCase()} estimado acumulado (${meses} meses): ${porcentaje}%`;
        } else {
            detalleCalculo = `Aumento fijo pactado contractualmente: ${porcentaje}%`;
        }

        const montoBase = parseFloat(contract.base_amount) || 0;
        const incrementoMonto = (montoBase * (porcentaje / 100));
        const nuevoMonto = montoBase + incrementoMonto;

        resultDiv.innerHTML = `
            <div class="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <h4 class="font-bold text-blue-900 mb-1">Inquilino: ${AppUtils.escapeHtml(contract.tenant_name || 'N/A')}</h4>
                <p class="text-xs text-blue-700">Propiedad: ${AppUtils.escapeHtml(contract.property_address || 'Inmueble')}</p>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="p-3 bg-gray-50 rounded-lg">
                    <span class="text-xs text-gray-500 block">Monto Anterior</span>
                    <span class="text-lg font-bold text-gray-700">${AppUtils.formatCurrency(montoBase)}</span>
                </div>
                <div class="p-3 bg-green-50 rounded-lg">
                    <span class="text-xs text-green-600 block">Nuevo Monto Estimado</span>
                    <span class="text-xl font-bold text-green-700">${AppUtils.formatCurrency(nuevoMonto)}</span>
                </div>
            </div>
            <p class="text-sm text-gray-600 border-l-4 border-blue-500 pl-3 py-1">${detalleCalculo}</p>
            <div class="pt-4 flex justify-end gap-2">
                <button onclick="document.getElementById('calculationModal').classList.add('hidden')" class="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">Cerrar</button>
                <button onclick="abrirReciboModal(${contract.id}, ${nuevoMonto})" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm flex items-center gap-1">
                    <i class="fas fa-file-invoice"></i> Confeccionar Recibo
                </button>
            </div>
        `;
    } catch (e) {
        resultDiv.innerHTML = '<p class="text-red-500 text-center py-4">Error al calcular el aumento.</p>';
    }
}

// ============================================
// HELPER: CARGAR IMAGEN EN BASE64
// ============================================

async function getBase64ImageFromUrl(imageUrl) {
    try {
        const res = await fetch(imageUrl);
        if (!res.ok) return null;
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        return null;
    }
}

// ============================================
// RECIBO OFICIAL DE ALQUILER
// ============================================

function abrirReciboModal(contractId, customAmount = null) {
    const contract = currentContracts.find(c => c.id === contractId);
    if (!contract) return;

    const modal = document.getElementById('receiptModal');
    const content = document.getElementById('receiptContent');
    if (!modal || !content) return;

    const monto = customAmount !== null ? customAmount : (parseFloat(contract.base_amount) || 0);
    const comisionPct = parseFloat(contract.agent_commission) || 0;
    const comision = monto * (comisionPct / 100);
    const netoPropietario = monto - comision;

    const hoy = new Date();
    const numeroRecibo = `REC-${contract.id}-${hoy.getFullYear()}${(hoy.getMonth() + 1).toString().padStart(2, '0')}`;

    currentReceiptData = {
        numero: numeroRecibo,
        fecha: hoy.toISOString().slice(0, 10),
        inquilino: contract.tenant_name || 'Inquilino',
        inquilinoDni: contract.tenant_dni || '-',
        inquilinoPhone: contract.tenant_phone || '',
        inquilinoEmail: contract.tenant_email || '',
        propietario: contract.owner_name || 'Propietario',
        propiedad: contract.property_address || 'Inmueble arrendado',
        montoBase: monto,
        comisionPct,
        comision,
        netoPropietario,
        periodo: hoy.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    };

    content.innerHTML = `
        <div class="border-2 border-slate-200 p-6 rounded-2xl bg-white space-y-6 text-slate-800" id="receiptPrintArea">
            <!-- Encabezado con LOGO EN LA ESQUINA SUPERIOR IZQUIERDA -->
            <div class="flex justify-between items-start border-b pb-4">
                <div class="flex items-center gap-4">
                    <img src="/icons/sello.png" alt="Logo Inmobiliaria" 
                         class="h-16 w-auto object-contain max-w-[90px]" 
                         onerror="this.style.display='none'" />
                    <div>
                        <h2 class="text-2xl font-black tracking-tight text-slate-900">MÓRTOLA & ASOCIADOS</h2>
                        <p class="text-xs text-slate-500 uppercase tracking-widest font-semibold">Administración de Propiedades y Gestión Inmobiliaria</p>
                        <p class="text-xs text-slate-500 mt-1">Matrícula Profesional C.U.I.T. 20-34567890-9</p>
                    </div>
                </div>
                <div class="text-right">
                    <div class="inline-block bg-slate-900 text-white px-3 py-1 rounded-lg text-xs font-bold mb-1 tracking-wider">
                        RECIBO OFICIAL
                    </div>
                    <p class="text-sm font-semibold text-slate-700">${numeroRecibo}</p>
                    <p class="text-xs text-slate-400">Fecha: ${AppUtils.formatDate(currentReceiptData.fecha)}</p>
                </div>
            </div>

            <!-- Datos de partes -->
            <div class="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-sm">
                <div>
                    <span class="text-xs text-slate-400 font-semibold block uppercase">Inquilino / Locatario</span>
                    <p class="font-bold text-slate-800">${AppUtils.escapeHtml(currentReceiptData.inquilino)}</p>
                    <p class="text-xs text-slate-500">DNI: ${AppUtils.escapeHtml(currentReceiptData.inquilinoDni)}</p>
                </div>
                <div>
                    <span class="text-xs text-slate-400 font-semibold block uppercase">Propietario / Locador</span>
                    <p class="font-bold text-slate-800">${AppUtils.escapeHtml(currentReceiptData.propietario)}</p>
                    <p class="text-xs text-slate-500">Inmueble: ${AppUtils.escapeHtml(currentReceiptData.propiedad)}</p>
                </div>
            </div>

            <!-- Conceptos -->
            <table class="w-full text-sm border-collapse">
                <thead>
                    <tr class="border-b text-slate-500 text-left text-xs uppercase">
                        <th class="py-2">Descripción</th>
                        <th class="py-2 text-right">Importe</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr>
                        <td class="py-3">
                            <p class="font-medium text-slate-800">Alquiler correspondiente al período: <span class="capitalize">${currentReceiptData.periodo}</span></p>
                            <p class="text-xs text-slate-400">${AppUtils.escapeHtml(currentReceiptData.propiedad)}</p>
                        </td>
                        <td class="py-3 text-right font-semibold text-slate-900">${AppUtils.formatCurrency(currentReceiptData.montoBase)}</td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr class="border-t-2 border-slate-900 font-bold text-base">
                        <td class="py-3">TOTAL ABONADO</td>
                        <td class="py-3 text-right text-emerald-600">${AppUtils.formatCurrency(currentReceiptData.montoBase)}</td>
                    </tr>
                </tfoot>
            </table>

            <!-- Liquidación de Honorarios / Administración -->
            <div class="border-t pt-3 flex justify-between items-center text-xs text-slate-500">
                <span>Comisión administrativa de gestión (${currentReceiptData.comisionPct}%): ${AppUtils.formatCurrency(currentReceiptData.comision)}</span>
                <span class="font-medium">Neto a liquidar a propietario: ${AppUtils.formatCurrency(currentReceiptData.netoPropietario)}</span>
            </div>

            <!-- Firmas Limpias -->
            <div class="grid grid-cols-2 gap-12 pt-10 text-center text-xs text-slate-500">
                <div class="border-t border-dashed border-slate-300 pt-3">
                    Firma y Aclaración Inquilino
                </div>
                <div class="border-t border-dashed border-slate-300 pt-3">
                    Firma Administración
                </div>
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

async function descargarPDF() {
    if (!currentReceiptData) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    // Intentar cargar logo para esquina superior izquierda
    const logoBase64 = await getBase64ImageFromUrl('/icons/sello.png');
    let startTextX = 14;

    if (logoBase64) {
        // Logo en la esquina superior izquierda
        doc.addImage(logoBase64, 'PNG', 14, 12, 22, 22);
        startTextX = 40;
    }

    // Encabezado institucional
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('MÓRTOLA & ASOCIADOS', startTextX, 19);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Administración de Propiedades y Gestión Inmobiliaria', startTextX, 24);
    doc.text(`Recibo N°: ${currentReceiptData.numero} | Fecha: ${currentReceiptData.fecha}`, startTextX, 29);

    doc.setDrawColor(200);
    doc.line(14, 37, 196, 37);

    // Datos de Partes
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Inquilino: ${currentReceiptData.inquilino} (DNI: ${currentReceiptData.inquilinoDni})`, 14, 45);
    doc.text(`Propietario: ${currentReceiptData.propietario}`, 14, 51);
    doc.text(`Inmueble: ${currentReceiptData.propiedad}`, 14, 57);

    // Tabla con AutoTable
    doc.autoTable({
        startY: 65,
        head: [['Concepto', 'Período', 'Total']],
        body: [
            ['Canon Locativo Mensual', currentReceiptData.periodo, AppUtils.formatCurrency(currentReceiptData.montoBase)]
        ],
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
    });

    const finalY = doc.lastAutoTable.finalY + 15;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Cancelado: ${AppUtils.formatCurrency(currentReceiptData.montoBase)}`, 14, finalY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Retención administrativa (${currentReceiptData.comisionPct}%): ${AppUtils.formatCurrency(currentReceiptData.comision)}`, 14, finalY + 6);

    // Líneas de firma limpias
    doc.line(20, finalY + 40, 80, finalY + 40);
    doc.text('Firma Inquilino', 35, finalY + 45);

    doc.line(130, finalY + 40, 190, finalY + 40);
    doc.text('Firma Administración', 145, finalY + 45);

    doc.save(`${currentReceiptData.numero}.pdf`);
    if (window.UI) UI.toast('Recibo PDF descargado', 'success');
}

function enviarReciboWhatsApp() {
    if (!currentReceiptData) return;

    let phone = currentReceiptData.inquilinoPhone.replace(/\D/g, '');
    if (phone.length === 10) phone = '549' + phone;
    else if (phone.startsWith('54') && !phone.startsWith('549')) phone = '549' + phone.substring(2);

    const msg = 
`Estimado/a *${currentReceiptData.inquilino}*, adjuntamos constancia de pago de alquiler (*${currentReceiptData.numero}*):
- *Inmueble:* ${currentReceiptData.propiedad}
- *Período:* ${currentReceiptData.periodo}
- *Monto Abonado:* ${AppUtils.formatCurrency(currentReceiptData.montoBase)}
- *Fecha:* ${AppUtils.formatDate(currentReceiptData.fecha)}

Gracias por su cumplimiento. 
_Mórtola & Asociados - Gestión Inmobiliaria_`;

    const url = phone 
        ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
}

function enviarReciboEmail() {
    if (!currentReceiptData) return;
    const email = currentReceiptData.inquilinoEmail;
    const subject = encodeURIComponent(`Comprobante de Pago - Alquiler ${currentReceiptData.periodo}`);
    const body = encodeURIComponent(`Estimado/a ${currentReceiptData.inquilino},\n\nLe enviamos el detalle de su recibo ${currentReceiptData.numero} por el importe de ${AppUtils.formatCurrency(currentReceiptData.montoBase)} correspondiente a ${currentReceiptData.periodo}.\n\nAtentamente,\nMórtola & Asociados`);
    
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

// Exponer funciones globales
window.abrirModalNuevoContrato = abrirModalNuevoContrato;
window.abrirModalEditarContrato = abrirModalEditarContrato;
window.eliminarContratoGlobal = eliminarContratoGlobal;
window.calcularAumentoGlobal = calcularAumentoGlobal;
window.abrirReciboModal = abrirReciboModal;
window.cerrarRecibo = cerrarRecibo;
window.imprimirRecibo = imprimirRecibo;
window.descargarPDF = descargarPDF;
window.enviarReciboWhatsApp = enviarReciboWhatsApp;
window.enviarReciboEmail = enviarReciboEmail;
window.eliminarArchivoContrato = eliminarArchivoContrato;
window.irPaginaContracts = irPaginaContracts;