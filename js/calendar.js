// js/calendar.js - Calendario de Eventos, Vencimientos y Cobranzas
let calendar = null;
let calendarEvents = [];
let allPaymentsData = [];
let allContractsData = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (window.AppSidebar) AppSidebar.init();
    if (window.Breadcrumbs) Breadcrumbs.init();

    initCalendarControls();
    crearModalDetalleEvento();

    await cargarDatosCalendario();
});

function initCalendarControls() {
    const todayBtn = document.getElementById('todayBtn');
    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            if (calendar) calendar.today();
        });
    }

    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await cargarDatosCalendario();
            UI.toast('Calendario actualizado', 'success');
        });
    }

    const remindersBtn = document.getElementById('sendCalendarRemindersBtn');
    if (remindersBtn) {
        remindersBtn.addEventListener('click', abrirResumenRecordatoriosMes);
    }
}

// ============================================
// CARGA DE DATOS (READ-ONLY)
// ============================================

async function cargarDatosCalendario() {
    const token = sessionStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', ...(token && { 'Authorization': token }) };

    const fetchSafe = (url) => fetch(url, { headers }).then(r => r.ok ? r.json() : []).catch(() => []);

    try {
        const [payments, contracts] = await Promise.all([
            fetchSafe('/.netlify/functions/payments'),
            fetchSafe('/.netlify/functions/contracts')
        ]);

        allPaymentsData = Array.isArray(payments) ? payments : [];
        allContractsData = Array.isArray(contracts) ? contracts : [];

        calendarEvents = generarEventos(allPaymentsData, allContractsData);
        inicializarFullCalendar();

    } catch (error) {
        console.error('Error cargando calendario:', error);
        UI.toast('Error al sincronizar eventos', 'error');
    }
}

// ============================================
// GENERACIÓN DE EVENTOS (SIN DESFASE HORARIO)
// ============================================

function generarEventos(payments, contracts) {
    const events = [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const calcularDiasRestantes = (dateStr) => {
        if (!dateStr) return null;
        const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
        const target = new Date(y, m - 1, d);
        return Math.round((target - hoy) / (1000 * 60 * 60 * 24));
    };

    // 1. Pagos pendientes y vencidos
    payments.forEach(p => {
        if (p.status !== 'paid' && p.due_date) {
            const fechaLimpia = p.due_date.slice(0, 10); // Formato exacto YYYY-MM-DD
            const dias = calcularDiasRestantes(fechaLimpia);
            const esVencido = dias < 0 || p.status === 'overdue';

            const color = esVencido ? '#ef4444' : '#f59e0b';
            const etiqueta = esVencido ? '⚠️ Vencido' : '⏳ Por vencer';
            const inquilino = p.tenant_name || 'Inquilino';
            const monto = parseFloat(p.amount) || 0;

            events.push({
                id: `pay-${p.id}`,
                title: `${etiqueta}: ${inquilino} - ${AppUtils.formatCurrency(monto)}`,
                start: fechaLimpia,
                allDay: true,
                backgroundColor: color,
                borderColor: color,
                textColor: '#ffffff',
                extendedProps: {
                    tipo: 'pago',
                    subtipo: esVencido ? 'vencido' : 'proximo',
                    inquilino,
                    telefono: p.tenant_phone,
                    monto,
                    concepto: p.concept || 'Alquiler',
                    propiedad: p.property_address || 'Inmueble',
                    fechaVencimiento: fechaLimpia,
                    contratoId: p.contract_id
                }
            });
        }
    });

    // 2. Aumentos programados (próximos 90 días)
    contracts.forEach(c => {
        if (c.status === 'active' && c.next_increase_date) {
            const fechaAumento = c.next_increase_date.slice(0, 10);
            const dias = calcularDiasRestantes(fechaAumento);

            if (dias >= -15 && dias <= 90) {
                const monto = parseFloat(c.base_amount) || 0;
                const pct = parseFloat(c.increase_value) || 0;
                const nuevoMonto = monto * (1 + (pct / 100));
                const inquilino = c.tenant_name || 'Inquilino';

                events.push({
                    id: `inc-${c.id}`,
                    title: `📈 Aumento: ${inquilino} (${(c.increase_type || 'Fijo').toUpperCase()})`,
                    start: fechaAumento,
                    allDay: true,
                    backgroundColor: '#10b981',
                    borderColor: '#10b981',
                    textColor: '#ffffff',
                    extendedProps: {
                        tipo: 'aumento',
                        inquilino,
                        telefono: c.tenant_phone,
                        montoActual: monto,
                        nuevoMontoEstimado: nuevoMonto,
                        porcentaje: pct,
                        tipoAumento: c.increase_type || 'Fijo',
                        propiedad: c.property_address || 'Inmueble',
                        fecha: fechaAumento,
                        contratoId: c.id
                    }
                });
            }
        }
    });

    // 3. Contratos por finalizar
    contracts.forEach(c => {
        if (c.status === 'active' && c.end_date) {
            const fechaFin = c.end_date.slice(0, 10);
            const dias = calcularDiasRestantes(fechaFin);

            if (dias >= 0 && dias <= 60) {
                events.push({
                    id: `end-${c.id}`,
                    title: `📄 Vence contrato: ${c.tenant_name || 'Inquilino'}`,
                    start: fechaFin,
                    allDay: true,
                    backgroundColor: '#3b82f6',
                    borderColor: '#3b82f6',
                    textColor: '#ffffff',
                    extendedProps: {
                        tipo: 'fin_contrato',
                        inquilino: c.tenant_name || 'Inquilino',
                        telefono: c.tenant_phone,
                        propiedad: c.property_address || 'Inmueble',
                        fechaFin,
                        diasRestantes: dias,
                        contratoId: c.id
                    }
                });
            }
        }
    });

    return events;
}

// ============================================
// INICIALIZACIÓN DE FULLCALENDAR
// ============================================

function inicializarFullCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl || typeof FullCalendar === 'undefined') return;

    if (calendar) {
        calendar.destroy();
        calendar = null;
    }

    calendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'es',
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek,listMonth'
        },
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            list: 'Agenda'
        },
        titleFormat: { year: 'numeric', month: 'long' },
        events: calendarEvents,
        height: 'auto',
        dayMaxEvents: 3,

        // Click en evento: Abre el modal de detalle con opciones
        eventClick: function(info) {
            info.jsEvent.preventDefault();
            mostrarDetalleEvento(info.event.extendedProps);
        }
    });

    calendar.render();
}

// ============================================
// MODAL DE DETALLE Y ACCIONES DIRECTAS
// ============================================

function crearModalDetalleEvento() {
    if (document.getElementById('calendarEventModal')) return;

    const modal = document.createElement('div');
    modal.id = 'calendarEventModal';
    modal.className = 'fixed inset-0 z-50 hidden flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onclick="cerrarDetalleEvento()"></div>
        <div class="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 z-10 border border-slate-100 dark:border-slate-800 animate-fade-in">
            <div class="flex justify-between items-start mb-4">
                <h3 id="calModalTitle" class="text-lg font-bold text-slate-800 dark:text-white"></h3>
                <button onclick="cerrarDetalleEvento()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-lg"></i></button>
            </div>
            <div id="calModalBody" class="space-y-3 text-sm text-slate-600 dark:text-slate-300"></div>
            <div id="calModalActions" class="mt-6 flex flex-wrap gap-2 justify-end pt-3 border-t border-slate-100 dark:border-slate-800"></div>
        </div>
    `;
    document.body.appendChild(modal);
}

function mostrarDetalleEvento(props) {
    const modal = document.getElementById('calendarEventModal');
    const title = document.getElementById('calModalTitle');
    const body = document.getElementById('calModalBody');
    const actions = document.getElementById('calModalActions');

    if (!modal) return;

    if (props.tipo === 'pago') {
        const esVencido = props.subtipo === 'vencido';
        title.innerHTML = `<span class="${esVencido ? 'text-red-600' : 'text-amber-600'}">${esVencido ? '⚠️ Pago Vencido' : '⏳ Pago Próximo'}</span>`;
        body.innerHTML = `
            <p><strong>Inquilino:</strong> ${AppUtils.escapeHtml(props.inquilino)}</p>
            <p><strong>Inmueble:</strong> ${AppUtils.escapeHtml(props.propiedad)}</p>
            <p><strong>Concepto:</strong> ${AppUtils.escapeHtml(props.concepto)}</p>
            <p><strong>Importe:</strong> <span class="font-bold text-base text-slate-900 dark:text-white">${AppUtils.formatCurrency(props.monto)}</span></p>
            <p><strong>Vencimiento:</strong> ${AppUtils.formatDate(props.fechaVencimiento)}</p>
        `;

        actions.innerHTML = `
            <button onclick="cerrarDetalleEvento()" class="px-3 py-1.5 border rounded-lg hover:bg-slate-50 text-xs">Cerrar</button>
            <a href="/payments.html" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs">Ir a Cobranzas</a>
            ${props.telefono ? `
            <button onclick="enviarWhatsAppRecordatorioDirecto('${props.telefono}', '${props.inquilino}', '${props.concepto}', ${props.monto}, '${props.fechaVencimiento}')" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs flex items-center gap-1">
                <i class="fab fa-whatsapp"></i> Avisar por WhatsApp
            </button>` : ''}
        `;
    } else if (props.tipo === 'aumento') {
        title.innerHTML = `<span class="text-emerald-600">📈 Aumento Programado</span>`;
        body.innerHTML = `
            <p><strong>Inquilino:</strong> ${AppUtils.escapeHtml(props.inquilino)}</p>
            <p><strong>Inmueble:</strong> ${AppUtils.escapeHtml(props.propiedad)}</p>
            <p><strong>Renta Actual:</strong> ${AppUtils.formatCurrency(props.montoActual)}</p>
            <p><strong>Tipo de Índice:</strong> ${props.tipoAumento.toUpperCase()} (+${props.porcentaje}%)</p>
            <p><strong>Fecha de Aplicación:</strong> ${AppUtils.formatDate(props.fecha)}</p>
        `;

        actions.innerHTML = `
            <button onclick="cerrarDetalleEvento()" class="px-3 py-1.5 border rounded-lg hover:bg-slate-50 text-xs">Cerrar</button>
            <a href="/contracts.html" class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs">Ver en Contratos</a>
        `;
    } else {
        title.innerHTML = `<span class="text-blue-600">📄 Finalización de Contrato</span>`;
        body.innerHTML = `
            <p><strong>Inquilino:</strong> ${AppUtils.escapeHtml(props.inquilino)}</p>
            <p><strong>Inmueble:</strong> ${AppUtils.escapeHtml(props.propiedad)}</p>
            <p><strong>Fecha de Vencimiento:</strong> ${AppUtils.formatDate(props.fechaFin)}</p>
            <p><strong>Días Restantes:</strong> ${props.diasRestantes} días</p>
        `;

        actions.innerHTML = `
            <button onclick="cerrarDetalleEvento()" class="px-3 py-1.5 border rounded-lg hover:bg-slate-50 text-xs">Cerrar</button>
            <a href="/contracts.html" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs">Gestionar Renovación</a>
        `;
    }

    modal.classList.remove('hidden');
}

function cerrarDetalleEvento() {
    const modal = document.getElementById('calendarEventModal');
    if (modal) modal.classList.add('hidden');
}

// ============================================
// WHATSAPP DESDE EL CALENDARIO
// ============================================

function enviarWhatsAppRecordatorioDirecto(telefono, inquilino, concepto, monto, fecha) {
    let clean = telefono.replace(/\D/g, '');
    if (clean.length === 10) clean = '549' + clean;
    else if (clean.startsWith('54') && !clean.startsWith('549')) clean = '549' + clean.substring(2);

    const msg = 
`Hola ${inquilino}, te escribimos desde la administración para recordarte el vencimiento de *${concepto}* por un importe de *${AppUtils.formatCurrency(monto)}* el día *${AppUtils.formatDate(fecha)}*.
Por favor, envíanos el comprobante una vez realizada la transferencia. ¡Muchas gracias!`;

    window.open(`https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(msg)}`, '_blank');
}

// ============================================
// RESUMEN MENSUAL SEGURO (SIN RUPTURA DE URL)
// ============================================

function abrirResumenRecordatoriosMes() {
    const hoy = new Date();
    const mesActualStr = hoy.toISOString().slice(0, 7);
    const nombreMes = hoy.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

    const eventosDelMes = calendarEvents.filter(e => e.start.startsWith(mesActualStr));

    if (eventosDelMes.length === 0) {
        UI.toast('No hay eventos registrados para el mes en curso.', 'info');
        return;
    }

    let pagosVencidos = 0;
    let pagosProximos = 0;
    let aumentos = 0;

    eventosDelMes.forEach(e => {
        if (e.extendedProps?.tipo === 'pago') {
            if (e.extendedProps.subtipo === 'vencido') pagosVencidos++;
            else pagosProximos++;
        } else if (e.extendedProps?.tipo === 'aumento') {
            aumentos++;
        }
    });

    const resumenTexto = 
`📅 *RESUMEN DE ALQUILERES - ${nombreMes.toUpperCase()}*
---------------------------------------------
⚠️ Pagos Vencidos: ${pagosVencidos}
⏳ Pagos Próximos: ${pagosProximos}
📈 Aumentos Programados: ${aumentos}
Total de Eventos: ${eventosDelMes.length}
---------------------------------------------
_Tenant CRM - Panel de Notificaciones_`;

    // Modal de confirmación para compartir
    if (confirm(`Resumen del mes (${nombreMes}):\n\n- ${pagosVencidos} pagos vencidos\n- ${pagosProximos} pagos por vencer\n- ${aumentos} aumentos programados\n\n¿Deseas abrir WhatsApp para compartir este reporte interno?`)) {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(resumenTexto)}`, '_blank');
    }
}

// Exponer funciones globales
window.cerrarDetalleEvento = cerrarDetalleEvento;
window.enviarWhatsAppRecordatorioDirecto = enviarWhatsAppRecordatorioDirecto;