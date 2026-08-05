// calendar.js - Calendario de eventos (FullCalendar) con formato día/mes/año – CORREGIDO
let calendar = null;
let calendarEvents = [];

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📅 Página de calendario cargada');

    const token = sessionStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    AppSidebar.init();
    await cargarEventos();

    document.getElementById('todayBtn').addEventListener('click', () => {
        if (calendar) calendar.today();
    });

    document.getElementById('refreshBtn').addEventListener('click', async () => {
        await cargarEventos();
        UI.toast('Calendario actualizado', 'success');
    });

    document.getElementById('sendCalendarRemindersBtn').addEventListener('click', function() {
        if (!calendarEvents || calendarEvents.length === 0) {
            UI.toast('No hay eventos para enviar', 'warning');
            return;
        }
        enviarRecordatoriosCalendario();
    });
});

async function cargarEventos() {
    try {
        const token = sessionStorage.getItem('authToken');

        const [payments, contracts] = await Promise.all([
            fetch('/.netlify/functions/payments', {
                headers: { 'Authorization': token }
            }).then(r => r.ok ? r.json() : []).catch(() => []),
            fetch('/.netlify/functions/contracts', {
                headers: { 'Authorization': token }
            }).then(r => r.ok ? r.json() : []).catch(() => [])
        ]);

        console.log('📦 Pagos cargados:', payments.length);
        console.log('📦 Contratos cargados:', contracts.length);

        calendarEvents = generarEventos(payments || [], contracts || []);
        inicializarCalendario();

    } catch (error) {
        console.error('Error cargando eventos:', error);
        UI.toast('Error al cargar eventos', 'error');
        calendarEvents = [];
    }
}

function generarEventos(payments, contracts) {
    const events = [];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 1. Pagos pendientes
    payments.forEach(p => {
        if (p.status === 'pending' && p.due_date) {
            const dueDate = new Date(p.due_date);
            const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            const isOverdue = diffDays < 0;

            let color = '#f59e0b';
            let titlePrefix = '⏳ Pago próximo';

            if (isOverdue) {
                color = '#ef4444';
                titlePrefix = '⚠️ Pago vencido';
            } else if (diffDays <= 7) {
                color = '#f59e0b';
                titlePrefix = '⏳ Pago próximo';
            } else {
                return;
            }

            const tenantName = p.tenant_name || 'Contrato #' + p.contract_id;
            const amount = parseFloat(p.total_amount || p.amount || 0);

            events.push({
                id: `payment-${p.id}`,
                title: `${titlePrefix}: ${tenantName} - ${AppUtils.formatCurrency(amount)}`,
                start: p.due_date,
                allDay: true,
                backgroundColor: color,
                borderColor: color,
                textColor: '#ffffff',
                extendedProps: {
                    type: 'payment',
                    status: isOverdue ? 'overdue' : 'upcoming',
                    contract_id: p.contract_id,
                    tenant: tenantName,
                    amount: amount,
                    due_date: p.due_date
                }
            });
        }
    });

    // 2. Contratos por vencer (30 días)
    contracts.forEach(c => {
        if (c.status === 'active' && c.end_date) {
            const endDate = new Date(c.end_date);
            const diffDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
            if (diffDays > 0 && diffDays <= 30) {
                const tenantName = c.tenant_name || 'Contrato #' + c.id;
                events.push({
                    id: `contract-end-${c.id}`,
                    title: `📄 Contrato vence: ${tenantName}`,
                    start: c.end_date,
                    allDay: true,
                    backgroundColor: '#3b82f6',
                    borderColor: '#3b82f6',
                    textColor: '#ffffff',
                    extendedProps: {
                        type: 'contract_end',
                        contract_id: c.id,
                        tenant: tenantName,
                        days_left: diffDays
                    }
                });
            }
        }
    });

    // 3. Próximos aumentos (60 días)
    contracts.forEach(c => {
        if (c.next_increase_date) {
            const increaseDate = new Date(c.next_increase_date);
            const diffDays = Math.ceil((increaseDate - today) / (1000 * 60 * 60 * 24));
            if (diffDays > 0 && diffDays <= 60) {
                const tenantName = c.tenant_name || 'Contrato #' + c.id;
                const amount = parseFloat(c.base_amount || 0);
                const newAmount = amount * (1 + (parseFloat(c.increase_value || 0) / 100));
                events.push({
                    id: `increase-${c.id}`,
                    title: `📈 Aumento: ${tenantName} → ${AppUtils.formatCurrency(newAmount)}`,
                    start: c.next_increase_date,
                    allDay: true,
                    backgroundColor: '#22c55e',
                    borderColor: '#22c55e',
                    textColor: '#ffffff',
                    extendedProps: {
                        type: 'increase',
                        contract_id: c.id,
                        tenant: tenantName,
                        current_amount: amount,
                        new_amount: newAmount,
                        percentage: c.increase_value || 0,
                        days_left: diffDays
                    }
                });
            }
        }
    });

    return events;
}
function inicializarCalendario() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    if (calendar) {
        calendar.destroy();
        calendar = null;
    }

    // ===== CONFIGURACIÓN CON FORMATO DÍA/MES/AÑO =====
    calendar = new FullCalendar.Calendar(calendarEl, {
        // ===== IDIOMA ESPAÑOL =====
        locale: 'es',
        initialView: 'dayGridMonth',
        
        // ===== BARRA DE HERRAMIENTAS =====
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek,listWeek'
        },
        
        // ===== TEXTO DE LOS BOTONES EN ESPAÑOL =====
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            list: 'Lista'
        },
        
        // ===== FORMATO DE FECHAS DÍA/MES/AÑO =====
        titleFormat: { year: 'numeric', month: 'long' }, // "Agosto 2025"
        
        // ===== CONFIGURACIÓN POR VISTA =====
        views: {
            dayGridMonth: {
                titleFormat: { year: 'numeric', month: 'long' } // "Agosto 2025"
            },
            dayGridWeek: {
                titleFormat: { year: 'numeric', month: 'long', day: 'numeric' } // "Agosto 2025"
            },
            listWeek: {
                titleFormat: { year: 'numeric', month: 'long', day: 'numeric' } // "Agosto 2025"
            }
        },
        
        // ===== MOSTRAR DÍA SIN FORMATO ADICIONAL =====
        dayCellContent: function(info) {
            return info.date.getDate();
        },
        
        // ===== EVENTOS DEL CALENDARIO =====
        events: calendarEvents,
        
        // ===== TOOLTIP AL PASAR EL MOUSE =====
        eventDidMount: function(info) {
            const tooltip = document.createElement('div');
            tooltip.className = 'calendar-tooltip absolute bg-gray-900 text-white text-xs rounded-lg p-2 z-50 shadow-lg max-w-xs pointer-events-none hidden';
            tooltip.id = `tooltip-${info.event.id}`;

            const props = info.event.extendedProps;
            let tooltipText = info.event.title;

            if (props.type === 'payment') {
                const statusText = props.status === 'overdue' ? '⚠️ Vencido' : '⏳ Próximo';
                tooltipText = `
                    <strong>${statusText}</strong><br>
                    Inquilino: ${props.tenant}<br>
                    Monto: ${AppUtils.formatCurrency(props.amount)}<br>
                    Vence: ${AppUtils.formatDate(props.due_date)}
                `;
            } else if (props.type === 'contract_end') {
                tooltipText = `
                    <strong>📄 Contrato por vencer</strong><br>
                    Inquilino: ${props.tenant}<br>
                    Días restantes: ${props.days_left}
                `;
            } else if (props.type === 'increase') {
                tooltipText = `
                    <strong>📈 Aumento programado</strong><br>
                    Inquilino: ${props.tenant}<br>
                    Actual: ${AppUtils.formatCurrency(props.current_amount)}<br>
                    Nuevo: ${AppUtils.formatCurrency(props.new_amount)}<br>
                    Incremento: ${props.percentage}%
                `;
            }

            tooltip.innerHTML = tooltipText;
            document.body.appendChild(tooltip);

            info.el.addEventListener('mouseenter', function(e) {
                const rect = info.el.getBoundingClientRect();
                const tooltipEl = document.getElementById(`tooltip-${info.event.id}`);
                if (tooltipEl) {
                    tooltipEl.classList.remove('hidden');
                    tooltipEl.style.top = (rect.top - 60) + 'px';
                    tooltipEl.style.left = (rect.left + rect.width / 2 - 100) + 'px';
                }
            });

            info.el.addEventListener('mouseleave', function() {
                const tooltipEl = document.getElementById(`tooltip-${info.event.id}`);
                if (tooltipEl) tooltipEl.classList.add('hidden');
            });

            info.el.addEventListener('click', function() {
                const props = info.event.extendedProps;
                if (props.type === 'payment') {
                    window.location.href = '/payments.html';
                } else if (props.type === 'contract_end' || props.type === 'increase') {
                    window.location.href = '/contracts.html';
                }
            });
        },
        
        // ===== FORMATO DE HORA =====
        eventTimeFormat: {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        },
        
        // ===== TAMAÑO Y ASPECTO =====
        height: 'auto',
        contentHeight: 'auto',
        aspectRatio: 1.5,
        
        // ===== AL INICIAR LA VISTA =====
        viewDidMount: function() {
            aplicarModoOscuroCalendario();
        }
    });

    // ===== RENDERIZAR CALENDARIO =====
    calendar.render();

    // ===== OBSERVADOR PARA MODO OSCURO =====
    const observer = new MutationObserver(() => {
        aplicarModoOscuroCalendario();
    });
    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
    });

    console.log('✅ Calendario inicializado correctamente en español con formato día/mes/año');
}
function aplicarModoOscuroCalendario() {
    const isDark = document.body.classList.contains('dark');
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    if (isDark) {
        calendarEl.style.setProperty('--fc-border-color', '#334155');
        calendarEl.style.setProperty('--fc-neutral-bg-color', '#1e293b');
        calendarEl.style.setProperty('--fc-page-bg-color', '#1e293b');
        calendarEl.style.setProperty('--fc-button-bg-color', '#334155');
        calendarEl.style.setProperty('--fc-button-border-color', '#475569');
        calendarEl.style.setProperty('--fc-button-hover-bg-color', '#475569');
        calendarEl.style.setProperty('--fc-button-text-color', '#e2e8f0');
        calendarEl.style.setProperty('--fc-today-bg-color', 'rgba(99, 102, 241, 0.2)');
        calendarEl.style.setProperty('--fc-event-bg-color', '#4f46e5');
        calendarEl.style.setProperty('--fc-event-border-color', '#4f46e5');
        calendarEl.style.setProperty('--fc-event-text-color', '#ffffff');
    } else {
        calendarEl.style.setProperty('--fc-border-color', '#e5e7eb');
        calendarEl.style.setProperty('--fc-neutral-bg-color', '#f9fafb');
        calendarEl.style.setProperty('--fc-page-bg-color', '#ffffff');
        calendarEl.style.setProperty('--fc-button-bg-color', '#4f46e5');
        calendarEl.style.setProperty('--fc-button-border-color', '#4f46e5');
        calendarEl.style.setProperty('--fc-button-hover-bg-color', '#4338ca');
        calendarEl.style.setProperty('--fc-button-text-color', '#ffffff');
        calendarEl.style.setProperty('--fc-today-bg-color', 'rgba(99, 102, 241, 0.1)');
        calendarEl.style.setProperty('--fc-event-bg-color', '#4f46e5');
        calendarEl.style.setProperty('--fc-event-border-color', '#4f46e5');
        calendarEl.style.setProperty('--fc-event-text-color', '#ffffff');
    }

    if (calendar) {
        calendar.updateSize();
    }
}

// ============================================
// RECORDATORIOS DEL CALENDARIO
// ============================================

function enviarRecordatoriosCalendario() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const monthName = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    if (!calendarEvents || calendarEvents.length === 0) {
        UI.toast('No hay eventos en el calendario', 'info');
        return;
    }

    const eventosMes = calendarEvents.filter(event => {
        const eventDate = new Date(event.start);
        return eventDate.getMonth() === month && eventDate.getFullYear() === year;
    });

    if (eventosMes.length === 0) {
        UI.toast('No hay eventos en el mes actual', 'info');
        return;
    }

    let body = `📅 RESUMEN DE EVENTOS - ${monthName.toUpperCase()}\n\n`;
    body += `========================================\n`;
    body += `Total de eventos: ${eventosMes.length}\n\n`;

    const payments = eventosMes.filter(e => e.extendedProps?.type === 'payment');
    const contractEnds = eventosMes.filter(e => e.extendedProps?.type === 'contract_end');
    const increases = eventosMes.filter(e => e.extendedProps?.type === 'increase');

    if (payments.length > 0) {
        body += `💳 PAGOS (${payments.length}):\n`;
        payments.forEach(e => {
            const date = new Date(e.start).toLocaleDateString();
            const props = e.extendedProps;
            body += `   - ${date}: ${props.tenant} - ${AppUtils.formatCurrency(props.amount)} (${props.status === 'overdue' ? 'VENCIDO' : 'Próximo'})\n`;
        });
        body += `\n`;
    }

    if (contractEnds.length > 0) {
        body += `📄 CONTRATOS POR VENCER (${contractEnds.length}):\n`;
        contractEnds.forEach(e => {
            const date = new Date(e.start).toLocaleDateString();
            const props = e.extendedProps;
            body += `   - ${date}: ${props.tenant} (${props.days_left} días restantes)\n`;
        });
        body += `\n`;
    }

    if (increases.length > 0) {
        body += `📈 AUMENTOS PROGRAMADOS (${increases.length}):\n`;
        increases.forEach(e => {
            const date = new Date(e.start).toLocaleDateString();
            const props = e.extendedProps;
            body += `   - ${date}: ${props.tenant} - ${AppUtils.formatCurrency(props.current_amount)} → ${AppUtils.formatCurrency(props.new_amount)} (${props.percentage}%)\n`;
        });
        body += `\n`;
    }

    body += `========================================\n`;
    body += `📧 Este es un resumen del calendario de Tenant CRM.\n`;
    body += `💡 Para más detalles, ingresa al sistema.\n`;

    const subject = `📅 Resumen de eventos - ${monthName}`;
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    let mailtoLink;

    if (isMobile) {
        mailtoLink = `intent://mailto:?subject=${encodedSubject}&body=${encodedBody}#Intent;scheme=mailto;package=com.google.android.gm;end`;
    } else {
        mailtoLink = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodedSubject}&body=${encodedBody}`;
    }

    window.open(mailtoLink, '_blank');
    UI.toast('Abriendo correo con el resumen del mes', 'success');
}