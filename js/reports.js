// reports.js - Versión mejorada con informes completos
let incomeChart = null;
let distributionChart = null;
let currentData = {
    tenants: [],
    contracts: [],
    filteredTenants: [],
    filteredContracts: []
};

// Configuración de fechas por defecto (últimos 30 días)
const today = new Date();
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📊 Página de reportes cargada');
    
    if (!window.UI) {
        window.UI = {
            toast: (msg, type) => alert(`${type}: ${msg}`),
            formatCurrency: (amount) => {
                if (amount === undefined || amount === null || isNaN(amount)) return '$0';
                return `$${Number(amount).toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}`;
            },
            formatDate: (date) => new Date(date).toLocaleDateString('es-ES')
        };
    }
    
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    document.getElementById('dateFrom').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('dateTo').value = today.toISOString().split('T')[0];
    document.getElementById('fechaGeneracion').textContent = today.toLocaleDateString('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    document.getElementById('fechaPie').textContent = today.toLocaleDateString('es-ES');
    
    initSidebar();
    initEventListeners();
    await loadData();
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

function initEventListeners() {
    document.getElementById('applyFiltersBtn').addEventListener('click', aplicarFiltros);
    document.getElementById('reportType').addEventListener('change', cambiarTipoReporte);
}

async function loadData() {
    try {
        const token = localStorage.getItem('authToken');
        
        const [tenants, contracts] = await Promise.all([
            fetch('/.netlify/functions/tenants', {
                headers: { 'Authorization': token }
            }).then(r => r.json()),
            fetch('/.netlify/functions/contracts', {
                headers: { 'Authorization': token }
            }).then(r => r.json())
        ]);
        
        currentData.tenants = tenants || [];
        currentData.contracts = contracts || [];
        
        console.log('📦 Datos cargados:', {
            tenants: currentData.tenants.length,
            contracts: currentData.contracts.length
        });
        
        aplicarFiltros();
        
    } catch (error) {
        console.error('Error cargando datos:', error);
        UI.toast('Error al cargar los datos', 'error');
    }
}

function aplicarFiltros() {
    const dateFrom = new Date(document.getElementById('dateFrom').value);
    const dateTo = new Date(document.getElementById('dateTo').value);
    dateTo.setHours(23, 59, 59);
    
    if (dateFrom > dateTo) {
        UI.toast('La fecha "desde" no puede ser mayor que "hasta"', 'error');
        return;
    }
    
    // Actualizar texto del período
    document.getElementById('periodoTexto').textContent = 
        `${dateFrom.toLocaleDateString()} - ${dateTo.toLocaleDateString()}`;
    
    // Filtrar contratos por fecha
    currentData.filteredContracts = currentData.contracts.filter(c => {
        if (!c.created_at) return false;
        const createdDate = new Date(c.created_at);
        return createdDate >= dateFrom && createdDate <= dateTo;
    });
    
    // Filtrar inquilinos por fecha
    currentData.filteredTenants = currentData.tenants.filter(t => {
        if (!t.created_at) return false;
        const createdDate = new Date(t.created_at);
        return createdDate >= dateFrom && createdDate <= dateTo;
    });
    
    generarReporteCompleto();
}

function cambiarTipoReporte() {
    const tipo = document.getElementById('reportType').value;
    const tipoTexto = {
        'completo': 'Completo',
        'income': 'Ingresos',
        'tenants': 'Inquilinos',
        'contracts': 'Contratos',
        'increases': 'Aumentos'
    }[tipo] || 'Completo';
    
    document.getElementById('tipoReporteTexto').textContent = tipoTexto;
    aplicarFiltros();
}

function generarReporteCompleto() {
    console.log('📑 Generando reporte completo...');
    
    actualizarKPIs();
    actualizarGraficos();
    actualizarTablaIngresos();
    actualizarTablaInquilinos();
    actualizarTablaContratos();
    actualizarTablaAumentos();
    actualizarResumenEjecutivo();
}

async function actualizarKPIs() {
    console.log('🔍 actualizarKPIs iniciado');
    
    let totalPaidIncome = 0;
    let totalPendingIncome = 0;
    
    try {
        // Obtener fechas del filtro
        const dateFromInput = document.getElementById('dateFrom').value;
        const dateToInput = document.getElementById('dateTo').value;
        
        console.log('Fechas seleccionadas:', { dateFromInput, dateToInput });
        
        // Si no hay fechas, usar el período por defecto
        const dateFrom = dateFromInput ? new Date(dateFromInput) : new Date(new Date().setDate(new Date().getDate() - 30));
        const dateTo = dateToInput ? new Date(dateToInput) : new Date();
        dateTo.setHours(23, 59, 59);
        
        console.log('Fechas convertidas:', { dateFrom, dateTo });
        
        // Cargar pagos
        const pagos = await cargarPagosReportes();
        console.log('Total pagos cargados:', pagos.length);
        
        // Mostrar todos los pagos para debug
        console.log('Todos los pagos:', pagos.map(p => ({
            id: p.id,
            status: p.status,
            total_amount: p.total_amount,
            paid_at: p.paid_at,
            created_at: p.created_at,
            due_date: p.due_date
        })));
        
        // Filtrar pagos por fecha de pago (paid_at) o fecha de creación
        const pagosFiltrados = pagos.filter(p => {
            // Usar paid_at si existe, sino created_at
            const fechaPago = p.paid_at ? new Date(p.paid_at) : (p.created_at ? new Date(p.created_at) : null);
            
            if (!fechaPago) return false;
            
            const dentroDeRango = fechaPago >= dateFrom && fechaPago <= dateTo;
            
            if (dentroDeRango) {
                console.log(`Pago ${p.id} dentro del rango:`, {
                    fecha: fechaPago,
                    monto: p.total_amount,
                    status: p.status
                });
            }
            
            return dentroDeRango;
        });
        
        console.log('Pagos filtrados por fecha:', pagosFiltrados.length);
        
        // Calcular ingresos por pagos REALIZADOS
        totalPaidIncome = pagosFiltrados
            .filter(p => p.status === 'paid')
            .reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);
            
        totalPendingIncome = pagosFiltrados
            .filter(p => p.status === 'pending')
            .reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);
        
        console.log('Ingresos calculados:', {
            totalPaidIncome,
            totalPendingIncome,
            cantidadPagados: pagosFiltrados.filter(p => p.status === 'paid').length,
            cantidadPendientes: pagosFiltrados.filter(p => p.status === 'pending').length
        });
        
    } catch (error) {
        console.error('Error en actualizarKPIs:', error);
    }
    
    // Calcular ingresos por contratos (respaldo)
    const totalContractIncome = currentData.filteredContracts.reduce((sum, c) => {
        return sum + (parseFloat(c.base_amount) || 0);
    }, 0);
    
    // USAR INGRESOS REALES DE PAGOS (si hay) O FALLBACK A CONTRATOS
    const totalIncome = totalPaidIncome > 0 ? totalPaidIncome : totalContractIncome;
    
    console.log('Total income final:', totalIncome);
    
    const avgContract = currentData.filteredContracts.length > 0 
        ? totalIncome / currentData.filteredContracts.length 
        : 0;
    
    const totalIncreases = currentData.filteredContracts.filter(c => c.increase_value > 0).length;
    
    const totalCommissions = currentData.filteredContracts.reduce((sum, c) => {
        const commission = (parseFloat(c.base_amount) || 0) * (parseFloat(c.agent_commission) || 5) / 100;
        return sum + commission;
    }, 0);
    
    // Actualizar DOM
    document.getElementById('totalIncome').textContent = UI.formatCurrency(totalIncome);
    document.getElementById('avgContract').textContent = UI.formatCurrency(avgContract);
    document.getElementById('totalIncreases').textContent = totalIncreases;
    document.getElementById('totalCommissions').textContent = UI.formatCurrency(totalCommissions);
    
    // Mostrar detalle en el período
    const incomePeriod = document.getElementById('incomePeriod');
    if (incomePeriod) {
        incomePeriod.innerHTML = `
            Pagado: ${UI.formatCurrency(totalPaidIncome)} | 
            Pendiente: ${UI.formatCurrency(totalPendingIncome)}
            ${totalPaidIncome === 0 ? '<span class="text-red-500 ml-2">(Sin pagos en este período)</span>' : ''}
        `;
    }
}

function actualizarGraficos() {
    actualizarGraficoIngresos();
    actualizarGraficoDistribucion();
}

function actualizarGraficoIngresos() {
    const ctx = document.getElementById('incomeChart').getContext('2d');
    
    const monthlyData = {};
    currentData.filteredContracts.forEach(c => {
        if (!c.created_at) return;
        const date = new Date(c.created_at);
        const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
        monthlyData[monthYear] = (monthlyData[monthYear] || 0) + (parseFloat(c.base_amount) || 0);
    });
    
    const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
        const [monthA, yearA] = a.split('/').map(Number);
        const [monthB, yearB] = b.split('/').map(Number);
        return yearA === yearB ? monthA - monthB : yearA - yearB;
    });
    
    if (incomeChart) incomeChart.destroy();
    
    incomeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedMonths.map(m => {
                const [month, year] = m.split('/');
                return `${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][month-1]} ${year}`;
            }),
            datasets: [{
                label: 'Ingresos ($)',
                data: sortedMonths.map(m => monthlyData[m]),
                backgroundColor: '#3b82f6',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `Ingresos: ${UI.formatCurrency(context.raw)}`
                    }
                }
            }
        }
    });
}

function actualizarGraficoDistribucion() {
    const ctx = document.getElementById('distributionChart').getContext('2d');
    
    const statusCounts = {
        active: currentData.filteredContracts.filter(c => c.status === 'active').length,
        pending: currentData.filteredContracts.filter(c => c.status === 'pending').length,
        expired: currentData.filteredContracts.filter(c => c.status === 'expired').length,
        terminated: currentData.filteredContracts.filter(c => c.status === 'terminated').length
    };
    
    if (distributionChart) distributionChart.destroy();
    
    distributionChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Activos', 'Pendientes', 'Vencidos', 'Terminados'],
            datasets: [{
                data: [statusCounts.active, statusCounts.pending, statusCounts.expired, statusCounts.terminated],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#6b7280']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${context.raw} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function actualizarTablaIngresos() {
    const tbody = document.getElementById('incomeTableBody');
    const tfoot = document.getElementById('incomeTableFooter');
    
    if (currentData.filteredContracts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">No hay datos</td></tr>';
        tfoot.innerHTML = '';
        return;
    }
    
    // Cargar pagos para mostrar estado real
    cargarPagosReportes().then(pagos => {
        const pagosMap = new Map();
        pagos.forEach(p => {
            if (p.contract_id) {
                pagosMap.set(p.contract_id, p);
            }
        });
        
        let totalBase = 0;
        let totalComision = 0;
        let totalGeneral = 0;
        let totalPagado = 0;
        
        tbody.innerHTML = currentData.filteredContracts.map(c => {
            const base = parseFloat(c.base_amount) || 0;
            const comision = base * (parseFloat(c.agent_commission) || 5) / 100;
            const total = base + comision;
            
            const pago = pagosMap.get(c.id);
            const pagado = pago && pago.status === 'paid' ? pago.total_amount : 0;
            
            totalBase += base;
            totalComision += comision;
            totalGeneral += total;
            totalPagado += pagado;
            
            const estadoClass = pagado > 0 ? 'text-green-600' : 'text-yellow-600';
            const estadoText = pagado > 0 ? 'Pagado' : 'Pendiente';
            
            return `
                <tr>
                    <td class="px-4 py-2">${UI.formatDate(c.created_at)}</td>
                    <td class="px-4 py-2">${escapeHtml(c.tenant_name || 'N/A')}</td>
                    <td class="px-4 py-2">#${c.id}</td>
                    <td class="px-4 py-2">${escapeHtml(c.owner || 'N/A')}</td>
                    <td class="px-4 py-2 text-right">${UI.formatCurrency(base)}</td>
                    <td class="px-4 py-2 text-right">${UI.formatCurrency(comision)}</td>
                    <td class="px-4 py-2 text-right font-medium">${UI.formatCurrency(total)}</td>
                    <td class="px-4 py-2 text-center">
                        <span class="badge ${estadoClass}">${estadoText}</span>
                    </td>
                </tr>
            `;
        }).join('');
        
        tfoot.innerHTML = `
            <tr>
                <td colspan="4" class="px-4 py-2 text-right font-bold">TOTALES:</td>
                <td class="px-4 py-2 text-right font-bold">${UI.formatCurrency(totalBase)}</td>
                <td class="px-4 py-2 text-right font-bold">${UI.formatCurrency(totalComision)}</td>
                <td class="px-4 py-2 text-right font-bold text-blue-600">${UI.formatCurrency(totalGeneral)}</td>
                <td class="px-4 py-2 text-right font-bold text-green-600">${UI.formatCurrency(totalPagado)}</td>
            </tr>
        `;
    });
}

function actualizarTablaInquilinos() {
    const tbody = document.getElementById('tenantsTableBody');
    const tfoot = document.getElementById('tenantsTableFooter');
    
    if (currentData.filteredTenants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">No hay datos</td></tr>';
        tfoot.innerHTML = '';
        return;
    }
    
    tbody.innerHTML = currentData.filteredTenants.map(t => {
        const contratos = currentData.contracts.filter(c => c.tenant_id === t.id).length;
        
        return `
            <tr>
                <td class="px-4 py-2">${UI.formatDate(t.created_at)}</td>
                <td class="px-4 py-2">${escapeHtml(t.dni)}</td>
                <td class="px-4 py-2 font-medium">${escapeHtml(t.name)}</td>
                <td class="px-4 py-2">${escapeHtml(t.email)}</td>
                <td class="px-4 py-2">${escapeHtml(t.phone || '-')}</td>
                <td class="px-4 py-2">${escapeHtml(t.address || '-')}</td>
                <td class="px-4 py-2 text-center">${contratos}</td>
            </tr>
        `;
    }).join('');
    
    tfoot.innerHTML = `
        <tr>
            <td colspan="6" class="px-4 py-2 text-right font-bold">TOTAL INQUILINOS:</td>
            <td class="px-4 py-2 text-center font-bold text-green-600">${currentData.filteredTenants.length}</td>
        </tr>
    `;
}

function actualizarTablaContratos() {
    const tbody = document.getElementById('contractsTableBody');
    const tfoot = document.getElementById('contractsTableFooter');
    
    if (currentData.filteredContracts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">No hay datos</td></tr>';
        tfoot.innerHTML = '';
        return;
    }
    
    let totalMonto = 0;
    
    tbody.innerHTML = currentData.filteredContracts.map(c => {
        totalMonto += parseFloat(c.base_amount) || 0;
        
        return `
            <tr>
                <td class="px-4 py-2">${UI.formatDate(c.created_at)}</td>
                <td class="px-4 py-2">${escapeHtml(c.tenant_name || 'N/A')}</td>
                <td class="px-4 py-2">${escapeHtml(c.owner || 'N/A')}</td>
                <td class="px-4 py-2 text-right">${UI.formatCurrency(c.base_amount)}</td>
                <td class="px-4 py-2 text-center">${c.duration} meses</td>
                <td class="px-4 py-2">${UI.formatDate(c.start_date)}</td>
                <td class="px-4 py-2">${c.end_date ? UI.formatDate(c.end_date) : '-'}</td>
                <td class="px-4 py-2">
                    <span class="badge ${c.status === 'active' ? 'badge-success' : 'badge-warning'}">
                        ${c.status === 'active' ? 'Activo' : c.status}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
    
    tfoot.innerHTML = `
        <tr>
            <td colspan="3" class="px-4 py-2 text-right font-bold">TOTAL MONTO CONTRATOS:</td>
            <td class="px-4 py-2 text-right font-bold text-purple-600">${UI.formatCurrency(totalMonto)}</td>
            <td colspan="4"></td>
        </tr>
    `;
}

function actualizarTablaAumentos() {
    const tbody = document.getElementById('increasesTableBody');
    
    const aumentos = currentData.contracts
        .filter(c => c.next_increase_date)
        .sort((a, b) => new Date(a.next_increase_date) - new Date(b.next_increase_date));
    
    if (aumentos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">No hay aumentos programados</td></tr>';
        return;
    }
    
    const today = new Date();
    
    tbody.innerHTML = aumentos.map(c => {
        const baseAmount = parseFloat(c.base_amount) || 0;
        const increasePercentage = parseFloat(c.increase_value) || 0;
        const newAmount = c.increase_type === 'fixed' 
            ? baseAmount * (1 + increasePercentage / 100)
            : baseAmount * 1.035; // Estimado para IPC/IPS
        
        const nextDate = new Date(c.next_increase_date);
        const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
        
        return `
            <tr>
                <td class="px-4 py-2">${UI.formatDate(c.created_at)}</td>
                <td class="px-4 py-2 font-medium">${escapeHtml(c.tenant_name || 'N/A')}</td>
                <td class="px-4 py-2 text-right">${UI.formatCurrency(baseAmount)}</td>
                <td class="px-4 py-2">${UI.formatDate(c.next_increase_date)}</td>
                <td class="px-4 py-2 text-center">${increasePercentage}%</td>
                <td class="px-4 py-2 text-right text-green-600 font-medium">${UI.formatCurrency(newAmount)}</td>
                <td class="px-4 py-2 text-center">
                    <span class="${diffDays <= 7 ? 'text-red-600 font-bold' : diffDays <= 15 ? 'text-yellow-600' : 'text-green-600'}">
                        ${diffDays} días
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

function actualizarResumenEjecutivo() {
    const resumen = document.getElementById('resumenEjecutivo');
    
    const totalIncome = currentData.filteredContracts.reduce((sum, c) => sum + (parseFloat(c.base_amount) || 0), 0);
    const activeContracts = currentData.contracts.filter(c => c.status === 'active').length;
    const totalTenants = currentData.tenants.length;
    const avgContractValue = currentData.contracts.length > 0 ? totalIncome / currentData.contracts.length : 0;
    
    const nextIncreases = currentData.contracts.filter(c => {
        if (!c.next_increase_date) return false;
        const nextDate = new Date(c.next_increase_date);
        const diffDays = Math.ceil((nextDate - new Date()) / (1000 * 60 * 60 * 24));
        return diffDays > 0 && diffDays <= 30;
    }).length;
    
    resumen.innerHTML = `
        <div class="space-y-3">
            <div class="flex justify-between border-b pb-2">
                <span class="font-medium">Total de contratos activos:</span>
                <span class="text-blue-600 font-bold">${activeContracts}</span>
            </div>
            <div class="flex justify-between border-b pb-2">
                <span class="font-medium">Total de inquilinos:</span>
                <span class="text-green-600 font-bold">${totalTenants}</span>
            </div>
            <div class="flex justify-between border-b pb-2">
                <span class="font-medium">Valor promedio por contrato:</span>
                <span class="text-purple-600 font-bold">${UI.formatCurrency(avgContractValue)}</span>
            </div>
        </div>
        <div class="space-y-3">
            <div class="flex justify-between border-b pb-2">
                <span class="font-medium">Ingresos del período:</span>
                <span class="text-blue-600 font-bold">${UI.formatCurrency(totalIncome)}</span>
            </div>
            <div class="flex justify-between border-b pb-2">
                <span class="font-medium">Próximos aumentos (30 días):</span>
                <span class="text-yellow-600 font-bold">${nextIncreases}</span>
            </div>
            <div class="flex justify-between border-b pb-2">
                <span class="font-medium">Rendimiento general:</span>
                <span class="text-green-600 font-bold">${totalIncome > 0 ? 'Positivo' : 'Sin movimientos'}</span>
            </div>
        </div>
    `;
}

// Funciones de exportación - VERSIÓN CORREGIDA
window.exportarExcelCompleto = async function() {
    try {
        const wb = XLSX.utils.book_new();
        
        // Hoja de ingresos
        const incomeData = currentData.filteredContracts.map(c => ({
            Fecha: UI.formatDate(c.created_at),
            Inquilino: c.tenant_name,
            Contrato: c.id,
            Propietario: c.owner,
            'Monto Base': c.base_amount,
            Comisión: (c.base_amount * (c.agent_commission || 5) / 100).toFixed(2),
            Total: (c.base_amount * (1 + (c.agent_commission || 5) / 100)).toFixed(2)
        }));
        const wsIncome = XLSX.utils.json_to_sheet(incomeData);
        XLSX.utils.book_append_sheet(wb, wsIncome, 'Ingresos');
        
        // Hoja de inquilinos
        const tenantsData = currentData.tenants.map(t => ({
            Fecha: UI.formatDate(t.created_at),
            DNI: t.dni,
            Nombre: t.name,
            Email: t.email,
            Teléfono: t.phone,
            Dirección: t.address,
            Contratos: currentData.contracts.filter(c => c.tenant_id === t.id).length
        }));
        const wsTenants = XLSX.utils.json_to_sheet(tenantsData);
        XLSX.utils.book_append_sheet(wb, wsTenants, 'Inquilinos');
        
        // Hoja de contratos
        const contractsData = currentData.contracts.map(c => ({
            Fecha: UI.formatDate(c.created_at),
            Inquilino: c.tenant_name,
            Propietario: c.owner,
            Monto: c.base_amount,
            Duración: c.duration,
            Inicio: c.start_date,
            Fin: c.end_date,
            Estado: c.status
        }));
        const wsContracts = XLSX.utils.json_to_sheet(contractsData);
        XLSX.utils.book_append_sheet(wb, wsContracts, 'Contratos');

        // Hoja de pagos
        try {
            const pagos = await cargarPagosReportes();
            if (pagos && pagos.length > 0) {
                const pagosData = pagos.map(p => ({
                    Fecha: UI.formatDate(p.created_at),
                    Inquilino: p.tenant_name || 'N/A',
                    Contrato: p.contract_id,
                    Concepto: p.concept_name || 'Alquiler',
                    Monto: p.amount,
                    Comisión: p.commission || 0,
                    Total: p.total_amount,
                    Vencimiento: UI.formatDate(p.due_date),
                    Estado: p.status === 'paid' ? 'Pagado' : 'Pendiente'
                }));
                const wsPagos = XLSX.utils.json_to_sheet(pagosData);
                XLSX.utils.book_append_sheet(wb, wsPagos, 'Pagos');
            }
        } catch (error) {
            console.error('Error agregando pagos al Excel:', error);
            UI.toast('Error al cargar pagos para Excel', 'warning');
        }
        
        // Guardar archivo
        XLSX.writeFile(wb, `reporte_completo_${new Date().toISOString().split('T')[0]}.xlsx`);
        UI.toast('Reporte Excel generado correctamente', 'success');
        
    } catch (error) {
        console.error('Error exportando Excel:', error);
        UI.toast('Error al generar Excel: ' + error.message, 'error');
    }
};

window.exportarPDFCompleto = function() {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        doc.setFontSize(18);
        doc.setTextColor(37, 99, 235);
        doc.text('TENANT CRM', 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('Reporte Completo de Gestión', 14, 32);
        doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, 14, 38);
        
        // Resumen ejecutivo
        doc.setFontSize(14);
        doc.setTextColor(37, 99, 235);
        doc.text('Resumen Ejecutivo', 14, 48);
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Total Ingresos: ${UI.formatCurrency(currentData.filteredContracts.reduce((s, c) => s + (parseFloat(c.base_amount) || 0), 0))}`, 14, 56);
        doc.text(`Total Inquilinos: ${currentData.tenants.length}`, 14, 62);
        doc.text(`Contratos Activos: ${currentData.contracts.filter(c => c.status === 'active').length}`, 14, 68);
        
        // Tabla de contratos
        doc.autoTable({
            head: [['Inquilino', 'Monto', 'Estado']],
            body: currentData.contracts.slice(0, 20).map(c => [
                c.tenant_name || 'N/A',
                UI.formatCurrency(c.base_amount),
                c.status === 'active' ? 'Activo' : c.status
            ]),
            startY: 80,
            theme: 'striped',
            headStyles: { fillColor: [37, 99, 235] }
        });
        
        doc.save(`reporte_${new Date().toISOString().split('T')[0]}.pdf`);
        UI.toast('PDF generado correctamente', 'success');
    } catch (error) {
        console.error('Error exportando PDF:', error);
        UI.toast('Error al generar PDF', 'error');
    }
};

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
// FUNCIONES DE PAGOS PARA REPORTES
// ============================================

async function cargarPagosReportes() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/.netlify/functions/payments', {
            headers: { 'Authorization': token }
        });
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('Error cargando pagos:', error);
        return [];
    }
}

function agregarTablaPagos(pagos) {
    // Verificar si ya existe la tabla
    if (document.getElementById('paymentsReportTable')) return;
    
    const container = document.querySelector('#reporteCompleto .space-y-6');
    if (!container) return;
    
    const pagosFiltrados = pagos.filter(p => 
        currentData.filteredContracts.some(c => c.id === p.contract_id)
    );
    
    const totalPagos = pagosFiltrados.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
    const pagosPagados = pagosFiltrados.filter(p => p.status === 'paid').length;
    const pagosPendientes = pagosFiltrados.filter(p => p.status === 'pending').length;
    
    const tablaHTML = `
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden print:break-inside-avoid">
            <div class="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-3">
                <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                    <i class="fas fa-credit-card"></i>
                    Resumen de Pagos
                </h3>
            </div>
            <div class="p-4">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div class="bg-green-50 p-4 rounded-lg">
                        <p class="text-sm text-green-700">Pagados</p>
                        <p class="text-2xl font-bold text-green-600">${pagosPagados}</p>
                    </div>
                    <div class="bg-yellow-50 p-4 rounded-lg">
                        <p class="text-sm text-yellow-700">Pendientes</p>
                        <p class="text-2xl font-bold text-yellow-600">${pagosPendientes}</p>
                    </div>
                    <div class="bg-blue-50 p-4 rounded-lg">
                        <p class="text-sm text-blue-700">Total</p>
                        <p class="text-2xl font-bold text-blue-600">${UI.formatCurrency(totalPagos)}</p>
                    </div>
                </div>
                
                <table class="min-w-full divide-y divide-gray-200" id="paymentsReportTable">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Inquilino</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Concepto</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vencimiento</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pagosFiltrados.slice(0, 20).map(p => `
                            <tr>
                                <td class="px-4 py-2">${UI.formatDate(p.created_at)}</td>
                                <td class="px-4 py-2">${escapeHtml(p.tenant_name || 'N/A')}</td>
                                <td class="px-4 py-2">${escapeHtml(p.concept_name || 'Alquiler')}</td>
                                <td class="px-4 py-2">${UI.formatCurrency(p.total_amount)}</td>
                                <td class="px-4 py-2">${UI.formatDate(p.due_date)}</td>
                                <td class="px-4 py-2">
                                    <span class="badge ${p.status === 'paid' ? 'badge-success' : 'badge-warning'}">
                                        ${p.status === 'paid' ? 'Pagado' : 'Pendiente'}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${pagosFiltrados.length > 20 ? '<p class="text-sm text-gray-500 mt-2">Mostrando primeros 20 pagos</p>' : ''}
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', tablaHTML);
}

// Modificar la función generarReporteCompleto para incluir pagos
async function generarReporteCompleto() {
    console.log('📑 Generando reporte completo con pagos...');
    
    actualizarKPIs();
    actualizarGraficos();
    actualizarTablaIngresos();
    actualizarTablaInquilinos();
    actualizarTablaContratos();
    actualizarTablaAumentos();
    actualizarResumenEjecutivo();
    
    // Cargar y agregar pagos
    const pagos = await cargarPagosReportes();
    agregarTablaPagos(pagos);
}

// Funciones globales
window.generarReporteCompleto = generarReporteCompleto;