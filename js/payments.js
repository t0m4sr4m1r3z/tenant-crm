// js/payments.js - Cobranzas, Pagos y Emisión Automática de Recibos
const API = {
    baseUrl: '/.netlify/functions',

    async request(endpoint, options = {}) {
        const token = sessionStorage.getItem('authToken');
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': token }),
            ...options.headers
        };

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });
            if (response.status === 401) {
                sessionStorage.removeItem('authToken');
                window.location.href = '/login.html';
                throw new Error('Sesión expirada');
            }

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Error en la petición');
            }
            return data;
        } catch (error) {
            console.error('❌ API Error:', error);
            throw error;
        }
    },

    getPayments() { return this.request('/payments'); },
    createPayment(payment) { return this.request('/payments', { method: 'POST', body: JSON.stringify(payment) }); },
    updatePayment(payment) { return this.request('/payments', { method: 'PUT', body: JSON.stringify(payment) }); },
    deletePayment(id) { return this.request(`/payments?id=${id}`, { method: 'DELETE' }); },
    getContracts() { return this.request('/contracts'); },
    getTenants() { return this.request('/tenants'); },
    getProperties() { return this.request('/properties'); }
};

// Estado
let allPayments = [];
let filteredPayments = [];
let allContracts = [];
let currentPaymentToPay = null;
let currentReceiptData = null;

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    if (window.AppSidebar) AppSidebar.init();
    if (window.Breadcrumbs) Breadcrumbs.init();

    initEventListeners();
    await Promise.all([cargarContratos(), cargarPagos()]);
});

function initEventListeners() {
    // Abrir modal registro
    const registerBtn = document.getElementById('registerPaymentBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', abrirModalNuevoPago);
    }

    // Cerrar modal registro
    const closeBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelModalBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    if (closeBtn) closeBtn.addEventListener('click', cerrarModalPago);
    if (cancelBtn) cancelBtn.addEventListener('click', cerrarModalPago);
    if (modalOverlay) modalOverlay.addEventListener('click', cerrarModalPago);

    // Formulario de pago
    const paymentForm = document.getElementById('paymentForm');
    if (paymentForm) {
        paymentForm.addEventListener('submit', guardarPago);
    }

    // Modal de confirmación rápida de pago
    const cancelPayBtn = document.getElementById('cancelPayBtn');
    const confirmPayBtn = document.getElementById('confirmPayBtn');
    if (cancelPayBtn) cancelPayBtn.addEventListener('click', () => document.getElementById('payModal').classList.add('hidden'));
    if (confirmPayBtn) confirmPayBtn.addEventListener('click', confirmarPagoRapido);

    // Cambio en selector de contrato para autocompletar monto y comisión
    const contractSelect = document.getElementById('paymentContractId');
    if (contractSelect) {
        contractSelect.addEventListener('change', (e) => {
            const cid = parseInt(e.target.value);
            const contrato = allContracts.find(c => c.id === cid);
            if (contrato) {
                const amountInput = document.getElementById('paymentAmount');
                const commInput = document.getElementById('paymentCommission');
                if (amountInput) amountInput.value = contrato.base_amount || 0;
                if (commInput) {
                    const pct = parseFloat(contrato.agent_commission) || 0;
                    commInput.value = ((contrato.base_amount * pct) / 100).toFixed(2);
                }
            }
        });
    }

    // Filtros
    document.getElementById('applyFiltersBtn')?.addEventListener('click', aplicarFiltros);
    document.getElementById('clearFiltersBtn')?.addEventListener('click', limpiarFiltros);
}

// ============================================
// CARGA DE DATOS
// ============================================

async function cargarContratos() {
    try {
        allContracts = await API.getContracts();
        const select = document.getElementById('paymentContractId');
        const filterSelect = document.getElementById('filterContract');
        
        const options = (allContracts || []).map(c => {
            const inquilino = c.tenant_name || 'Inquilino';
            const propiedad = c.property_address ? ` - ${c.property_address}` : '';
            return `<option value="${c.id}">Contrato #${c.id}: ${inquilino}${propiedad}</option>`;
        }).join('');

        if (select) select.innerHTML = '<option value="">Seleccionar contrato...</option>' + options;
        if (filterSelect) filterSelect.innerHTML = '<option value="">Todos los contratos</option>' + options;
    } catch (e) {
        console.error('Error cargando contratos:', e);
    }
}

async function cargarPagos() {
    const tbody = document.getElementById('paymentsTableBody');
    try {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-500"><i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-2">Cargando cobranzas...</p></td></tr>`;
        
        allPayments = await API.getPayments();
        filteredPayments = [...(allPayments || [])];

        actualizarResumenCards();
        renderizarTablaPagos();
    } catch (error) {
        console.error('Error al cargar pagos:', error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">Error al obtener cobranzas.</td></tr>`;
    }
}

// ============================================
// RENDERIZADO Y KPIS
// ============================================

function actualizarResumenCards() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let totalOverdue = 0, countOverdue = 0;
    let totalUpcoming = 0, countUpcoming = 0;
    let totalMonth = 0, countMonth = 0;

    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    (allPayments || []).forEach(p => {
        const monto = parseFloat(p.amount) || 0;
        const dueDate = p.due_date ? new Date(p.due_date) : null;
        const payDate = p.payment_date ? new Date(p.payment_date) : null;

        if (p.status === 'paid') {
            if (payDate && payDate.getMonth() === mesActual && payDate.getFullYear() === anioActual) {
                totalMonth += monto;
                countMonth++;
            }
        } else {
            if (dueDate) {
                const diffDias = Math.round((dueDate - hoy) / (1000 * 60 * 60 * 24));
                if (diffDias < 0 || p.status === 'overdue') {
                    totalOverdue += monto;
                    countOverdue++;
                } else if (diffDias <= 7) {
                    totalUpcoming += monto;
                    countUpcoming++;
                }
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

function renderizarTablaPagos() {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;

    if (!filteredPayments || filteredPayments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400"><i class="fas fa-receipt text-3xl mb-2"></i><p>No se encontraron registros de pago.</p></td></tr>`;
        return;
    }

    tbody.innerHTML = filteredPayments.map(p => {
        const isPaid = p.status === 'paid';
        const isOverdue = p.status === 'overdue';
        
        let badgeClass = 'badge-warning';
        let badgeText = 'Pendiente';
        if (isPaid) {
            badgeClass = 'badge-success';
            badgeText = 'Pagado';
        } else if (isOverdue) {
            badgeClass = 'badge-danger';
            badgeText = 'Vencido';
        }

        const inquilino = p.tenant_name || 'Inquilino';
        const concepto = p.concept || 'Alquiler';
        const vencimiento = p.due_date ? AppUtils.formatDate(p.due_date) : '-';

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800 text-sm">
                <td class="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">#${p.contract_id || p.id}</td>
                <td class="px-6 py-4 text-slate-700 dark:text-slate-300 font-semibold">${AppUtils.escapeHtml(inquilino)}</td>
                <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${AppUtils.escapeHtml(concepto)}</td>
                <td class="px-6 py-4 font-bold text-slate-900 dark:text-white">${AppUtils.formatCurrency(p.amount)}</td>
                <td class="px-6 py-4 text-slate-600 dark:text-slate-400">${vencimiento}</td>
                <td class="px-6 py-4"><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-1">
                        <!-- BOTÓN DE VER / EMITIR RECIBO -->
                        <button onclick="abrirReciboPago(${p.id})" 
                                class="text-purple-600 hover:text-purple-800 p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 transition"
                                title="Ver / Imprimir Recibo">
                            <i class="fas fa-receipt"></i>
                        </button>
                        
                        ${!isPaid ? `
                        <button onclick="abrirModalConfirmarPago(${p.id})" 
                                class="text-emerald-600 hover:text-emerald-800 p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition"
                                title="Marcar como Pagado">
                            <i class="fas fa-check-circle"></i>
                        </button>` : ''}

                        <button onclick="eliminarPago(${p.id})" 
                                class="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition"
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
// MODAL DE REGISTRO & AUTO-RECIBO
// ============================================

function abrirModalNuevoPago() {
    const form = document.getElementById('paymentForm');
    if (form) form.reset();
    
    document.getElementById('paymentId').value = '';
    document.getElementById('modalTitle').textContent = 'Registrar Nuevo Pago';

    const hoyStr = new Date().toISOString().slice(0, 10);
    document.getElementById('paymentDueDate').value = hoyStr;
    document.getElementById('paymentDate').value = hoyStr;

    document.getElementById('paymentModal').classList.remove('hidden');
}

function cerrarModalPago() {
    document.getElementById('paymentModal').classList.add('hidden');
}

async function guardarPago(e) {
    e.preventDefault();

    const form = document.getElementById('paymentForm');
    if (window.UI) UI.clearAllFieldErrors(form);

    const contractId = document.getElementById('paymentContractId').value;
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const dueDate = document.getElementById('paymentDueDate').value;

    if (!contractId || isNaN(amount) || !dueDate) {
        UI.toast('Por favor completa todos los campos requeridos', 'error');
        return;
    }

    const payDate = document.getElementById('paymentDate').value;
    const submitBtn = document.getElementById('submitPaymentBtn');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';

        const paymentData = {
            contract_id: parseInt(contractId),
            amount: amount,
            commission: parseFloat(document.getElementById('paymentCommission').value) || 0,
            concept: document.getElementById('paymentConcept').value,
            due_date: dueDate,
            payment_date: payDate || null,
            payment_method: document.getElementById('paymentMethod').value,
            reference_number: document.getElementById('paymentReference').value.trim(),
            notes: document.getElementById('paymentNotes').value.trim(),
            status: payDate ? 'paid' : 'pending'
        };

        const res = await API.createPayment(paymentData);
        
        UI.toast('Pago registrado con éxito', 'success');
        cerrarModalPago();

        // Recargar cobranzas
        await cargarPagos();

        // 🌟 APERTURA AUTOMÁTICA DEL RECIBO DEL PAGO RECIÉN CREADO
        const idCreado = res.id || (res.data && res.data.id) || (allPayments[0] ? allPayments[0].id : null);
        if (idCreado) {
            abrirReciboPago(idCreado);
        }

    } catch (error) {
        UI.toast(error.message || 'Error al registrar el pago', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// ============================================
// CONFIRMAR PAGO RÁPIDO Y ELIMINAR
// ============================================

function abrirModalConfirmarPago(id) {
    currentPaymentToPay = id;
    document.getElementById('payModal').classList.remove('hidden');
}

async function confirmarPagoRapido() {
    if (!currentPaymentToPay) return;
    try {
        const hoy = new Date().toISOString().slice(0, 10);
        await API.updatePayment({
            id: currentPaymentToPay,
            status: 'paid',
            payment_date: hoy
        });

        UI.toast('Pago acreditado', 'success');
        document.getElementById('payModal').classList.add('hidden');
        await cargarPagos();

        // Abrir automáticamente el recibo
        abrirReciboPago(currentPaymentToPay);
    } catch (e) {
        UI.toast('Error al actualizar el pago', 'error');
    }
}

async function eliminarPago(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este registro de pago?')) return;
    try {
        await API.deletePayment(id);
        UI.toast('Pago eliminado', 'success');
        await cargarPagos();
    } catch (e) {
        UI.toast('Error al eliminar', 'error');
    }
}

// ============================================
// FILTROS
// ============================================

function aplicarFiltros() {
    const contractId = document.getElementById('filterContract').value;
    const status = document.getElementById('filterStatus').value;
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;

    filteredPayments = allPayments.filter(p => {
        if (contractId && p.contract_id != contractId) return false;
        if (status && p.status !== status) return false;
        if (dateFrom && p.due_date && p.due_date < dateFrom) return false;
        if (dateTo && p.due_date && p.due_date > dateTo) return false;
        return true;
    });

    renderizarTablaPagos();
}

function limpiarFiltros() {
    document.getElementById('filterContract').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    filteredPayments = [...allPayments];
    renderizarTablaPagos();
}

// ============================================
// FUNCIONALIDAD COMPLETA DE RECIBO OFICIAL
// ============================================

function abrirReciboPago(id) {
    const pago = allPayments.find(p => p.id === id);
    if (!pago) {
        UI.toast('No se encontró el pago seleccionado', 'error');
        return;
    }

    const contrato = allContracts.find(c => c.id === pago.contract_id) || {};
    
    currentReceiptData = {
        id: pago.id,
        receiptNumber: `REC-${String(pago.id).padStart(6, '0')}`,
        fecha: pago.payment_date ? AppUtils.formatDate(pago.payment_date) : AppUtils.formatDate(new Date().toISOString()),
        inquilino: pago.tenant_name || contrato.tenant_name || 'Inquilino General',
        inquilinoDni: pago.tenant_dni || contrato.tenant_dni || 'Sin especificar',
        inquilinoPhone: pago.tenant_phone || contrato.tenant_phone || '',
        inquilinoEmail: pago.tenant_email || contrato.tenant_email || '',
        propietario: pago.owner_name || contrato.owner_name || 'Propietario / Administración',
        propiedad: pago.property_address || contrato.property_address || 'Inmueble arrendado',
        concepto: pago.concept || 'Alquiler del Período',
        monto: parseFloat(pago.amount) || 0,
        comision: parseFloat(pago.commission) || 0,
        metodo: pago.payment_method || 'Transferencia',
        referencia: pago.reference_number || 'S/R',
        estado: pago.status === 'paid' ? 'PAGADO' : 'PENDIENTE DE CANCELACIÓN'
    };

    const receiptContent = document.getElementById('receiptContent');
    if (!receiptContent) return;

    receiptContent.innerHTML = `
        <div id="printArea" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 max-w-3xl mx-auto shadow-sm">
            <!-- Encabezado Inmobiliaria -->
            <div class="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-6 mb-6">
                <div>
                    <h2 class="text-2xl font-bold text-slate-900 dark:text-white uppercase tracking-wider">Inmobiliaria Mórtola y Asociados</h2>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Administración de Propiedades & Gestión de Alquileres</p>
                    <p class="text-xs text-slate-400 mt-0.5">CUIT: 30-71234567-8 | contacto@inmobiliariamortola.com</p>
                </div>
                <div class="text-right">
                    <span class="inline-block bg-primary-50 dark:bg-slate-800 text-primary-600 dark:text-primary-400 font-bold px-3 py-1 rounded-lg text-sm mb-2">
                        ${currentReceiptData.receiptNumber}
                    </span>
                    <p class="text-xs text-slate-500">Fecha de Emisión:</p>
                    <p class="text-sm font-semibold text-slate-800 dark:text-slate-200">${currentReceiptData.fecha}</p>
                </div>
            </div>

            <!-- Datos Inquilino / Propiedad -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl mb-6 text-sm">
                <div>
                    <p class="text-slate-500 text-xs uppercase font-medium">Recibimos de:</p>
                    <p class="font-bold text-slate-800 dark:text-white text-base">${AppUtils.escapeHtml(currentReceiptData.inquilino)}</p>
                    <p class="text-slate-600 dark:text-slate-400 text-xs mt-0.5">DNI/CUIT: ${AppUtils.escapeHtml(currentReceiptData.inquilinoDni)}</p>
                </div>
                <div>
                    <p class="text-slate-500 text-xs uppercase font-medium">En concepto de:</p>
                    <p class="font-bold text-slate-800 dark:text-white">${AppUtils.escapeHtml(currentReceiptData.concepto)}</p>
                    <p class="text-slate-600 dark:text-slate-400 text-xs mt-0.5">Propiedad: ${AppUtils.escapeHtml(currentReceiptData.propiedad)}</p>
                </div>
            </div>

            <!-- Detalle Económico -->
            <table class="w-full text-left text-sm mb-6 border-collapse">
                <thead>
                    <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 text-xs">
                        <th class="py-2">Descripción</th>
                        <th class="py-2 text-center">Forma de Pago</th>
                        <th class="py-2 text-right">Subtotal</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr>
                        <td class="py-3">
                            <p class="font-semibold text-slate-800 dark:text-slate-200">${AppUtils.escapeHtml(currentReceiptData.concepto)}</p>
                            <p class="text-xs text-slate-400">Ref: ${AppUtils.escapeHtml(currentReceiptData.referencia)} | Locador: ${AppUtils.escapeHtml(currentReceiptData.propietario)}</p>
                        </td>
                        <td class="py-3 text-center text-slate-600 dark:text-slate-400">${AppUtils.escapeHtml(currentReceiptData.metodo)}</td>
                        <td class="py-3 text-right font-bold text-slate-900 dark:text-white">${AppUtils.formatCurrency(currentReceiptData.monto)}</td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr class="border-t-2 border-slate-300 dark:border-slate-700">
                        <td colspan="2" class="py-3 font-bold text-base text-slate-900 dark:text-white">TOTAL CANCELADO</td>
                        <td class="py-3 text-right font-extrabold text-xl text-primary-600 dark:text-primary-400">
                            ${AppUtils.formatCurrency(currentReceiptData.monto)}
                        </td>
                    </tr>
                </tfoot>
            </table>

            <!-- Pie del Recibo -->
            <div class="flex justify-between items-end pt-6 border-t border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500">
                <div>
                    <p class="font-semibold text-slate-700 dark:text-slate-300 uppercase">Estado: <span class="${currentReceiptData.estado === 'PAGADO' ? 'text-emerald-600' : 'text-amber-600'}">${currentReceiptData.estado}</span></p>
                    <p class="mt-1">Comprobante emitido electrónicamente sin validez fiscal formal como factura.</p>
                </div>
                <div class="text-center">
                    <div class="w-40 border-b border-slate-400 mb-1"></div>
                    <p class="font-medium text-slate-700 dark:text-slate-300">Firma Administración</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('receiptModal').classList.remove('hidden');
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
        UI.toast('Motor de PDF no disponible', 'error');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Cabecera
        doc.setFontSize(18);
        doc.setTextColor(30, 41, 59);
        doc.text("INMOBILIARIA MÓRTOLA Y ASOCIADOS", 14, 20);

        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text("Administración de Alquileres & Cobranzas", 14, 26);
        doc.text("CUIT: 30-71234567-8 | Comprobante No Oficial", 14, 31);

        // Nro Recibo y Fecha
        doc.setFontSize(12);
        doc.setTextColor(79, 70, 229);
        doc.text(currentReceiptData.receiptNumber, 150, 20);
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(`Fecha: ${currentReceiptData.fecha}`, 150, 26);

        doc.line(14, 36, 196, 36);

        // Bloque de Información
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(`Recibimos de: ${currentReceiptData.inquilino} (DNI/CUIT: ${currentReceiptData.inquilinoDni})`, 14, 46);
        doc.text(`Inmueble: ${currentReceiptData.propiedad}`, 14, 53);
        doc.text(`Propietario: ${currentReceiptData.propietario}`, 14, 60);

        // Tabla de concepto
        doc.autoTable({
            startY: 68,
            head: [['Concepto', 'Forma de Pago', 'Referencia', 'Subtotal']],
            body: [
                [
                    currentReceiptData.concepto,
                    currentReceiptData.metodo,
                    currentReceiptData.referencia,
                    `$ ${currentReceiptData.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                ]
            ],
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            styles: { fontSize: 10 }
        });

        // Total
        const finalY = doc.lastAutoTable.finalY + 12;
        doc.setFontSize(14);
        doc.setTextColor(16, 185, 129);
        doc.text(`TOTAL PAGADO: $ ${currentReceiptData.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`, 120, finalY);

        // Firma
        doc.line(130, finalY + 35, 185, finalY + 35);
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text("Firma y Sello Administración", 136, finalY + 40);

        doc.save(`${currentReceiptData.receiptNumber}-${currentReceiptData.inquilino.replace(/\s+/g, '_')}.pdf`);
        UI.toast('PDF descargado con éxito', 'success');
    } catch (e) {
        console.error(e);
        UI.toast('Error generando el documento PDF', 'error');
    }
}

function enviarReciboWhatsApp() {
    if (!currentReceiptData) return;

    let telefono = (currentReceiptData.inquilinoPhone || '').replace(/\D/g, '');
    if (telefono.length === 10) telefono = '549' + telefono;
    else if (telefono.startsWith('54') && !telefono.startsWith('549')) telefono = '549' + telefono.substring(2);

    const mensaje = 
`🧾 *RECIBO DE ALQUILER - INMOBILIARIA MÓRTOLA*
---------------------------------------------
*Comprobante:* ${currentReceiptData.receiptNumber}
*Fecha:* ${currentReceiptData.fecha}
*Inquilino:* ${currentReceiptData.inquilino}
*Inmueble:* ${currentReceiptData.propiedad}
*Concepto:* ${currentReceiptData.concepto}
*Forma de Pago:* ${currentReceiptData.metodo} (Ref: ${currentReceiptData.referencia})
*Importe Cancelado:* ${AppUtils.formatCurrency(currentReceiptData.monto)}
*Estado:* ✅ ${currentReceiptData.estado}
---------------------------------------------
¡Muchas gracias por su pago puntual!`;

    const url = `https://api.whatsapp.com/send?phone=${telefono}&text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
}

function enviarReciboEmail() {
    if (!currentReceiptData) return;

    const email = currentReceiptData.inquilinoEmail || prompt('Ingrese el correo electrónico del inquilino:');
    if (!email) return;

    const subject = encodeURIComponent(`Comprobante de Alquiler - ${currentReceiptData.receiptNumber}`);
    const body = encodeURIComponent(`Estimado/a ${currentReceiptData.inquilino},\n\nLe enviamos el detalle de su comprobante por el concepto de ${currentReceiptData.concepto} correspondiente al inmueble en ${currentReceiptData.propiedad}.\n\nImporte cancelado: ${AppUtils.formatCurrency(currentReceiptData.monto)}\nFecha de acreditación: ${currentReceiptData.fecha}\n\nAtentamente,\nInmobiliaria Mórtola y Asociados`);

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    UI.toast('Cliente de correo abierto', 'info');
}

// Exponer en window para eventos HTML
window.abrirModalNuevoPago = abrirModalNuevoPago;
window.cerrarModalPago = cerrarModalPago;
window.abrirModalConfirmarPago = abrirModalConfirmarPago;
window.eliminarPago = eliminarPago;
window.abrirReciboPago = abrirReciboPago;
window.cerrarRecibo = cerrarRecibo;
window.imprimirRecibo = imprimirRecibo;
window.descargarPDF = descargarPDF;
window.enviarReciboWhatsApp = enviarReciboWhatsApp;
window.enviarReciboEmail = enviarReciboEmail;