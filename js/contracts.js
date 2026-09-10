// js/contracts.js - Gestión de Contratos y Calculadora con Aplicación Automática de Aumentos
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
        closeCalcBtn.addEventListener('click', cerrarModalCalculo);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
            if (calcModal && !calcModal.classList.contains('hidden')) cerrarModalCalculo();
        }
    });
}

function cerrarModalCalculo() {
    const calcModal = document.getElementById('calculationModal');
    if (calcModal) calcModal.classList.add('hidden');
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
                        <!-- Botón de Calculadora con Aplicación de Aumento -->
                        <button onclick="calcularAumentoGlobal(${contract.id})" 
                                class="text-emerald-600 hover:text-emerald-800 p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition"
                                title="Calcular y Aplicar Aumento">
                            <i class="fas fa-calculator"></i>
                        </button>
                        ${canEdit ? `
                        <button onclick="abrirModalEditarContrato(${contract.id})" 
                                class="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"
                                title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>` : ''}
                        ${canDelete ? `
                        <button onclick="eliminarContratoGlobal(${contract.id})" 
                                class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition"
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
    const searchInput = document.getElementById('searchContracts');
    filterContracts(searchInput ? searchInput.value : '');
}

// ============================================
// FORMULARIO: ALTA Y EDICIÓN
// ============================================

function abrirModalNuevoContrato() {
    const form = document.getElementById('contractForm');
    if (form) form.reset();
    document.getElementById('contractId').value = '';
    document.getElementById('contractModalTitle').textContent = 'Nuevo Contrato';
    currentContractFiles = [];
    renderContractFiles();
    
    document.getElementById('contractStatus').value = 'active';
    document.getElementById('contractIncreaseFrequency').value = '12';
    document.getElementById('contractAgentCommission').value = '5';
    
    const incVal = document.getElementById('contractIncreaseValue');
    if (incVal) {
        incVal.disabled = false;
        incVal.placeholder = 'Ej: 10';
    }

    document.getElementById('contractModal').classList.remove('hidden');
}

function abrirModalEditarContrato(id) {
    const contract = currentContracts.find(c => c.id === id);
    if (!contract) return;

    document.getElementById('contractId').value = contract.id;
    document.getElementById('contractTenantId').value = contract.tenant_id;
    document.getElementById('contractOwnerId').value = contract.owner_id;
    document.getElementById('contractPropertyId').value = contract.property_id || '';
    document.getElementById('contractStartDate').value = contract.start_date ? contract.start_date.slice(0, 10) : '';
    document.getElementById('contractReferenceDate').value = contract.reference_date ? contract.reference_date.slice(0, 10) : '';
    document.getElementById('contractDuration').value = contract.duration;
    document.getElementById('contractBaseAmount').value = contract.base_amount;
    document.getElementById('contractIncreaseType').value = contract.increase_type || 'fixed';
    
    const incVal = document.getElementById('contractIncreaseValue');
    if (contract.increase_type === 'fixed') {
        incVal.disabled = false;
        incVal.value = contract.increase_value || '';
    } else {
        incVal.disabled = true;
        incVal.value = '';
    }

    document.getElementById('contractIncreaseFrequency').value = contract.increase_frequency || 12;
    document.getElementById('contractAgentCommission').value = contract.agent_commission || 5;
    document.getElementById('contractStatus').value = contract.status || 'active';

    try {
        currentContractFiles = typeof contract.documents === 'string' ? JSON.parse(contract.documents) : (contract.documents || []);
    } catch (e) {
        currentContractFiles = [];
    }
    renderContractFiles();

    document.getElementById('contractModalTitle').textContent = 'Editar Contrato';
    document.getElementById('contractModal').classList.remove('hidden');
}

async function guardarContrato() {
    const id = document.getElementById('contractId').value;
    const form = document.getElementById('contractForm');
    
    if (window.UI) UI.clearAllFieldErrors(form);

    const contractData = {
        tenant_id: parseInt(document.getElementById('contractTenantId').value),
        owner_id: parseInt(document.getElementById('contractOwnerId').value),
        property_id: parseInt(document.getElementById('contractPropertyId').value),
        start_date: document.getElementById('contractStartDate').value,
        reference_date: document.getElementById('contractReferenceDate').value || document.getElementById('contractStartDate').value,
        duration: parseInt(document.getElementById('contractDuration').value),
        base_amount: parseFloat(document.getElementById('contractBaseAmount').value),
        increase_type: document.getElementById('contractIncreaseType').value,
        increase_value: parseFloat(document.getElementById('contractIncreaseValue').value) || 0,
        increase_frequency: parseInt(document.getElementById('contractIncreaseFrequency').value) || 12,
        agent_commission: parseFloat(document.getElementById('contractAgentCommission').value) || 0,
        status: document.getElementById('contractStatus').value,
        documents: JSON.stringify(currentContractFiles)
    };

    if (!contractData.tenant_id || !contractData.owner_id || !contractData.property_id || !contractData.start_date || isNaN(contractData.base_amount)) {
        UI.toast('Por favor completa todos los campos requeridos', 'error');
        return;
    }

    try {
        if (id) {
            contractData.id = parseInt(id);
            await API.updateContract(contractData);
            UI.toast('Contrato actualizado con éxito', 'success');
        } else {
            await API.createContract(contractData);
            UI.toast('Contrato creado con éxito', 'success');
        }

        document.getElementById('contractModal').classList.add('hidden');
        if (window.APICache) window.APICache.clear();
        await loadContracts();
    } catch (error) {
        UI.toast(error.message || 'Error al procesar el contrato', 'error');
    }
}

async function eliminarContratoGlobal(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este contrato? Se desvincularán los pagos asociados.')) return;

    try {
        await API.deleteContract(id);
        UI.toast('Contrato eliminado', 'success');
        if (window.APICache) window.APICache.clear();
        await loadContracts();
    } catch (error) {
        UI.toast(error.message || 'Error al eliminar contrato', 'error');
    }
}

// ============================================
// CÁLCULO DE AUMENTO Y APLICACIÓN AUTOMÁTICA
// ============================================

async function calcularAumentoGlobal(id) {
    const contract = currentContracts.find(c => c.id === id);
    if (!contract) return;

    const modal = document.getElementById('calculationModal');
    const resultDiv = document.getElementById('calculationResult');
    if (!modal || !resultDiv) return;

    resultDiv.innerHTML = '<div class="text-center py-6"><i class="fas fa-spinner fa-spin text-2xl text-blue-600"></i><p class="mt-2 text-slate-500">Consultando índices vigentes...</p></div>';
    modal.classList.remove('hidden');

    let pct = parseFloat(contract.increase_value) || 0;
    let indexName = 'Fijo';

    // Obtener valores reales de índices si existen
    try {
        if (contract.increase_type === 'ipc') {
            indexName = 'IPC (INDEC)';
            if (window.INDICES_CONFIG && window.INDICES_CONFIG.ipc) {
                pct = parseFloat(window.INDICES_CONFIG.ipc.mensual) || 2.5;
            } else {
                const indices = await API.getIndices().catch(() => null);
                pct = indices?.ipc?.valor || 2.5;
            }
        } else if (contract.increase_type === 'icl') {
            indexName = 'ICL (BCRA / CABA)';
            if (window.INDICES_CONFIG && window.INDICES_CONFIG.icl) {
                pct = parseFloat(window.INDICES_CONFIG.icl.mensual) || 2.2;
            } else {
                const indices = await API.getIndices().catch(() => null);
                pct = indices?.icl?.valor || 2.2;
            }
        }
    } catch (e) {
        console.warn('Usando valores de contingencia para índices:', e);
    }

    const actual = parseFloat(contract.base_amount) || 0;
    const aumento = actual * (pct / 100);
    const nuevoMonto = actual + aumento;

    // Calcular la próxima fecha de aumento proyectada (sumando los meses de frecuencia)
    const freqMeses = parseInt(contract.increase_frequency) || 12;
    let fechaBase = contract.next_increase_date ? new Date(contract.next_increase_date) : new Date();
    fechaBase.setMonth(fechaBase.getMonth() + freqMeses);
    const proximaFechaCalculada = fechaBase.toISOString().slice(0, 10);

    resultDiv.innerHTML = `
        <div class="bg-slate-50 dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div class="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                <span class="text-sm text-slate-500 dark:text-slate-400">Inquilino:</span>
                <span class="font-semibold text-slate-800 dark:text-slate-200">${AppUtils.escapeHtml(contract.tenant_name || 'N/A')}</span>
            </div>
            <div class="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                <span class="text-sm text-slate-500 dark:text-slate-400">Alquiler Base Actual:</span>
                <span class="font-bold text-slate-800 dark:text-slate-200">${AppUtils.formatCurrency(actual)}</span>
            </div>
            <div class="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                <span class="text-sm text-slate-500 dark:text-slate-400">Criterio de Ajuste:</span>
                <span class="font-medium text-blue-600 dark:text-blue-400">${indexName} (+${pct}%)</span>
            </div>
            <div class="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                <span class="text-sm text-slate-500 dark:text-slate-400">Incremento Calculado:</span>
                <span class="font-medium text-emerald-600 dark:text-emerald-400">+${AppUtils.formatCurrency(aumento)}</span>
            </div>
            <div class="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                <span class="text-base font-bold text-slate-900 dark:text-white">Nuevo Alquiler Sugerido:</span>
                <span class="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">${AppUtils.formatCurrency(nuevoMonto)}</span>
            </div>
            <div class="flex justify-between items-center pt-1">
                <span class="text-xs text-slate-500 dark:text-slate-400">Próximo vencimiento de aumento:</span>
                <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">${AppUtils.formatDate(proximaFechaCalculada)}</span>
            </div>
        </div>

        <div class="flex flex-wrap justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button onclick="cerrarModalCalculo()" 
                    class="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm transition">
                Cancelar
            </button>
            
            <!-- 🌟 BOTÓN RESTAURADO: APLICAR AUMENTO AUTOMÁTICAMENTE -->
            <button onclick="aplicarAumentoContrato(${contract.id}, ${nuevoMonto}, '${proximaFechaCalculada}')" 
                    id="btnAplicarAumento"
                    class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-sm transition flex items-center gap-2 text-sm">
                <i class="fas fa-check-circle"></i>
                <span>Aplicar Aumento al Contrato</span>
            </button>
        </div>
    `;
}

async function aplicarAumentoContrato(id, nuevoMonto, nuevaFecha) {
    const contract = currentContracts.find(c => c.id === id);
    if (!contract) return;

    if (!confirm(`¿Confirmas aplicar el nuevo alquiler de ${AppUtils.formatCurrency(nuevoMonto)} a este contrato?\n\nLa siguiente fecha de aumento quedará fijada para el ${AppUtils.formatDate(nuevaFecha)}.`)) {
        return;
    }

    const btn = document.getElementById('btnAplicarAumento');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Actualizando...';
    }

    try {
        const payload = {
            id: contract.id,
            tenant_id: contract.tenant_id,
            owner_id: contract.owner_id,
            property_id: contract.property_id,
            start_date: contract.start_date,
            reference_date: contract.reference_date,
            duration: contract.duration,
            base_amount: nuevoMonto,
            increase_type: contract.increase_type,
            increase_value: contract.increase_value,
            increase_frequency: contract.increase_frequency,
            agent_commission: contract.agent_commission,
            next_increase_date: nuevaFecha,
            status: contract.status,
            documents: contract.documents
        };

        await API.updateContract(payload);

        UI.toast(`¡Aumento aplicado exitosamente! Nuevo monto: ${AppUtils.formatCurrency(nuevoMonto)}`, 'success');
        cerrarModalCalculo();

        if (window.APICache) window.APICache.clear();
        await loadContracts();

    } catch (error) {
        console.error('Error al aplicar aumento:', error);
        UI.toast(error.message || 'Error al aplicar el aumento al contrato', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Aplicar Aumento al Contrato';
        }
    }
}

// Exponer funciones globales
window.abrirModalNuevoContrato = abrirModalNuevoContrato;
window.abrirModalEditarContrato = abrirModalEditarContrato;
window.eliminarContratoGlobal = eliminarContratoGlobal;
window.calcularAumentoGlobal = calcularAumentoGlobal;
window.aplicarAumentoContrato = aplicarAumentoContrato;
window.cerrarModalCalculo = cerrarModalCalculo;
window.irPaginaContracts = irPaginaContracts;
window.eliminarArchivoContrato = eliminarArchivoContrato;