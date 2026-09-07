// js/owners.js - Gestión de Propietarios y Liquidaciones
const OwnersAPI = {
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

    getOwners() { return this.request('/owners'); },
    getOwnerProperties(id) { return this.request(`/owners?id=${id}&properties=true`); },
    createOwner(data) { return this.request('/owners', { method: 'POST', body: JSON.stringify(data) }); },
    updateOwner(data) { return this.request('/owners', { method: 'PUT', body: JSON.stringify(data) }); },
    deleteOwner(id) { return this.request(`/owners?id=${id}`, { method: 'DELETE' }); }
};

let allOwners = [];
let currentOwnerViewing = null;

document.addEventListener('DOMContentLoaded', () => {
    if (window.AppSidebar) AppSidebar.init();
    if (window.Breadcrumbs) Breadcrumbs.init();

    initModalEvents();
    initSearch();

    cargarOwners();
});

function initModalEvents() {
    const modal = document.getElementById('ownerModal');
    const addBtn = document.getElementById('addOwnerBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const form = document.getElementById('ownerForm');

    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            abrirModalNuevoPropietario();
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
            await guardarPropietario();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
            const propModal = document.getElementById('propertiesModal');
            if (propModal && !propModal.classList.contains('hidden')) propModal.classList.add('hidden');
        }
    });
}

function initSearch() {
    const searchInput = document.getElementById('searchOwners');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        const filtrados = allOwners.filter(o => 
            (o.name && o.name.toLowerCase().includes(term)) ||
            (o.dni && o.dni.toLowerCase().includes(term)) ||
            (o.email && o.email.toLowerCase().includes(term)) ||
            (o.phone && o.phone.toLowerCase().includes(term))
        );
        renderizarTablaOwners(filtrados);
    });
}

async function cargarOwners() {
    const tbody = document.getElementById('ownersTableBody');
    try {
        UI.showLoading('ownersTableBody', 'Cargando propietarios...');
        allOwners = await OwnersAPI.getOwners();
        renderizarTablaOwners(allOwners);
    } catch (error) {
        console.error(error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-red-500">Error al cargar propietarios</td></tr>`;
        }
    } finally {
        UI.hideLoading('ownersTableBody');
    }
}

function renderizarTablaOwners(lista) {
    const tbody = document.getElementById('ownersTableBody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-8 text-center text-gray-400">
                    <i class="fas fa-user-tie text-3xl mb-2 opacity-50"></i>
                    <p>No hay propietarios registrados</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = lista.map(o => `
        <tr class="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition border-b border-gray-100 dark:border-slate-800">
            <td class="px-6 py-4 font-bold text-slate-900 dark:text-white">
                ${AppUtils.escapeHtml(o.name)}
                ${o.dni ? `<span class="block text-xs font-normal text-slate-400">DNI: ${AppUtils.escapeHtml(o.dni)}</span>` : ''}
            </td>
            <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${AppUtils.escapeHtml(o.email || '-')}</td>
            <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${AppUtils.escapeHtml(o.phone || '-')}</td>
            <td class="px-6 py-4">
                <button onclick="verPropiedadesPropietario(${o.id}, '${AppUtils.escapeHtml(o.name)}')" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition">
                    <i class="fas fa-building"></i> ${o.contracts_count || 0} contratos
                </button>
            </td>
            <td class="px-6 py-4 font-semibold text-emerald-600 dark:text-emerald-400">
                ${AppUtils.formatCurrency(o.total_income || 0)}
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-1">
                    <button onclick="editarPropietario(${o.id})" class="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="eliminarPropietario(${o.id})" class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition" title="Eliminar">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function abrirModalNuevoPropietario() {
    const modal = document.getElementById('ownerModal');
    const form = document.getElementById('ownerForm');
    const title = document.getElementById('modalTitle');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('ownerId').value = '';
    if (title) title.textContent = 'Nuevo Propietario';

    modal.classList.remove('hidden');
}

function editarPropietario(id) {
    const o = allOwners.find(item => item.id === id);
    if (!o) return;

    const modal = document.getElementById('ownerModal');
    const title = document.getElementById('modalTitle');
    if (!modal) return;

    document.getElementById('ownerId').value = o.id;
    document.getElementById('ownerDni').value = o.dni || '';
    document.getElementById('ownerName').value = o.name || '';
    document.getElementById('ownerEmail').value = o.email || '';
    document.getElementById('ownerPhone').value = o.phone || '';
    document.getElementById('ownerAddress').value = o.address || '';
    document.getElementById('ownerBankAccount').value = o.bank_account || '';
    document.getElementById('ownerNotes').value = o.notes || '';

    if (title) title.textContent = 'Editar Propietario';
    modal.classList.remove('hidden');
}

async function guardarPropietario() {
    const id = document.getElementById('ownerId').value;
    const dni = document.getElementById('ownerDni').value.trim();
    const name = document.getElementById('ownerName').value.trim();
    const email = document.getElementById('ownerEmail').value.trim();
    const phone = document.getElementById('ownerPhone').value.trim();
    const address = document.getElementById('ownerAddress').value.trim();
    const bank_account = document.getElementById('ownerBankAccount').value.trim();
    const notes = document.getElementById('ownerNotes').value.trim();

    if (!name) {
        UI.toast('El nombre es obligatorio', 'warning');
        return;
    }

    const payload = { dni, name, email, phone, address, bank_account, notes };

    try {
        if (id) {
            payload.id = parseInt(id);
            await OwnersAPI.updateOwner(payload);
            UI.toast('Propietario actualizado', 'success');
        } else {
            await OwnersAPI.createOwner(payload);
            UI.toast('Propietario registrado', 'success');
        }

        document.getElementById('ownerModal').classList.add('hidden');
        await cargarOwners();
    } catch (e) {
        UI.toast(e.message || 'Error al guardar propietario', 'error');
    }
}

async function eliminarPropietario(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este propietario?')) return;

    try {
        await OwnersAPI.deleteOwner(id);
        UI.toast('Propietario eliminado', 'success');
        await cargarOwners();
    } catch (err) {
        UI.toast(err.message || 'No se pudo eliminar el propietario', 'error');
    }
}

// ============================================
// MODAL DE PROPIEDADES VINCULADAS AL PROPIETARIO
// ============================================

async function verPropiedadesPropietario(ownerId, ownerName) {
    currentOwnerViewing = { id: ownerId, name: ownerName };
    const modal = document.getElementById('propertiesModal');
    const title = document.getElementById('modalOwnerName');
    const listContainer = document.getElementById('propertiesList');

    if (!modal) return;

    if (title) title.textContent = `Propiedades de ${ownerName}`;
    modal.classList.remove('hidden');

    listContainer.innerHTML = `<div class="text-center py-6"><i class="fas fa-spinner fa-spin text-2xl text-blue-600"></i><p class="mt-2 text-sm text-slate-500">Cargando inmuebles...</p></div>`;

    try {
        const props = await OwnersAPI.getOwnerProperties(ownerId);

        if (!props || props.length === 0) {
            listContainer.innerHTML = `<div class="text-center py-6 text-slate-400"><i class="fas fa-building text-3xl mb-2 opacity-50"></i><p>Este propietario no tiene propiedades registradas.</p></div>`;
            return;
        }

        listContainer.innerHTML = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-slate-700 text-sm">
                    <thead>
                        <tr class="text-left text-xs uppercase text-slate-400">
                            <th class="py-2">Dirección</th>
                            <th class="py-2">Tipo</th>
                            <th class="py-2">Inquilino Actual</th>
                            <th class="py-2 text-right">Renta Mensual</th>
                            <th class="py-2 text-center">Estado Contrato</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-slate-800">
                        ${props.map(p => `
                            <tr>
                                <td class="py-3 font-semibold text-slate-800 dark:text-slate-200">${AppUtils.escapeHtml(p.address)}</td>
                                <td class="py-3 text-slate-500 uppercase text-xs">${AppUtils.escapeHtml(p.type)}</td>
                                <td class="py-3 text-slate-700 dark:text-slate-300">${AppUtils.escapeHtml(p.tenant_name || 'Desocupada')}</td>
                                <td class="py-3 text-right font-bold text-emerald-600">${p.base_amount ? AppUtils.formatCurrency(p.base_amount) : '-'}</td>
                                <td class="py-3 text-center">
                                    <span class="badge ${p.contract_status === 'active' ? 'badge-success' : 'badge-warning'}">
                                        ${p.contract_status === 'active' ? 'Alquilada' : 'Disponible'}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        listContainer.innerHTML = `<p class="text-red-500 text-center py-4">Error al cargar las propiedades del propietario.</p>`;
    }
}

function closePropertiesModal() {
    const modal = document.getElementById('propertiesModal');
    if (modal) modal.classList.add('hidden');
}

// Exportar al objeto global
window.abrirModalNuevoPropietario = abrirModalNuevoPropietario;
window.editarPropietario = editarPropietario;
window.eliminarPropietario = eliminarPropietario;
window.verPropiedadesPropietario = verPropiedadesPropietario;
window.closePropertiesModal = closePropertiesModal;