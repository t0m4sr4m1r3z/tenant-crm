// js/dashboard.js - Panel de Control y Métricas en Tiempo Real
let incomeChartInstance = null;
let statusChartInstance = null;

let dashboardData = {
    tenants: [],
    contracts: [],
    properties: [],
    payments: [],
    indices: null
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializar navegación y utilidades
    if (window.AppSidebar) AppSidebar.init();
    if (window.Breadcrumbs) Breadcrumbs.init();

    // 2. Establecer fecha de bienvenida
    const dateEl = document.getElementById('currentDate');
    if (dateEl) {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('es-AR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // 3. Obtener nombre de usuario
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            const userNameEl = document.getElementById('userName');
            if (userNameEl && user.name) {
                userNameEl.textContent = user.name;
            }
        } catch (e) {}
    }

    // 4. Inicializar eventos
    initDashboardEvents();

    // 5. Cargar todos los datos en paralelo con protección contra fallos individuales
    await cargarDatosDashboard();
});

function initDashboardEvents() {
    // Selector de año para el gráfico de ingresos
    const yearSelect = document.getElementById('incomeYearSelect');
    if (yearSelect) {
        yearSelect.value = new Date().getFullYear().toString();
        yearSelect.addEventListener('change', () => {
            renderizarGraficoIngresos(yearSelect.value);
        });
    }

    // Botones de recordatorios
    const sendRemindersBtn = document.getElementById('sendRemindersBtn');
    if (sendRemindersBtn) {
        sendRemindersBtn.addEventListener('click', enviarRecordatoriosPorEmail);
    }

    const refreshRemindersBtn = document.getElementById('refreshRemindersBtn');
    if (refreshRemindersBtn) {
        refreshRemindersBtn.addEventListener('click', async () => {
            await cargarDatosDashboard();
            UI.toast('Métricas actualizadas', 'success');
        });
    }
}

// ============================================
// CARGA SEGURA DE DATOS (READ-ONLY)
// ============================================

async function cargarDatosDashboard() {
    const token = sessionStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': token })
    };

    const safeFetch = async (url) => {
        try {
            const res = await fetch(url, { headers });
            if (!res.ok) return [];
            return await res.json();
        } catch (err) {
            console.warn(`Aviso al cargar ${url}:`, err.message);
            return [];
        }
    };

    try {
        // Consultas en paralelo (sin riesgo de bloqueo mutuo)
        const [tenants, contracts, properties, payments, indices] = await Promise.all([
            safeFetch('/.netlify/functions/tenants'),
            safeFetch('/.netlify/functions/contracts'),
            safeFetch('/.netlify/functions/properties'),
            safeFetch('/.netlify/functions/payments'),
            fetch('/.netlify/functions/indices').then(r => r.ok ? r.json() : null).catch(() => null)
        ]);

        dashboardData.tenants = Array.isArray(tenants) ? tenants : [];
        dashboardData.contracts = Array.isArray(contracts) ? contracts : [];
        dashboardData.properties = Array.isArray(properties) ? properties : [];
        dashboardData.payments = Array.isArray(payments) ? payments : [];
        dashboardData.indices = indices;

        // Renderizar todos los componentes
        actualizarKPIs();
        renderizarGraficos();
        renderizarActividadReciente();
        renderizarProximosAumentos();
        renderizarIndicesEconomicos();
        actualizarAlertasRecordatorios();

    } catch (error) {
        console.error('Error general cargando dashboard:', error);
    }
}

// ============================================
// CÁLCULO DE KPIS
// ============================================

function actualizarKPIs() {
    const { tenants, contracts, properties, payments } = dashboardData;
    const now = new Date();
    const currentYearMonth = now.toISOString().slice(0, 7); // "YYYY-MM"

    // 1. Total Inquilinos
    const totalTenantsEl = document.getElementById('totalTenants');
    if (totalTenantsEl) totalTenantsEl.textContent = tenants.length;

    const newTenantsEl = document.getElementById('newTenantsThisMonth');
    if (newTenantsEl) {
        const thisMonthTenants = tenants.filter(t => t.created_at && t.created_at.startsWith(currentYearMonth)).length;
        newTenantsEl.textContent = `+${thisMonthTenants}`;
    }

    // 2. Contratos Activos y por Vencer (próximos 30 días)
    const activeContracts = contracts.filter(c => c.status === 'active');
    const activeContractsEl = document.getElementById('activeContracts');
    if (activeContractsEl) activeContractsEl.textContent = activeContracts.length;

    const expiringSoonEl = document.getElementById('expiringSoon');
    if (expiringSoonEl) {
        const en30Dias = new Date();
        en30Dias.setDate(en30Dias.getDate() + 30);
        const en30DiasStr = en30Dias.toISOString().split('T')[0];
        const hoyStr = now.toISOString().split('T')[0];

        const porVencer = activeContracts.filter(c => {
            if (!c.end_date) return false;
            return c.end_date >= hoyStr && c.end_date <= en30DiasStr;
        }).length;

        expiringSoonEl.textContent = porVencer;
    }

    // 3. Próximos Aumentos
    const upcomingIncreasesEl = document.getElementById('upcomingIncreases');
    const nextIncreaseDateEl = document.getElementById('nextIncreaseDate');
    
    const aumentosFuturos = activeContracts
        .filter(c => c.next_increase_date && c.next_increase_date >= now.toISOString().split('T')[0])
        .sort((a, b) => a.next_increase_date.localeCompare(b.next_increase_date));

    if (upcomingIncreasesEl) upcomingIncreasesEl.textContent = aumentosFuturos.length;
    if (nextIncreaseDateEl) {
        if (aumentosFuturos.length > 0) {
            nextIncreaseDateEl.textContent = AppUtils.formatDate(aumentosFuturos[0].next_increase_date);
        } else {
            nextIncreaseDateEl.textContent = 'Ninguno';
        }
    }

    // 4. Total Propiedades y Disponibles
    const totalPropertiesEl = document.getElementById('totalProperties');
    if (totalPropertiesEl) totalPropertiesEl.textContent = properties.length;

    const availablePropertiesEl = document.getElementById('availableProperties');
    if (availablePropertiesEl) {
        const disponibles = properties.filter(p => p.status === 'disponible').length;
        availablePropertiesEl.textContent = disponibles;
    }

    // 5. Ingresos Mensuales Reales (Pagos cobrados en el mes actual)
    const monthlyIncomeEl = document.getElementById('monthlyIncome');
    if (monthlyIncomeEl) {
        let ingresosMesActual = 0;
        
        payments.forEach(p => {
            if (p.status === 'paid') {
                const fecha = p.payment_date || p.due_date;
                if (fecha && fecha.startsWith(currentYearMonth)) {
                    ingresosMesActual += parseFloat(p.amount) || 0;
                }
            }
        });

        // Fallback: si aún no cargaron pagos en el mes, mostrar suma de cánones activos
        if (ingresosMesActual === 0 && activeContracts.length > 0) {
            ingresosMesActual = activeContracts.reduce((sum, c) => sum + (parseFloat(c.base_amount) || 0), 0);
        }

        monthlyIncomeEl.textContent = AppUtils.formatCurrency(ingresosMesActual);
    }
}

// ============================================
// GRÁFICOS (DESTRUCCIÓN SEGURA EN CHART.JS v4)
// ============================================

function renderizarGraficos() {
    const yearSelect = document.getElementById('incomeYearSelect');
    const anio = yearSelect ? yearSelect.value : new Date().getFullYear().toString();

    renderizarGraficoIngresos(anio);
    renderizarGraficoEstadoContratos();
}

function renderizarGraficoIngresos(anio) {
    const ctx = document.getElementById('incomeChart');
    if (!ctx) return;

    // Destruir instancia previa para evitar el error "Canvas is already in use"
    if (incomeChartInstance) {
        incomeChartInstance.destroy();
        incomeChartInstance = null;
    }

    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const datosMensuales = new Array(12).fill(0);

    // Sumar ingresos reales por mes del año seleccionado
    dashboardData.payments.forEach(p => {
        if (p.status === 'paid') {
            const fecha = p.payment_date || p.due_date;
            if (fecha && fecha.startsWith(anio)) {
                const mesIdx = parseInt(fecha.split('-')[1], 10) - 1;
                if (mesIdx >= 0 && mesIdx < 12) {
                    datosMensuales[mesIdx] += parseFloat(p.amount) || 0;
                }
            }
        }
    });

    incomeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: meses,
            datasets: [{
                label: `Ingresos ${anio} ($)`,
                data: datosMensuales,
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderColor: '#6366f1',
                borderRadius: 8,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Recaudado: ${AppUtils.formatCurrency(ctx.raw)}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (val) => `$${val.toLocaleString('es-AR')}`
                    }
                }
            }
        }
    });
}

function renderizarGraficoEstadoContratos() {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;

    if (statusChartInstance) {
        statusChartInstance.destroy();
        statusChartInstance = null;
    }

    const counts = {
        active: 0,
        pending: 0,
        expired: 0,
        terminated: 0
    };

    dashboardData.contracts.forEach(c => {
        const st = c.status || 'pending';
        if (counts[st] !== undefined) counts[st]++;
    });

    statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Activos', 'Pendientes', 'Vencidos', 'Finalizados'],
            datasets: [{
                data: [counts.active, counts.pending, counts.expired, counts.terminated],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#64748b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // Leyenda inferior
    const legendEl = document.getElementById('statusLegend');
    if (legendEl) {
        legendEl.innerHTML = `
            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-emerald-500"></span> Activos: <strong>${counts.active}</strong></div>
            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-amber-500"></span> Pendientes: <strong>${counts.pending}</strong></div>
            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-red-500"></span> Vencidos: <strong>${counts.expired}</strong></div>
            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-slate-500"></span> Finalizados: <strong>${counts.terminated}</strong></div>
        `;
    }
}

// ============================================
// TABLAS Y LISTAS INFORMATIVAS
// ============================================

function renderizarActividadReciente() {
    const tbody = document.getElementById('recentActivityTable');
    if (!tbody) return;

    const ultimosPagos = [...dashboardData.payments]
        .sort((a, b) => (b.payment_date || b.due_date || '').localeCompare(a.payment_date || a.due_date || ''))
        .slice(0, 5);

    if (ultimosPagos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-400">Sin actividad reciente registrada</td></tr>`;
        return;
    }

    tbody.innerHTML = ultimosPagos.map(p => `
        <tr class="border-b border-slate-100 dark:border-slate-800 text-sm">
            <td class="py-3 font-medium text-slate-800 dark:text-slate-200">${AppUtils.escapeHtml(p.tenant_name || 'Inquilino')}</td>
            <td class="py-3 text-slate-600 dark:text-slate-400">${AppUtils.escapeHtml(p.concept || 'Alquiler')} (${AppUtils.formatCurrency(p.amount)})</td>
            <td class="py-3 text-slate-500">${AppUtils.formatDate(p.payment_date || p.due_date)}</td>
            <td class="py-3">
                <span class="badge ${p.status === 'paid' ? 'badge-success' : 'badge-warning'}">
                    ${p.status === 'paid' ? 'Cobrado' : 'Pendiente'}
                </span>
            </td>
        </tr>
    `).join('');
}

function renderizarProximosAumentos() {
    const container = document.getElementById('upcomingList');
    if (!container) return;

    const hoy = new Date().toISOString().split('T')[0];
    const proximos = dashboardData.contracts
        .filter(c => c.next_increase_date && c.next_increase_date >= hoy)
        .sort((a, b) => a.next_increase_date.localeCompare(b.next_increase_date))
        .slice(0, 4);

    if (proximos.length === 0) {
        container.innerHTML = `<p class="text-slate-400 text-sm py-4 text-center">No hay aumentos programados para los próximos días.</p>`;
        return;
    }

    container.innerHTML = proximos.map(c => `
        <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
            <div>
                <p class="font-semibold text-sm text-slate-800 dark:text-slate-200">${AppUtils.escapeHtml(c.tenant_name || 'Contrato #' + c.id)}</p>
                <p class="text-xs text-slate-400">Vigencia: ${AppUtils.formatDate(c.next_increase_date)}</p>
            </div>
            <div class="text-right">
                <span class="text-xs font-bold px-2 py-1 bg-amber-50 text-amber-700 rounded-md">
                    ${(c.increase_type || 'Fijo').toUpperCase()}
                </span>
            </div>
        </div>
    `).join('');
}

function renderizarIndicesEconomicos() {
    const indices = dashboardData.indices;
    if (!indices) return;

    const ipcVal = document.getElementById('ipcValue');
    const ipcDate = document.getElementById('ipcDate');
    const iclVal = document.getElementById('iclValue');
    const iclDate = document.getElementById('iclDate');
    const updateTime = document.getElementById('indicesUpdateTime');

    if (ipcVal) ipcVal.textContent = `${indices.ipc}%`;
    if (ipcDate) ipcDate.textContent = `Período: ${indices.ipcDate || '-'}`;
    if (iclVal) iclVal.textContent = `${indices.icl}%`;
    if (iclDate) iclDate.textContent = `Período: ${indices.iclDate || '-'}`;
    if (updateTime) updateTime.textContent = 'Actualizado automáticamente';
}

function actualizarAlertasRecordatorios() {
    const { payments, contracts } = dashboardData;
    const hoy = new Date().toISOString().split('T')[0];

    const vencidos = payments.filter(p => p.status === 'overdue' || (p.status === 'pending' && p.due_date < hoy)).length;

    const en30Dias = new Date();
    en30Dias.setDate(en30Dias.getDate() + 30);
    const en30DiasStr = en30Dias.toISOString().split('T')[0];
    const contratosVenciendo = contracts.filter(c => c.status === 'active' && c.end_date && c.end_date >= hoy && c.end_date <= en30DiasStr).length;

    const en60Dias = new Date();
    en60Dias.setDate(en60Dias.getDate() + 60);
    const en60DiasStr = en60Dias.toISOString().split('T')[0];
    const aumentosProximos = contracts.filter(c => c.next_increase_date && c.next_increase_date >= hoy && c.next_increase_date <= en60DiasStr).length;

    const elVencidos = document.getElementById('reminderOverduePayments');
    if (elVencidos) elVencidos.textContent = vencidos;

    const elContratos = document.getElementById('reminderExpiringContracts');
    if (elContratos) elContratos.textContent = contratosVenciendo;

    const elAumentos = document.getElementById('reminderUpcomingIncreases');
    if (elAumentos) elAumentos.textContent = aumentosProximos;
}

// ============================================
// ENVÍO DE RECORDATORIOS
// ============================================

async function enviarRecordatoriosPorEmail() {
    const statusDiv = document.getElementById('reminderStatus');
    const btn = document.getElementById('sendRemindersBtn');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Enviando...';
    }

    try {
        const res = await fetch('/.netlify/functions/delinquency', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (statusDiv) {
            statusDiv.classList.remove('hidden');
            if (res.ok) {
                statusDiv.className = 'mt-3 text-sm text-emerald-600';
                statusDiv.innerHTML = '<i class="fas fa-check-circle mr-1"></i> Recordatorios procesados con éxito.';
            } else {
                statusDiv.className = 'mt-3 text-sm text-amber-600';
                statusDiv.innerHTML = '<i class="fas fa-info-circle mr-1"></i> El servicio de email requiere validar el remitente en Resend.';
            }
        }
    } catch (e) {
        if (statusDiv) {
            statusDiv.classList.remove('hidden');
            statusDiv.className = 'mt-3 text-sm text-slate-500';
            statusDiv.textContent = 'Aviso: Configura tu API Key de Resend para despachar correos masivos.';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-envelope mr-2"></i>Enviar recordatorios por email';
        }
    }
}

// Función expuesta para actualizar índices manualmente si se desea
window.actualizarIndices = async function() {
    try {
        const res = await fetch('/.netlify/functions/indices?refresh=true');
        if (res.ok) {
            const data = await res.json();
            dashboardData.indices = data;
            renderizarIndicesEconomicos();
            UI.toast('Índices actualizados en tiempo real', 'success');
        }
    } catch (e) {
        UI.toast('Error al consultar índices', 'error');
    }
};