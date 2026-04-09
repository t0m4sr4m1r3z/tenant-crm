// dashboard.js - Versión con pagos integrados
let incomeChart = null;
let statusChart = null;

// API Client
const API = {
    baseUrl: '/.netlify/functions',
    
    async request(endpoint) {
        const token = localStorage.getItem('authToken');
        
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                headers: { 'Authorization': token }
            });
            
            if (response.status === 401) {
                localStorage.removeItem('authToken');
                window.location.href = '/login.html';
                return null;
            }
            
            return await response.json();
        } catch (error) {
            console.error(`Error en API ${endpoint}:`, error);
            return null;
        }
    },
    
    async getTenants() {
        return this.request('/tenants');
    },
    
    async getContracts() {
        return this.request('/contracts');
    },
    
    async getPayments() {
        return this.request('/payments');
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📊 Dashboard cargado');
    
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    if (!window.UI) {
        window.UI = {
            formatCurrency: (amount) => `$${Number(amount).toLocaleString()}`,
            formatDate: (date) => new Date(date).toLocaleDateString('es-ES')
        };
    }
    
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userNameSpan = document.getElementById('userName');
    if (userNameSpan) {
        userNameSpan.textContent = user.name || 'Administrador';
    }
    
    const dateSpan = document.getElementById('currentDate');
    if (dateSpan) {
        dateSpan.textContent = new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    initSidebar();
    await loadDashboardData();
    
    // Auto-refresh cada 5 minutos
    setInterval(() => {
        loadDashboardData(true);
    }, 300000);
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

async function loadDashboardData(silent = false) {
    try {
        if (!silent) {
            showSkeletons();
        }
        
        const [tenants, contracts, payments] = await Promise.all([
            API.getTenants(),
            API.getContracts(),
            API.getPayments()
        ]);
        
        if (!silent) {
            UI.toast('Datos actualizados correctamente', 'success');
        }
        
        console.log('📦 Datos cargados:', { 
            tenants: tenants?.length || 0, 
            contracts: contracts?.length || 0,
            payments: payments?.length || 0
        });
        
        processDashboardData(tenants || [], contracts || [], payments || []);
        
    } catch (error) {
        console.error('Error cargando datos:', error);
        if (!silent) {
            UI.toast('Error al cargar los datos', 'error');
        }
    }
}

function showSkeletons() {
    const stats = ['totalTenants', 'activeContracts', 'upcomingIncreases', 'monthlyIncome'];
    stats.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '<div class="skeleton w-20 h-8"></div>';
        }
    });
}

function processDashboardData(tenants, contracts, payments) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Estadísticas básicas
    document.getElementById('totalTenants').textContent = tenants.length;
    
    const activeContracts = contracts.filter(c => c && c.status === 'active');
    document.getElementById('activeContracts').textContent = activeContracts.length;
    
    // Inquilinos nuevos este mes
    const newTenantsThisMonth = tenants.filter(t => {
        if (!t || !t.created_at) return false;
        const created = new Date(t.created_at);
        return created.getMonth() === currentMonth && created.getFullYear() === currentYear;
    }).length;
    document.getElementById('newTenantsThisMonth').textContent = `+${newTenantsThisMonth}`;
    
    // Contratos por vencer
    const expiringSoon = activeContracts.filter(c => {
        if (!c || !c.end_date) return false;
        const endDate = new Date(c.end_date);
        const diffDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
        return diffDays > 0 && diffDays <= 30;
    }).length;
    document.getElementById('expiringSoon').textContent = expiringSoon;
    
    // Próximos aumentos
    const upcomingIncreases = contracts.filter(c => {
        if (!c || !c.next_increase_date) return false;
        const nextDate = new Date(c.next_increase_date);
        const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
        return diffDays > 0 && diffDays <= 60;
    });
    document.getElementById('upcomingIncreases').textContent = upcomingIncreases.length;
    
    if (upcomingIncreases.length > 0 && upcomingIncreases[0].next_increase_date) {
        const nextDate = new Date(upcomingIncreases[0].next_increase_date);
        document.getElementById('nextIncreaseDate').textContent = nextDate.toLocaleDateString();
    } else {
        document.getElementById('nextIncreaseDate').textContent = '-';
    }
    
    // Ingresos mensuales (de pagos reales)
    const monthlyIncome = (payments || [])
        .filter(p => {
            if (!p.paid_at) return false;
            const paidDate = new Date(p.paid_at);
            return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
        })
        .reduce((sum, p) => sum + (parseFloat(p.total_amount) || 0), 0);
    
    animateNumber('monthlyIncome', 0, monthlyIncome, 'currency');
    
    // Procesar pagos para las tarjetas adicionales
    procesarPagosDashboard(payments || []);
    
    // Crear gráficos (con timeout para asegurar que el DOM está listo)
    setTimeout(() => {
        createIncomeChart(contracts, currentYear);
        createStatusChart(contracts);
    }, 100);
    
    // Actividad reciente
    renderRecentActivity(tenants, contracts);
    
    // Próximos aumentos lista
    renderUpcomingList(upcomingIncreases);
}

function procesarPagosDashboard(payments) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    // Pagos vencidos
    const pagosVencidos = payments.filter(p => {
        if (p.status !== 'pending') return false;
        const dueDate = new Date(p.due_date);
        return dueDate < today;
    });
    
    const totalVencido = pagosVencidos.reduce((sum, p) => sum + (parseFloat(p.total_amount) || 0), 0);
    
    // Pagos pendientes próximos
    const pagosPendientes = payments.filter(p => {
        if (p.status !== 'pending') return false;
        const dueDate = new Date(p.due_date);
        return dueDate >= today && dueDate <= sevenDaysFromNow;
    });
    
    const totalPendiente = pagosPendientes.reduce((sum, p) => sum + (parseFloat(p.total_amount) || 0), 0);
    
    // Pagos del mes
    const pagosMes = payments.filter(p => {
        if (p.status !== 'paid') return false;
        const paidDate = new Date(p.paid_at || p.updated_at);
        return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
    });
    
    const totalMes = pagosMes.reduce((sum, p) => sum + (parseFloat(p.total_amount) || 0), 0);
    
    // Actualizar o crear tarjetas
    actualizarTarjetasPagos({
        vencidos: pagosVencidos.length,
        totalVencido,
        pendientes: pagosPendientes.length,
        totalPendiente,
        mes: pagosMes.length,
        totalMes
    });
}

function actualizarTarjetasPagos(datos) {
    // Verificar si las tarjetas ya existen
    let pagosVencidosEl = document.getElementById('pagosVencidos');
    
    if (!pagosVencidosEl) {
        crearTarjetasPagos();
        // Reobtener referencias
        pagosVencidosEl = document.getElementById('pagosVencidos');
    }
    
    // Actualizar valores
    if (pagosVencidosEl) {
        document.getElementById('pagosVencidos').textContent = datos.vencidos;
        document.getElementById('totalVencido').textContent = UI.formatCurrency(datos.totalVencido);
        document.getElementById('pagosPendientes').textContent = datos.pendientes;
        document.getElementById('totalPendiente').textContent = UI.formatCurrency(datos.totalPendiente);
        document.getElementById('pagosMes').textContent = datos.mes;
        document.getElementById('totalMes').textContent = UI.formatCurrency(datos.totalMes);
    }
}

function crearTarjetasPagos() {
    // Buscar el contenedor de estadísticas
    const statsGrid = document.querySelector('.grid.grid-cols-1');
    if (!statsGrid) return;
    
    // Crear un nuevo contenedor para las tarjetas de pagos
    const pagosRow = document.createElement('div');
    pagosRow.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6';
    pagosRow.innerHTML = `
        <!-- Pagos Vencidos -->
        <div class="bg-white p-6 rounded-xl shadow-sm border border-red-100 hover:shadow-md transition">
            <div class="flex items-center justify-between mb-3">
                <div>
                    <p class="text-gray-500 text-sm">Pagos Vencidos</p>
                    <p class="text-3xl font-bold text-red-600" id="pagosVencidos">0</p>
                </div>
                <div class="bg-red-100 p-3 rounded-lg">
                    <i class="fas fa-exclamation-triangle text-red-600 text-2xl"></i>
                </div>
            </div>
            <div class="text-sm text-gray-500">
                Total: <span class="font-medium text-red-600" id="totalVencido">$0</span>
            </div>
        </div>
        
        <!-- Pagos Pendientes -->
        <div class="bg-white p-6 rounded-xl shadow-sm border border-yellow-100 hover:shadow-md transition">
            <div class="flex items-center justify-between mb-3">
                <div>
                    <p class="text-gray-500 text-sm">Pagos Pendientes</p>
                    <p class="text-3xl font-bold text-yellow-600" id="pagosPendientes">0</p>
                </div>
                <div class="bg-yellow-100 p-3 rounded-lg">
                    <i class="fas fa-clock text-yellow-600 text-2xl"></i>
                </div>
            </div>
            <div class="text-sm text-gray-500">
                Total: <span class="font-medium text-yellow-600" id="totalPendiente">$0</span>
            </div>
        </div>
        
        <!-- Pagos del Mes -->
        <div class="bg-white p-6 rounded-xl shadow-sm border border-green-100 hover:shadow-md transition">
            <div class="flex items-center justify-between mb-3">
                <div>
                    <p class="text-gray-500 text-sm">Pagos del Mes</p>
                    <p class="text-3xl font-bold text-green-600" id="pagosMes">0</p>
                </div>
                <div class="bg-green-100 p-3 rounded-lg">
                    <i class="fas fa-check-circle text-green-600 text-2xl"></i>
                </div>
            </div>
            <div class="text-sm text-gray-500">
                Total: <span class="font-medium text-green-600" id="totalMes">$0</span>
            </div>
        </div>
    `;
    
    // Insertar después del grid de estadísticas
    statsGrid.parentNode.insertBefore(pagosRow, statsGrid.nextSibling);
}

function animateNumber(elementId, start, end, format = 'number') {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = format === 'currency' ? UI.formatCurrency(end) : end.toString();
}

function createIncomeChart(contracts, year) {
    const canvas = document.getElementById('incomeChart');
    if (!canvas) return;
    
    // Empty state handling via DOM instead of raw canvas to prevent resize bug
    let emptyStateDiv = document.getElementById('incomeChartEmptyState');
    if (!emptyStateDiv) {
        emptyStateDiv = document.createElement('div');
        emptyStateDiv.id = 'incomeChartEmptyState';
        emptyStateDiv.className = 'absolute inset-0 flex items-center justify-center text-slate-400 font-medium bg-slate-50/50 rounded-xl backdrop-blur-sm z-10 hidden';
        emptyStateDiv.textContent = 'No hay datos para el año seleccionado';
        canvas.parentElement.appendChild(emptyStateDiv);
    }
    
    // Mostrar u ocultar canvas/empty state
    const monthlyData = new Array(12).fill(0);
    contracts.filter(c => c && c.status === 'active' && c.start_date).forEach(contract => {
        try {
            const startDate = new Date(contract.start_date);
            if (startDate.getFullYear() === year) {
                const month = startDate.getMonth();
                monthlyData[month] += parseFloat(contract.base_amount) || 0;
            }
        } catch (e) {}
    });
    
    const hasData = monthlyData.some(v => v > 0);
    
    if (!hasData) {
        canvas.style.display = 'none';
        emptyStateDiv.classList.remove('hidden');
        if (incomeChart) {
            incomeChart.destroy();
            incomeChart = null;
        }
        return;
    } else {
        canvas.style.display = 'block';
        emptyStateDiv.classList.add('hidden');
    }
    
    const ctx = canvas.getContext('2d');
    if (incomeChart) {
        incomeChart.destroy();
    }
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(79, 70, 229, 0.4)'); // primary-600
    gradient.addColorStop(1, 'rgba(79, 70, 229, 0.0)');
    
    incomeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
            datasets: [{
                label: 'Ingresos ($)',
                data: monthlyData,
                borderColor: '#4f46e5',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#4f46e5',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: 'Inter', size: 13 },
                    bodyFont: { family: 'Inter', size: 14, weight: 'bold' },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) { label += UI.formatCurrency(context.parsed.y); }
                            return label;
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
            scales: {
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: 'rgba(2f, 41, 59, 0.05)', drawBorder: false },
                    ticks: { callback: value => UI.formatCurrency(value), font: { family: 'Inter', size: 11 }, color: '#64748b' }
                },
                x: {
                    border: { display: false },
                    grid: { display: false },
                    ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' }
                }
            }
        }
    });
}

function createStatusChart(contracts) {
    const canvas = document.getElementById('statusChart');
    if (!canvas) return;
    
    let emptyStateDiv = document.getElementById('statusChartEmptyState');
    if (!emptyStateDiv) {
        emptyStateDiv = document.createElement('div');
        emptyStateDiv.id = 'statusChartEmptyState';
        emptyStateDiv.className = 'absolute inset-0 flex items-center justify-center text-slate-400 font-medium bg-slate-50/50 rounded-xl backdrop-blur-sm z-10 hidden';
        emptyStateDiv.textContent = 'No hay contratos para mostrar';
        canvas.parentElement.appendChild(emptyStateDiv);
    }
    
    const statusCounts = {
        active: contracts.filter(c => c && c.status === 'active').length,
        pending: contracts.filter(c => c && c.status === 'pending').length,
        expired: contracts.filter(c => c && c.status === 'expired').length,
        terminated: contracts.filter(c => c && c.status === 'terminated').length
    };
    
    const hasData = Object.values(statusCounts).some(v => v > 0);
    
    if (!hasData) {
        canvas.style.display = 'none';
        emptyStateDiv.classList.remove('hidden');
        if (statusChart) {
            statusChart.destroy();
            statusChart = null;
        }
        
        const legend = document.getElementById('statusLegend');
        if (legend) legend.innerHTML = '';
        return;
    } else {
        canvas.style.display = 'block';
        emptyStateDiv.classList.add('hidden');
    }
    
    const ctx = canvas.getContext('2d');
    if (statusChart) {
        statusChart.destroy();
    }
    
    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Activos', 'Pendientes', 'Vencidos', 'Terminados'],
            datasets: [{
                data: [statusCounts.active, statusCounts.pending, statusCounts.expired, statusCounts.terminated],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#cbd5e1'],
                hoverBackgroundColor: ['#059669', '#d97706', '#dc2626', '#94a3b8'],
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { family: 'Inter', size: 13 },
                    bodyFont: { family: 'Inter', size: 14, weight: 'bold' },
                    padding: 12,
                    cornerRadius: 8
                }
            },
            cutout: '75%',
            animation: { animateScale: true, animateRotate: true }
        }
    });
    
    const legend = document.getElementById('statusLegend');
    if (legend) {
        const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
        legend.innerHTML = `
            <div class="flex items-center"><span class="w-3 h-3 bg-emerald-500 rounded-full mr-2 shadow-sm"></span>Activos: <span class="font-bold ml-1 text-slate-700">${statusCounts.active}</span></div>
            <div class="flex items-center"><span class="w-3 h-3 bg-amber-500 rounded-full mr-2 shadow-sm"></span>Pendientes: <span class="font-bold ml-1 text-slate-700">${statusCounts.pending}</span></div>
            <div class="flex items-center"><span class="w-3 h-3 bg-red-500 rounded-full mr-2 shadow-sm"></span>Vencidos: <span class="font-bold ml-1 text-slate-700">${statusCounts.expired}</span></div>
            <div class="flex items-center"><span class="w-3 h-3 bg-slate-300 rounded-full mr-2 shadow-sm"></span>Clausurados: <span class="font-bold ml-1 text-slate-700">${statusCounts.terminated}</span></div>
        `;
    }
}

function renderRecentActivity(tenants, contracts) {
    const tbody = document.getElementById('recentActivityTable');
    if (!tbody) return;
    
    const activities = [];
    
    (tenants || []).slice(0, 3).forEach(t => {
        if (!t) return;
        activities.push({
            name: t.name || 'N/A',
            action: 'Nuevo inquilino',
            date: t.created_at ? new Date(t.created_at) : new Date(),
            status: 'Completado'
        });
    });
    
    (contracts || []).slice(0, 3).forEach(c => {
        if (!c) return;
        activities.push({
            name: c.tenant_name || 'N/A',
            action: 'Contrato creado',
            date: c.created_at ? new Date(c.created_at) : new Date(),
            status: c.status === 'active' ? 'Activo' : (c.status || 'N/A')
        });
    });
    
    activities.sort((a, b) => b.date - a.date);
    
    if (activities.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-gray-500">No hay actividad reciente</td></tr>';
        return;
    }
    
    tbody.innerHTML = activities.slice(0, 5).map(a => `
        <tr class="border-b">
            <td class="py-3">${escapeHtml(a.name)}</td>
            <td class="py-3">${a.action}</td>
            <td class="py-3">${a.date.toLocaleDateString()}</td>
            <td class="py-3"><span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">${a.status}</span></td>
        </tr>
    `).join('');
}

function renderUpcomingList(increases) {
    const container = document.getElementById('upcomingList');
    if (!container) return;
    
    if (!increases || increases.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-4">No hay aumentos programados</div>';
        return;
    }
    
    container.innerHTML = increases.slice(0, 5).map(inc => {
        const date = new Date(inc.next_increase_date);
        const daysUntil = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
        
        return `
            <div class="bg-blue-50 p-3 rounded-lg">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="font-medium">${escapeHtml(inc.tenant_name || 'N/A')}</p>
                        <p class="text-sm text-gray-600">${UI.formatCurrency(inc.base_amount)}</p>
                    </div>
                    <div class="text-right">
                        <p class="font-semibold">${date.toLocaleDateString()}</p>
                        <p class="text-xs text-gray-500">${daysUntil} días</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

async function actualizarIndices() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/.netlify/functions/indices', {
            headers: { 'Authorization': token }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.ipc) {
                document.getElementById('ipcValue').textContent = `${data.ipc.monthly}%`;
                document.getElementById('ipcDate').textContent = `Actualizado: ${UI.formatDate(data.ipc.date)}`;
                document.getElementById('indicesUpdateTime').textContent = `Última actualización: ${new Date(data.updatedAt).toLocaleTimeString()}`;
            }
            
            if (data.icl) {
                document.getElementById('iclValue').textContent = `${data.icl.monthly}%`;
                document.getElementById('iclDate').textContent = `Actualizado: ${UI.formatDate(data.icl.date)}`;
            }
            
            UI.toast('Índices actualizados correctamente', 'success');
        }
    } catch (error) {
        console.error('Error actualizando índices:', error);
        UI.toast('Error al actualizar índices', 'error');
    }
}

// ============================================
// ÍNDICES ECONÓMICOS EN DASHBOARD
// ============================================

async function actualizarIndices() {
    const indices = getIndices();
    
    const ipcValue = document.getElementById('ipcValue');
    const iclValue = document.getElementById('iclValue');
    const ipcDate = document.getElementById('ipcDate');
    const iclDate = document.getElementById('iclDate');
    const indicesUpdateTime = document.getElementById('indicesUpdateTime');
    
    if (ipcValue) ipcValue.textContent = `${indices.ipc}%`;
    if (iclValue) iclValue.textContent = `${indices.icl}%`;
    if (ipcDate) ipcDate.textContent = `Actualizado: ${indices.ipcFecha}`;
    if (iclDate) iclDate.textContent = `Actualizado: ${indices.iclFecha}`;
    if (indicesUpdateTime) {
        indicesUpdateTime.textContent = `Última actualización: ${new Date(window.INDICES_CONFIG?.ultimaActualizacion).toLocaleTimeString()}`;
    }
    
    console.log('📊 Dashboard actualizado con índices:', indices);
}

// Escuchar cambios en los índices
window.addEventListener('indicesActualizados', () => {
    actualizarIndices();
});

// Modificar la función existente actualizarIndices del dashboard
// Si ya existe, reemplázala o asegúrate de que llame a getIndices()

// Llamar al cargar el dashboard
document.addEventListener('DOMContentLoaded', () => {
    // ... código existente ...
    actualizarIndices();
    // Actualizar cada hora
    setInterval(actualizarIndices, 3600000);
});