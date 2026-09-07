// js/reports.js - Estadísticas, Liquidaciones y Reportes Financieros
let reportIncomeChart = null;
let reportDistributionChart = null;

let rawData = {
    payments: [],
    contracts: [],
    tenants: [],
    owners: [],
    ownerReports: []
};

document.addEventListener('DOMContentLoaded', async () => {
    if (window.AppSidebar) AppSidebar.init();
    if (window.Breadcrumbs) Breadcrumbs.init();

    establecerFechasPorDefecto();
    initReportEvents();

    await cargarTodosLosDatos();
});

function establecerFechasPorDefecto() {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const fromEl = document.getElementById('dateFrom');
    const toEl = document.getElementById('dateTo');

    if (fromEl) fromEl.value = inicioMes.toISOString().split('T')[0];
    if (toEl) toEl.value = hoy.toISOString().split('T')[0];

    const fechaGen = document.getElementById('fechaGeneracion');
    const fechaPie = document.getElementById('fechaPie');
    const fechaStr = hoy.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });

    if (fechaGen) fechaGen.textContent = fechaStr;
    if (fechaPie) fechaPie.textContent = fechaStr;
}

function initReportEvents() {
    const applyBtn = document.getElementById('applyFiltersBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            procesarYRenderizarReporte();
        });
    }

    const typeSelect = document.getElementById('reportType');
    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            procesarYRenderizarReporte();
        });
    }
}

// ============================================
// CARGA DE DATOS (READ-ONLY)
// ============================================

async function cargarTodosLosDatos() {
    const token = sessionStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...(token && { 'Authorization': token }) };

    const fetchSafe = (url) => fetch(url, { headers }).then(r => r.ok ? r.json() : []).catch(() => []);

    try {
        const [payments, contracts, tenants, owners, ownerReports] = await Promise.all([
            fetchSafe('/.netlify/functions/payments'),
            fetchSafe('/.netlify/functions/contracts'),
            fetchSafe('/.netlify/functions/tenants'),
            fetchSafe('/.netlify/functions/owners'),
            fetchSafe('/.netlify/functions/owner-reports')
        ]);

        rawData.payments = Array.isArray(payments) ? payments : [];
        rawData.contracts = Array.isArray(contracts) ? contracts : [];
        rawData.tenants = Array.isArray(tenants) ? tenants : [];
        rawData.owners = Array.isArray(owners) ? owners : [];
        rawData.ownerReports = Array.isArray(ownerReports) ? ownerReports : [];

        procesarYRenderizarReporte();

    } catch (err) {
        console.error('Error al cargar datos de reportes:', err);
        UI.toast('Error al sincronizar reportes', 'error');
    }
}

// ============================================
// PROCESAMIENTO Y RENDER
// ============================================

function procesarYRenderizarReporte() {
    const dateFrom = document.getElementById('dateFrom')?.value;
    const dateTo = document.getElementById('dateTo')?.value;
    const reportType = document.getElementById('reportType')?.value || 'completo';

    const periodoTexto = document.getElementById('periodoTexto');
    if (periodoTexto) {
        periodoTexto.textContent = (dateFrom && dateTo) 
            ? `${AppUtils.formatDate(dateFrom)} hasta ${AppUtils.formatDate(dateTo)}`
            : 'Histórico completo';
    }

    // Filtrar pagos dentro del rango
    const pagosFiltrados = rawData.payments.filter(p => {
        const fecha = p.payment_date || p.due_date;
        if (!fecha) return true;
        if (dateFrom && fecha < dateFrom) return false;
        if (dateTo && fecha > dateTo) return false;
        return true;
    });

    renderizarKPIs(pagosFiltrados);
    renderizarGraficos(pagosFiltrados);
    renderizarTablaIngresos(pagosFiltrados);
    renderizarTablaLiquidacionPropietarios();
    renderizarTablaInquilinos();
    renderizarTablaContratos();
    renderizarTablaAumentos();
    renderizarResumenEjecutivo(pagosFiltrados);
}

function renderizarKPIs(pagos) {
    let totalIngresos = 0;
    let totalComisiones = 0;

    pagos.forEach(p => {
        if (p.status === 'paid') {
            const monto = parseFloat(p.amount) || 0;
            const comision = parseFloat(p.commission) || 0;
            totalIngresos += monto;
            totalComisiones += comision;
        }
    });

    const contratosActivos = rawData.contracts.filter(c => c.status === 'active');
    const promedioContrato = contratosActivos.length > 0 
        ? contratosActivos.reduce((acc, c) => acc + (parseFloat(c.base_amount) || 0), 0) / contratosActivos.length 
        : 0;

    const hoyStr = new Date().toISOString().split('T')[0];
    const proximosAumentos = contratosActivos.filter(c => c.next_increase_date && c.next_increase_date >= hoyStr).length;

    document.getElementById('totalIncome').textContent = AppUtils.formatCurrency(totalIngresos);
    document.getElementById('avgContract').textContent = AppUtils.formatCurrency(promedioContrato);
    document.getElementById('totalIncreases').textContent = proximosAumentos;
    document.getElementById('totalCommissions').textContent = AppUtils.formatCurrency(totalComisiones);
}

function renderizarGraficos(pagos) {
    const ctxIncome = document.getElementById('incomeChart');
    const ctxDist = document.getElementById('distributionChart');

    // 1. Gráfico de Ingresos
    if (ctxIncome) {
        if (reportIncomeChart) {
            reportIncomeChart.destroy();
            reportIncomeChart = null;
        }

        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const datos = new Array(12).fill(0);

        pagos.forEach(p => {
            if (p.status === 'paid') {
                const fecha = p.payment_date || p.due_date;
                if (fecha) {
                    const mes = parseInt(fecha.split('-')[1], 10) - 1;
                    if (mes >= 0 && mes < 12) datos[mes] += parseFloat(p.amount) || 0;
                }
            }
        });

        reportIncomeChart = new Chart(ctxIncome, {
            type: 'line',
            data: {
                labels: meses,
                datasets: [{
                    label: 'Recaudación ($)',
                    data: datos,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    // 2. Gráfico de Distribución
    if (ctxDist) {
        if (reportDistributionChart) {
            reportDistributionChart.destroy();
            reportDistributionChart = null;
        }

        const counts = { Fijo: 0, IPC: 0, ICL: 0, Otro: 0 };
        rawData.contracts.forEach(c => {
            const tipo = (c.increase_type || '').toUpperCase();
            if (tipo === 'FIXED' || tipo === 'FIJO') counts.Fijo++;
            else if (tipo === 'IPC') counts.IPC++;
            else if (tipo === 'ICL') counts.ICL++;
            else counts.Otro++;
        });

        reportDistributionChart = new Chart(ctxDist, {
            type: 'pie',
            data: {
                labels: ['Aumento Fijo', 'Por IPC', 'Por ICL', 'Otros'],
                datasets: [{
                    data: [counts.Fijo, counts.IPC, counts.ICL, counts.Otro],
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#6b7280']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

function renderizarTablaIngresos(pagos) {
    const tbody = document.getElementById('incomeTableBody');
    const tfoot = document.getElementById('incomeTableFooter');
    if (!tbody) return;

    if (!pagos || pagos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-slate-400">No hay registros en este período.</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    let sumaMonto = 0;
    let sumaComision = 0;

    tbody.innerHTML = pagos.map(p => {
        const monto = parseFloat(p.amount) || 0;
        const comision = parseFloat(p.commission) || 0;
        if (p.status === 'paid') {
            sumaMonto += monto;
            sumaComision += comision;
        }

        return `
            <tr class="hover:bg-slate-50 text-sm">
                <td class="px-4 py-2">${AppUtils.formatDate(p.payment_date || p.due_date)}</td>
                <td class="px-4 py-2 font-medium">${AppUtils.escapeHtml(p.tenant_name || 'N/A')}</td>
                <td class="px-4 py-2">#${p.contract_id}</td>
                <td class="px-4 py-2 text-slate-500">${AppUtils.escapeHtml(p.owner_name || 'N/A')}</td>
                <td class="px-4 py-2 font-semibold">${AppUtils.formatCurrency(monto)}</td>
                <td class="px-4 py-2 text-slate-500">-${AppUtils.formatCurrency(comision)}</td>
                <td class="px-4 py-2 font-bold text-emerald-600">${AppUtils.formatCurrency(monto - comision)}</td>
                <td class="px-4 py-2">
                    <span class="badge ${p.status === 'paid' ? 'badge-success' : 'badge-warning'}">
                        ${p.status === 'paid' ? 'Cobrado' : 'Pendiente'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    if (tfoot) {
        tfoot.innerHTML = `
            <tr class="border-t-2 text-sm bg-slate-50">
                <td colspan="4" class="px-4 py-3 text-right font-bold">TOTALES COBRADOS:</td>
                <td class="px-4 py-3 font-bold">${AppUtils.formatCurrency(sumaMonto)}</td>
                <td class="px-4 py-3 font-bold text-slate-600">-${AppUtils.formatCurrency(sumaComision)}</td>
                <td class="px-4 py-3 font-extrabold text-emerald-600">${AppUtils.formatCurrency(sumaMonto - sumaComision)}</td>
                <td></td>
            </tr>
        `;
    }
}

function renderizarTablaLiquidacionPropietarios() {
    const tbody = document.getElementById('ownerReportTableBody');
    if (!tbody) return;

    if (!rawData.ownerReports || rawData.ownerReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-slate-400">Sin contratos activos para liquidar.</td></tr>`;
        return;
    }

    tbody.innerHTML = rawData.ownerReports.map(o => `
        <tr class="hover:bg-slate-50 text-sm">
            <td class="px-4 py-2.5 font-bold text-slate-900">
                ${AppUtils.escapeHtml(o.owner_name)}
                ${o.owner_dni ? `<span class="block text-xs font-normal text-slate-400">DNI: ${AppUtils.escapeHtml(o.owner_dni)}</span>` : ''}
            </td>
            <td class="px-4 py-2.5 text-center">${o.total_properties || 0}</td>
            <td class="px-4 py-2.5 text-center font-medium">${o.active_contracts_count || 0}</td>
            <td class="px-4 py-2.5 font-semibold text-slate-800">${AppUtils.formatCurrency(o.gross_rent || 0)}</td>
            <td class="px-4 py-2.5 text-red-600">-${AppUtils.formatCurrency(o.total_commission || 0)}</td>
            <td class="px-4 py-2.5 font-extrabold text-emerald-600">${AppUtils.formatCurrency(o.net_payable || 0)}</td>
        </tr>
    `).join('');
}

function renderizarTablaInquilinos() {
    const tbody = document.getElementById('tenantsTableBody');
    if (!tbody) return;

    tbody.innerHTML = rawData.tenants.map(t => `
        <tr class="text-sm">
            <td class="px-4 py-2 text-slate-400">${t.created_at ? AppUtils.formatDate(t.created_at) : '-'}</td>
            <td class="px-4 py-2">${AppUtils.escapeHtml(t.dni || '-')}</td>
            <td class="px-4 py-2 font-medium">${AppUtils.escapeHtml(t.name)}</td>
            <td class="px-4 py-2 text-slate-500">${AppUtils.escapeHtml(t.email || '-')}</td>
            <td class="px-4 py-2 text-slate-500">${AppUtils.escapeHtml(t.phone || '-')}</td>
            <td class="px-4 py-2 text-slate-500">${AppUtils.escapeHtml(t.address || '-')}</td>
            <td class="px-4 py-2 font-semibold text-center">${t.total_contracts || 0}</td>
        </tr>
    `).join('');
}

function renderizarTablaContratos() {
    const tbody = document.getElementById('contractsTableBody');
    if (!tbody) return;

    tbody.innerHTML = rawData.contracts.map(c => `
        <tr class="text-sm">
            <td class="px-4 py-2">${AppUtils.formatDate(c.start_date)}</td>
            <td class="px-4 py-2 font-medium">${AppUtils.escapeHtml(c.tenant_name || 'N/A')}</td>
            <td class="px-4 py-2 text-slate-500">${AppUtils.escapeHtml(c.owner_name || 'N/A')}</td>
            <td class="px-4 py-2 font-bold">${AppUtils.formatCurrency(c.base_amount)}</td>
            <td class="px-4 py-2">${c.duration} meses</td>
            <td class="px-4 py-2">${AppUtils.formatDate(c.start_date)}</td>
            <td class="px-4 py-2">${c.end_date ? AppUtils.formatDate(c.end_date) : '-'}</td>
            <td class="px-4 py-2">
                <span class="badge ${c.status === 'active' ? 'badge-success' : 'badge-warning'}">${c.status}</span>
            </td>
        </tr>
    `).join('');
}

function renderizarTablaAumentos() {
    const tbody = document.getElementById('increasesTableBody');
    if (!tbody) return;

    const hoy = new Date().toISOString().split('T')[0];
    const proximos = rawData.contracts.filter(c => c.next_increase_date && c.next_increase_date >= hoy);

    if (proximos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-slate-400">Sin aumentos programados para los próximos días.</td></tr>`;
        return;
    }

    tbody.innerHTML = proximos.map(c => {
        const monto = parseFloat(c.base_amount) || 0;
        const pct = parseFloat(c.increase_value) || 0;
        const nuevo = monto * (1 + (pct / 100));

        return `
            <tr class="text-sm">
                <td class="px-4 py-2">${AppUtils.formatDate(c.next_increase_date)}</td>
                <td class="px-4 py-2 font-medium">${AppUtils.escapeHtml(c.tenant_name || 'N/A')}</td>
                <td class="px-4 py-2 font-semibold">${AppUtils.formatCurrency(monto)}</td>
                <td class="px-4 py-2">${AppUtils.formatDate(c.next_increase_date)}</td>
                <td class="px-4 py-2 text-blue-600 font-bold">+${pct}%</td>
                <td class="px-4 py-2 font-bold text-emerald-600">${AppUtils.formatCurrency(nuevo)}</td>
                <td class="px-4 py-2 text-slate-500">${(c.increase_type || 'Fijo').toUpperCase()}</td>
            </tr>
        `;
    }).join('');
}

function renderizarResumenEjecutivo(pagos) {
    const contenedor = document.getElementById('resumenEjecutivo');
    if (!contenedor) return;

    let recaudado = 0;
    pagos.forEach(p => { if (p.status === 'paid') recaudado += parseFloat(p.amount) || 0; });

    contenedor.innerHTML = `
        <div class="p-4 bg-slate-50 rounded-xl space-y-2">
            <p class="text-sm text-slate-600">Total Inquilinos activos: <strong>${rawData.tenants.length}</strong></p>
            <p class="text-sm text-slate-600">Contratos en gestión: <strong>${rawData.contracts.length}</strong></p>
            <p class="text-sm text-slate-600">Recaudación en período: <strong class="text-emerald-600">${AppUtils.formatCurrency(recaudado)}</strong></p>
        </div>
        <div class="p-4 bg-slate-50 rounded-xl space-y-2">
            <p class="text-sm text-slate-600">Propietarios con renta activa: <strong>${rawData.ownerReports.length}</strong></p>
            <p class="text-sm text-slate-600">Pagos totales procesados: <strong>${pagos.length}</strong></p>
            <p class="text-xs text-slate-400 mt-2">Informe validado y generado por el sistema Tenant CRM.</p>
        </div>
    `;
}

// ============================================
// EXPORTACIÓN EXCEL & PDF
// ============================================

function exportarExcelCompleto() {
    if (!window.XLSX) {
        UI.toast('Librería de Excel no disponible', 'error');
        return;
    }

    const wb = XLSX.utils.book_new();

    // 1. Hoja Liquidación a Propietarios
    const liquidacionData = rawData.ownerReports.map(o => ({
        'Propietario': o.owner_name,
        'DNI': o.owner_dni || '',
        'Cuenta / CBU': o.owner_bank_account || '',
        'Contratos Activos': o.active_contracts_count,
        'Renta Bruta ($)': parseFloat(o.gross_rent || 0),
        'Comisión Agencia ($)': parseFloat(o.total_commission || 0),
        'Neto a Pagar ($)': parseFloat(o.net_payable || 0)
    }));
    const ws1 = XLSX.utils.json_to_sheet(liquidacionData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Liquidación Propietarios');

    // 2. Hoja Pagos
    const pagosData = rawData.payments.map(p => ({
        'Contrato #': p.contract_id,
        'Inquilino': p.tenant_name || '',
        'Propietario': p.owner_name || '',
        'Concepto': p.concept || 'Alquiler',
        'Monto ($)': parseFloat(p.amount) || 0,
        'Comisión ($)': parseFloat(p.commission) || 0,
        'Vencimiento': p.due_date || '',
        'Fecha Cobro': p.payment_date || '',
        'Estado': p.status
    }));
    const ws2 = XLSX.utils.json_to_sheet(pagosData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle Cobranzas');

    XLSX.writeFile(wb, `Reporte_Contable_TenantCRM_${new Date().toISOString().slice(0, 10)}.xlsx`);
    UI.toast('Excel exportado correctamente', 'success');
}

function exportarPDFCompleto() {
    if (!window.jspdf) {
        UI.toast('Librería PDF no disponible', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    doc.setFontSize(18);
    doc.text('TENANT CRM - REPORTE CONTABLE', 14, 20);

    doc.setFontSize(10);
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-AR')}`, 14, 28);

    doc.line(14, 32, 196, 32);

    if (doc.autoTable) {
        doc.setFontSize(12);
        doc.text('Liquidación por Propietario', 14, 40);

        const rows = rawData.ownerReports.map(o => [
            o.owner_name,
            o.active_contracts_count,
            AppUtils.formatCurrency(o.gross_rent || 0),
            `-${AppUtils.formatCurrency(o.total_commission || 0)}`,
            AppUtils.formatCurrency(o.net_payable || 0)
        ]);

        doc.autoTable({
            startY: 45,
            head: [['Propietario', 'Contratos', 'Renta Bruta', 'Comisión', 'Neto a Liquidar']],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [99, 102, 241] }
        });
    }

    doc.save(`Reporte_TenantCRM_${new Date().toISOString().slice(0, 10)}.pdf`);
    UI.toast('PDF descargado con éxito', 'success');
}

function generarReporteCompleto() {
    procesarYRenderizarReporte();
    UI.toast('Reporte general regenerado', 'info');
}

// Exportar al objeto global
window.exportarExcelCompleto = exportarExcelCompleto;
window.exportarPDFCompleto = exportarPDFCompleto;
window.generarReporteCompleto = generarReporteCompleto;