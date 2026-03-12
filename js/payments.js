// payments.js - Sistema de Pagos y Cobranzas
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
            
            if (response.status === 401) {
                localStorage.removeItem('authToken');
                localStorage.removeItem('user');
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
            
            return data;
        } catch (error) {
            console.error('❌ API Error:', error);
            throw error;
        }
    },
    
    async getPayments(filters = {}) {
        const params = new URLSearchParams();
        if (filters.contract_id) params.append('contract_id', filters.contract_id);
        if (filters.status) params.append('status', filters.status);
        if (filters.from_date) params.append('from_date', filters.from_date);
        if (filters.to_date) params.append('to_date', filters.to_date);
        
        const queryString = params.toString();
        return this.request(`/payments${queryString ? '?' + queryString : ''}`);
    },
    
    async createPayment(payment) {
        return this.request('/payments', {
            method: 'POST',
            body: JSON.stringify(payment)
        });
    },
    
    async updatePayment(id, data) {
        return this.request('/payments', {
            method: 'PUT',
            body: JSON.stringify({ id, ...data })
        });
    },
    
    async deletePayment(id) {
        return this.request(`/payments?id=${id}`, {
            method: 'DELETE'
        });
    },
    
    async getDelinquency() {
        return this.request('/delinquency');
    },
    
    async getContracts() {
        return this.request('/contracts');
    }
};

// Estado global
let currentPayments = [];
let currentContracts = [];
let currentDelinquency = [];
let selectedPaymentId = null;

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    console.log('💰 Página de pagos cargada');
    
    if (!window.UI) {
        window.UI = {
            toast: (msg, type) => alert(`${type}: ${msg}`),
            confirm: (options) => {
                if (confirm(options.message)) options.onConfirm();
                else if (options.onCancel) options.onCancel();
            },
            formatCurrency: (amount) => `$${Number(amount).toLocaleString()}`,
            formatDate: (date) => new Date(date).toLocaleDateString('es-ES')
        };
    }
    
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    initSidebar();
    initModals();
    initEventListeners();
    await loadContracts();
    await loadPayments();
    await loadDelinquency();
    
    // Setear fechas por defecto
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    document.getElementById('filterDateFrom').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('filterDateTo').value = today.toISOString().split('T')[0];
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

function initModals() {
    // Modal de registro de pago
    const modal = document.getElementById('paymentModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelModalBtn');
    const overlay = document.getElementById('modalOverlay');
    const form = document.getElementById('paymentForm');
    
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
            await guardarPago();
        });
    }
    
    // Modal de confirmación de pago
    const payModal = document.getElementById('payModal');
    const cancelPayBtn = document.getElementById('cancelPayBtn');
    const confirmPayBtn = document.getElementById('confirmPayBtn');
    
    if (cancelPayBtn) {
        cancelPayBtn.addEventListener('click', () => {
            payModal.classList.add('hidden');
        });
    }
    
    if (confirmPayBtn) {
        confirmPayBtn.addEventListener('click', async () => {
            await confirmarPago();
        });
    }
    
    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modal && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
            if (payModal && !payModal.classList.contains('hidden')) {
                payModal.classList.add('hidden');
            }
        }
    });
}

function initEventListeners() {
    document.getElementById('registerPaymentBtn').addEventListener('click', () => {
        abrirModalNuevoPago();
    });
    
    document.getElementById('applyFiltersBtn').addEventListener('click', aplicarFiltros);
    
    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
        document.getElementById('filterContract').value = '';
        document.getElementById('filterStatus').value = '';
        
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        document.getElementById('filterDateFrom').value = thirtyDaysAgo.toISOString().split('T')[0];
        document.getElementById('filterDateTo').value = today.toISOString().split('T')[0];
        
        aplicarFiltros();
    });
}

async function loadContracts() {
    try {
        currentContracts = await API.getContracts();
        populateContractSelect();
    } catch (error) {
        console.error('Error cargando contratos:', error);
    }
}

function populateContractSelect() {
    const select = document.getElementById('filterContract');
    const modalSelect = document.getElementById('paymentContractId');
    
    if (!select || !modalSelect) return;
    
    const options = '<option value="">Todos los contratos</option>' +
        currentContracts.map(c => 
            `<option value="${c.id}">#${c.id} - ${c.tenant_name || 'N/A'}</option>`
        ).join('');
    
    select.innerHTML = options;
    modalSelect.innerHTML = '<option value="">Seleccionar contrato...</option>' +
        currentContracts.map(c => 
            `<option value="${c.id}">#${c.id} - ${c.tenant_name || 'N/A'}</option>`
        ).join('');
}

async function loadPayments() {
    try {
        const filters = obtenerFiltros();
        currentPayments = await API.getPayments(filters);
        renderizarTablaPagos(currentPayments);
        actualizarResumenMensual();
    } catch (error) {
        console.error('Error cargando pagos:', error);
        document.getElementById('paymentsTableBody').innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-3 text-red-400"></i>
                    <p>Error al cargar los pagos</p>
                </td>
            </tr>
        `;
    }
}

async function loadDelinquency() {
    try {
        currentDelinquency = await API.getDelinquency();
        actualizarResumenMorosidad();
    } catch (error) {
        console.error('Error cargando morosidad:', error);
    }
}

function obtenerFiltros() {
    return {
        contract_id: document.getElementById('filterContract').value,
        status: document.getElementById('filterStatus').value,
        from_date: document.getElementById('filterDateFrom').value,
        to_date: document.getElementById('filterDateTo').value
    };
}

function aplicarFiltros() {
    loadPayments();
}

function renderizarTablaPagos(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;
    
    if (!payments || payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">No hay pagos registrados</td></tr>';
        return;
    }
    
    const today = new Date();
    
    tbody.innerHTML = payments.map(p => {
        const dueDate = new Date(p.due_date);
        const isOverdue = p.status === 'pending' && dueDate < today;
        
        let statusClass = 'bg-yellow-100 text-yellow-800';
        let statusText = 'Pendiente';
        
        if (isOverdue) {
            statusClass = 'bg-red-100 text-red-800';
            statusText = 'Vencido';
        } else if (p.status === 'paid') {
            statusClass = 'bg-green-100 text-green-800';
            statusText = 'Pagado';
        }
        
        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-6 py-4">#${p.contract_id}</td>
                <td class="px-6 py-4 font-medium">${p.tenant_name || 'N/A'}</td>
                <td class="px-6 py-4">${p.concept_name || 'Alquiler'}</td>
                <td class="px-6 py-4 font-bold">${UI.formatCurrency(p.total_amount)}</td>
                <td class="px-6 py-4 ${isOverdue ? 'text-red-600 font-medium' : ''}">${UI.formatDate(p.due_date)}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs rounded-full ${statusClass}">${statusText}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex gap-2">
                        ${p.status !== 'paid' ? `
                            <button onclick="abrirModalPagar(${p.id})" class="text-green-600 hover:text-green-800 p-2 rounded-lg hover:bg-green-50 transition" title="Marcar como pagado">
                                <i class="fas fa-check"></i>
                            </button>
                        ` : ''}
                        <button onclick="eliminarPago(${p.id})" class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function actualizarResumenMorosidad() {
    const totalOverdue = currentDelinquency.reduce((sum, d) => sum + Number(d.total_amount), 0);
    document.getElementById('totalOverdue').textContent = UI.formatCurrency(totalOverdue);
    document.getElementById('countOverdue').textContent = currentDelinquency.length;
}

function actualizarResumenMensual() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const upcoming = currentPayments.filter(p => {
        if (p.status === 'paid') return false;
        const dueDate = new Date(p.due_date);
        return dueDate <= sevenDaysFromNow && dueDate >= today;
    });
    
    const monthlyPaid = currentPayments.filter(p => {
        if (p.status !== 'paid') return false;
        const paidDate = new Date(p.paid_at || p.updated_at);
        return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
    });
    
    const totalUpcoming = upcoming.reduce((sum, p) => sum + Number(p.total_amount), 0);
    const totalMonthly = monthlyPaid.reduce((sum, p) => sum + Number(p.total_amount), 0);
    
    document.getElementById('totalUpcoming').textContent = UI.formatCurrency(totalUpcoming);
    document.getElementById('countUpcoming').textContent = upcoming.length;
    document.getElementById('totalMonth').textContent = UI.formatCurrency(totalMonthly);
    document.getElementById('countMonth').textContent = monthlyPaid.length;
}

function abrirModalNuevoPago() {
    document.getElementById('modalTitle').textContent = 'Registrar Nuevo Pago';
    document.getElementById('paymentForm').reset();
    document.getElementById('paymentId').value = '';
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('paymentDueDate').value = today;
    document.getElementById('paymentDate').value = today;
    
    document.getElementById('paymentModal').classList.remove('hidden');
}

async function guardarPago() {
    const paymentData = {
        contract_id: parseInt(document.getElementById('paymentContractId').value),
        concept_id: parseInt(document.getElementById('paymentConcept').value),
        amount: parseFloat(document.getElementById('paymentAmount').value),
        commission: parseFloat(document.getElementById('paymentCommission').value) || 0,
        due_date: document.getElementById('paymentDueDate').value,
        payment_date: document.getElementById('paymentDate').value || null,
        payment_method: document.getElementById('paymentMethod').value,
        reference_number: document.getElementById('paymentReference').value,
        notes: document.getElementById('paymentNotes').value
    };
    
    if (paymentData.payment_date) {
        paymentData.status = 'paid';
    }
    
    const id = document.getElementById('paymentId').value;
    
    // Validaciones
    if (!paymentData.contract_id) return UI.toast('Debes seleccionar un contrato', 'warning');
    if (!paymentData.amount || paymentData.amount <= 0) return UI.toast('Monto inválido', 'warning');
    
    const submitBtn = document.querySelector('#paymentForm button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';
    submitBtn.disabled = true;
    
    try {
        if (id) {
            await API.updatePayment(id, paymentData);
            UI.toast('Pago actualizado', 'success');
        } else {
            await API.createPayment(paymentData);
            UI.toast('Pago registrado', 'success');
        }
        
        document.getElementById('paymentModal').classList.add('hidden');
        await loadPayments();
        await loadDelinquency();
    } catch (error) {
        console.error('Error:', error);
        UI.toast('Error: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function abrirModalPagar(paymentId) {
    selectedPaymentId = paymentId;
    document.getElementById('payModal').classList.remove('hidden');
}

async function confirmarPago() {
    if (!selectedPaymentId) return;
    
    try {
        await API.updatePayment(selectedPaymentId, { 
            status: 'paid',
            paid_at: new Date()
        });
        
        UI.toast('Pago marcado como realizado', 'success');
        document.getElementById('payModal').classList.add('hidden');
        await loadPayments();
        await loadDelinquency();
    } catch (error) {
        UI.toast('Error al actualizar pago', 'error');
    }
}

async function eliminarPago(id) {
    if (!confirm('¿Estás seguro de eliminar este pago?')) return;
    
    try {
        await API.deletePayment(id);
        UI.toast('Pago eliminado', 'success');
        await loadPayments();
        await loadDelinquency();
    } catch (error) {
        UI.toast('Error al eliminar', 'error');
    }
}

// Funciones globales para los onclick
window.abrirModalPagar = abrirModalPagar;
window.eliminarPago = eliminarPago;