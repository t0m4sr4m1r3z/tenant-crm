// js/payments.js - Gestión de Cobranzas, Pagos y Morosidad
const PaymentsAPI = {
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

    getPayments() { return this.request('/payments'); },
    createPayment(data) { return this.request('/payments', { method: 'POST', body: JSON.stringify(data) }); },
    updatePayment(data) { return this.request('/payments', { method: 'PUT', body: JSON.stringify(data) }); },
    deletePayment(id) { return this.request(`/payments?id=${id}`, { method: 'DELETE' }); },
    getContracts() { return this.request('/contracts'); }
};

// Estado global
let allPayments = [];
let filteredPayments = [];
let allContracts = [];
let paymentToConfirm = null;

// Mapa de conceptos
const CONCEPT_MAP = {
    '1': 'Alquiler',
    '2': 'Expensas',
    '3': 'Depósito',
    '4': 'Actualización',
    '5': 'Multa'
};

document.addEventListener('DOMContentLoaded', async () => {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    if (window.AppSidebar) AppSidebar.init();
    if (window.Breadcrumbs) Breadcrumbs.init();

    initModals();
    initFilterEvents();

    await Promise.all([
        cargarContratosSelect(),
        cargarPagos()
    ]);
});

// ============================================
// CARGA DE DATOS
// ============================================

async function cargarContratosSelect() {
    try {
        allContracts = await PaymentsAPI.getContracts();
        const modalSelect = document.getElementById('paymentContractId');
        const filterSelect = document.getElementById('filterContract');

        let modalOpts = '<option value="">Seleccionar contrato...</option>';
        let filterOpts = '<option value="">Todos los contratos</option>';

        allContracts.forEach(c => {
            const label = `Contrato #${c.id} - ${AppUtils.escapeHtml(c.tenant_name || 'Sin Inquilino')} (${AppUtils.escapeHtml(c.property_address || 'Sin propiedad')})`;
            modalOpts += `<option value="${c.id}" data-amount="${c.base_amount}" data-commission="${c.agent_commission}">${label}</option>`;
            filterOpts += `<option value="${c.id}">${label}</option>`;
        });

        if (modalSelect) modalSelect.innerHTML = modalOpts;
        if (filterSelect) filterSelect.innerHTML = filterOpts;

        // Auto-completar monto y comisión al seleccionar contrato en el formulario
        if (modalSelect) {
            modalSelect.addEventListener('change', () => {
                const selectedOpt = modalSelect.options[modalSelect.selectedIndex];
                if (selectedOpt && selectedOpt.value) {
                    const baseAmount = parseFloat(selectedOpt.dataset.amount || 0);
                    const commRate = parseFloat(selectedOpt.dataset.commission || 5);
                    const calculatedCommission = (baseAmount * commRate) / 100;

                    const amountInput = document.getElementById('paymentAmount');
                    const commInput = document.getElementById('paymentCommission');

                    if (amountInput && !amountInput.value) amountInput.value = baseAmount;
                    if (commInput && (!commInput.value || commInput.value === '0')) commInput.value = calculatedCommission.toFixed(2);
                }
            });
        }
    } catch (e) {
        console.error('Error al cargar contratos:', e);
    }
}

async function cargarPagos() {
    try {
        UI.showLoading('paymentsTableBody', 'Cargando cobranzas...');
        allPayments = await PaymentsAPI.getPayments();
        aplicarFiltros();
    } catch (error) {
        console.error(error);
        UI.toast('Error al cargar pagos', 'error');
        const tbody = document.getElementById('paymentsTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-500">Error al cargar pagos</td></tr>`;
        }
    } finally {
        UI.hideLoading('paymentsTableBody');
    }
}

// ============================================
// FILTROS Y ESTADÍSTICAS (KPIS)
// ============================================

function initFilterEvents() {
    const applyBtn = document.getElementById('applyFiltersBtn');
    const clearBtn = document.getElementById('clearFiltersBtn');
    const registerBtn = document.getElementById('registerPaymentBtn');

    if (applyBtn) applyBtn.addEventListener('click', aplicarFiltros);
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.getElementById('filterContract').value = '';
            document.getElementById('filterStatus').value = '';
            document.getElementById('filterDateFrom').value = '';
            document.getElementById('filterDateTo').value = '';
            aplicarFiltros();
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener('click', abrirModalNuevoPago);
    }
}

function aplicarFiltros() {
    const contractId = document.getElementById('filterContract')?.value;
    const status = document.getElementById('filterStatus')?.value;
    const dateFrom = document.getElementById('filterDateFrom')?.value;
    const dateTo = document.getElementById('filterDateTo')?.value;

    filteredPayments = allPayments.filter(p => {
        if (contractId && String(p.contract_id) !== String(contractId)) return false;
        if (status && p.status !== status) return false;
        if (dateFrom && p.due_date < dateFrom) return false;
        if (dateTo && p.due_date > dateTo) return false;
        return true;
    });

    actualizarKPIs();
    renderizarTablaPagos();
}

function actualizarKPIs() {
    // Usar fecha local exacta sin desfasaje UTC
    const hoyStr = AppUtils.getTodayString();
    
    // Próximos 7 días en fecha local
    const proximaSemana = new Date();
    proximaSemana.setDate(proximaSemana.getDate() + 7);
    const py = proximaSemana.getFullYear();
    const pm = String(proximaSemana.getMonth() + 1).padStart(2, '0');
    const pd = String(proximaSemana.getDate()).padStart(2, '0');
    const proximaSemanaStr = `${py}-${pm}-${pd}`;

    const mesActualStr = hoyStr.slice(0, 7); // "YYYY-MM"

    let totalOverdue = 0, countOverdue = 0;
    let totalUpcoming = 0, countUpcoming = 0;
    let totalMonth = 0, countMonth = 0;

    allPayments.forEach(p => {
        const monto = parseFloat(p.amount) || 0;

        if (p.status === 'overdue') {
            totalOverdue += monto;
            countOverdue++;
        } else if (p.status === 'pending') {
            if (p.due_date >= hoyStr && p.due_date <= proximaSemanaStr) {
                totalUpcoming += monto;
                countUpcoming++;
            }
        } else if (p.status === 'paid') {
            const fechaPago = p.payment_date || p.due_date;
            if (fechaPago && fechaPago.startsWith(mesActualStr)) {
                totalMonth += monto;
                countMonth++;
            }
        }
    });

    document.getElementById('totalOverdue').textContent = AppUtils.formatCurrency(totalOverdue);
    document.getElementById('countOverdue').textContent = countOverdue;

    document.getElementById('totalUpcoming').textContent = AppUtils.formatCurrency(totalUpcoming);
    document.getElementById('countUpcoming').textContent = countUpcoming;

    document.getElementById('totalMonth').textContent = AppUtils.formatCurrency(totalMonth);
    document.getElementById('countMonth').textContent = countMonth;
}

// ============================================
// RENDER TABLA
// ============================================

function renderizarTablaPagos() {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;

    if (!filteredPayments || filteredPayments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-gray-400 dark:text-slate-500">
                    <i class="fas fa-receipt text-3xl mb-2 opacity-50"></i>
                    <p>No se encontraron pagos con los filtros aplicados</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredPayments.map(p => {
        let badgeClass = 'badge-warning';
        let badgeText = 'Pendiente';

        if (p.status === 'paid') {
            badgeClass = 'badge-success';
            badgeText = 'Pagado';
        } else if (p.status === 'overdue') {
            badgeClass = 'badge-danger';
            badgeText = 'Vencido';
        }

        const conceptoTexto = CONCEPT_MAP[p.concept] || p.concept || 'Alquiler';
        // Formateo seguro: si p.due_date es '2026-09-09', devuelve '09/09/2026' exactamente
        const vencimientoFormatted = AppUtils.formatDate(p.due_date);

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition border-b border-gray-100 dark:border-slate-800">
                <td class="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">#${p.contract_id}</td>
                <td class="px-6 py-4 text-slate-700 dark:text-slate-300">
                    <p class="font-medium">${AppUtils.escapeHtml(p.tenant_name || 'N/A')}</p>
                    <span class="text-xs text-slate-400">${AppUtils.escapeHtml(p.property_address || '')}</span>
                </td>
                <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${AppUtils.escapeHtml(conceptoTexto)}</td>
                <td class="px-6 py-4 font-bold text-slate-900 dark:text-white">${AppUtils.formatCurrency(p.amount)}</td>
                <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${vencimientoFormatted}</td>
                <td class="px-6 py-4">
                    <span class="badge ${badgeClass}">${badgeText}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-1">
                        ${p.status !== 'paid' ? `
                        <button onclick="abrirModalConfirmarPago(${p.id})" 
                                class="text-emerald-600 hover:text-emerald-800 p-2 rounded-lg hover:bg-emerald-50 transition" 
                                title="Marcar como Pagado">
                            <i class="fas fa-check-circle text-lg"></i>
                        </button>` : ''}
                        <button onclick="editarPago(${p.id})" 
                                class="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition" 
                                title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="eliminarPago(${p.id})" 
                                class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition" 
                                title="Eliminar">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// MODAL NUEVO / EDITAR PAGO
// ============================================

function initModals() {
    const modal = document.getElementById('paymentModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelModalBtn');
    const overlay = document.getElementById('modalOverlay');
    const form = document.getElementById('paymentForm');

    const cerrarModal = () => modal.classList.add('hidden');

    if (closeBtn) closeBtn.addEventListener('click', cerrarModal);
    if (cancelBtn) cancelBtn.addEventListener('click', cerrarModal);
    if (overlay) overlay.addEventListener('click', cerrarModal);

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await guardarPago();
        });
    }

    // Modal de confirmación de pago rápido
    const payModal = document.getElementById('payModal');
    const cancelPayBtn = document.getElementById('cancelPayBtn');
    const confirmPayBtn = document.getElementById('confirmPayBtn');

    if (cancelPayBtn) cancelPayBtn.addEventListener('click', () => payModal.classList.add('hidden'));
    if (confirmPayBtn) confirmPayBtn.addEventListener('click', confirmarPagoRapido);
}

function abrirModalNuevoPago() {
    const modal = document.getElementById('paymentModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('paymentForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('paymentId').value = '';
    title.textContent = 'Registrar Nuevo Pago';

    // Fecha actual local
    document.getElementById('paymentDueDate').value = AppUtils.getTodayString();
    document.getElementById('paymentConcept').value = '1';
    document.getElementById('paymentMethod').value = 'transferencia';
    document.getElementById('paymentCommission').value = '0';

    modal.classList.remove('hidden');
}

function editarPago(paymentId) {
    const p = allPayments.find(item => item.id === paymentId);
    if (!p) return;

    const modal = document.getElementById('paymentModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('paymentForm');
    if (!modal || !form) return;

    form.reset();
    title.textContent = 'Editar Pago';

    document.getElementById('paymentId').value = p.id;
    document.getElementById('paymentContractId').value = p.contract_id;
    
    // Mapear concepto
    const conceptSelect = document.getElementById('paymentConcept');
    let conceptValue = '1';
    for (const [k, v] of Object.entries(CONCEPT_MAP)) {
        if (v === p.concept) conceptValue = k;
    }
    conceptSelect.value = conceptValue;

    document.getElementById('paymentAmount').value = p.amount;
    document.getElementById('paymentCommission').value = p.commission || 0;
    document.getElementById('paymentDueDate').value = p.due_date ? p.due_date.slice(0, 10) : '';
    document.getElementById('paymentDate').value = p.payment_date ? p.payment_date.slice(0, 10) : '';
    document.getElementById('paymentMethod').value = p.payment_method || 'transferencia';
    document.getElementById('paymentReference').value = p.reference || '';
    document.getElementById('paymentNotes').value = p.notes || '';

    modal.classList.remove('hidden');
}

async function guardarPago() {
    const id = document.getElementById('paymentId').value;
    const contract_id = document.getElementById('paymentContractId').value;
    const conceptCode = document.getElementById('paymentConcept').value;
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const commission = parseFloat(document.getElementById('paymentCommission').value) || 0;
    const due_date = document.getElementById('paymentDueDate').value;
    const payment_date = document.getElementById('paymentDate').value || null;
    const payment_method = document.getElementById('paymentMethod').value;
    const reference = document.getElementById('paymentReference').value.trim();
    const notes = document.getElementById('paymentNotes').value.trim();

    if (!contract_id || isNaN(amount) || !due_date) {
        UI.toast('Por favor completa contrato, monto y fecha de vencimiento', 'warning');
        return;
    }

    const payload = {
        contract_id: parseInt(contract_id, 10),
        concept: CONCEPT_MAP[conceptCode] || 'Alquiler',
        amount,
        commission,
        due_date,
        payment_date,
        payment_method,
        reference,
        notes
    };

    try {
        if (id) {
            payload.id = parseInt(id, 10);
            await PaymentsAPI.updatePayment(payload);
            UI.toast('Pago actualizado con éxito', 'success');
        } else {
            await PaymentsAPI.createPayment(payload);
            UI.toast('Pago registrado con éxito', 'success');
        }

        document.getElementById('paymentModal').classList.add('hidden');
        await cargarPagos();
    } catch (e) {
        UI.toast(e.message || 'Error al procesar el pago', 'error');
    }
}

// ============================================
// COBRO RÁPIDO (1 CLIC)
// ============================================

function abrirModalConfirmarPago(paymentId) {
    paymentToConfirm = paymentId;
    const payModal = document.getElementById('payModal');
    if (payModal) payModal.classList.remove('hidden');
}

async function confirmarPagoRapido() {
    if (!paymentToConfirm) return;

    try {
        await PaymentsAPI.updatePayment({
            id: paymentToConfirm,
            status: 'paid',
            payment_date: AppUtils.getTodayString()
        });

        UI.toast('Cobro registrado correctamente', 'success');
        document.getElementById('payModal').classList.add('hidden');
        paymentToConfirm = null;
        await cargarPagos();
    } catch (err) {
        UI.toast('Error al confirmar el cobro', 'error');
    }
}

async function eliminarPago(paymentId) {
    if (!confirm('¿Estás seguro de eliminar este registro de pago?')) return;

    try {
        await PaymentsAPI.deletePayment(paymentId);
        UI.toast('Pago eliminado', 'success');
        await cargarPagos();
    } catch (e) {
        UI.toast('Error al eliminar pago', 'error');
    }
}

// Exportar al objeto global para eventos inline en HTML
window.abrirModalNuevoPago = abrirModalNuevoPago;
window.editarPago = editarPago;
window.eliminarPago = eliminarPago;
window.abrirModalConfirmarPago = abrirModalConfirmarPago;