// notifications.js - Sistema de notificaciones
const Notifications = {
    // Elementos del DOM
    btn: document.getElementById('notificationsBtn'),
    panel: null,
    badge: null,
    
    // Estado
    isOpen: false,
    notifications: [],
    unreadCount: 0,
    
    init() {
        this.btn = document.getElementById('notificationsBtn');
        if (!this.btn) return;
        
        // Crear el panel de notificaciones
        this.createPanel();
        
        // Crear el badge si no existe
        this.badge = this.btn.querySelector('.notification-badge');
        if (!this.badge) {
            this.badge = document.createElement('span');
            this.badge.className = 'notification-badge absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center hidden';
            this.btn.appendChild(this.badge);
        }
        
        // Event listeners
        this.btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        
        // Cerrar al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.panel.contains(e.target) && e.target !== this.btn) {
                this.close();
            }
        });
        
        // Cargar notificaciones iniciales
        this.loadNotifications();
        
        // Actualizar cada 30 segundos
        setInterval(() => this.loadNotifications(), 30000);
    },
    
    createPanel() {
        this.panel = document.createElement('div');
        this.panel.className = 'notifications-panel fixed right-4 top-16 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 hidden overflow-hidden';
        this.panel.innerHTML = `
            <div class="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-white flex justify-between items-center">
                <h3 class="font-semibold">Notificaciones</h3>
                <button class="mark-all-read text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition">
                    Marcar todas como leídas
                </button>
            </div>
            <div class="notifications-list max-h-96 overflow-y-auto">
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-bell-slash text-3xl mb-2 opacity-50"></i>
                    <p>Cargando notificaciones...</p>
                </div>
            </div>
            <div class="border-t px-4 py-2 text-xs text-gray-500 flex justify-between">
                <span>Actualizado hace un momento</span>
                <a href="#" class="text-blue-600 hover:text-blue-800">Ver todas</a>
            </div>
        `;
        
        document.body.appendChild(this.panel);
        
        // Evento para marcar todas como leídas
        this.panel.querySelector('.mark-all-read').addEventListener('click', (e) => {
            e.preventDefault();
            this.markAllAsRead();
        });
    },
    
    async loadNotifications() {
        try {
            const token = localStorage.getItem('authToken');
            
            // Cargar datos necesarios para generar notificaciones
            const [contracts, payments] = await Promise.all([
                fetch('/.netlify/functions/contracts', {
                    headers: { 'Authorization': token }
                }).then(r => r.json()),
                fetch('/.netlify/functions/payments', {
                    headers: { 'Authorization': token }
                }).then(r => r.json())
            ]);
            
            // Generar notificaciones basadas en los datos
            this.generateNotifications(contracts || [], payments || []);
            
        } catch (error) {
            console.error('Error cargando notificaciones:', error);
        }
    },
    
    generateNotifications(contracts, payments) {
        const notifications = [];
        const today = new Date();
        
        // 1. Pagos vencidos
        payments.filter(p => p.status === 'pending').forEach(p => {
            const dueDate = new Date(p.due_date);
            if (dueDate < today) {
                const daysOverdue = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24));
                notifications.push({
                    id: `payment-${p.id}`,
                    type: 'danger',
                    icon: 'exclamation-triangle',
                    title: 'Pago vencido',
                    message: `Contrato #${p.contract_id} - Vence hace ${daysOverdue} días`,
                    time: dueDate,
                    read: false,
                    link: '/payments.html'
                });
            }
        });
        
        // 2. Próximos pagos (7 días)
        payments.filter(p => p.status === 'pending').forEach(p => {
            const dueDate = new Date(p.due_date);
            const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            if (daysUntil > 0 && daysUntil <= 7) {
                notifications.push({
                    id: `upcoming-${p.id}`,
                    type: 'warning',
                    icon: 'clock',
                    title: 'Pago próximo',
                    message: `Contrato #${p.contract_id} - Vence en ${daysUntil} días`,
                    time: dueDate,
                    read: false,
                    link: '/payments.html'
                });
            }
        });
        
        // 3. Contratos por vencer (30 días)
        contracts.filter(c => c.status === 'active').forEach(c => {
            if (c.end_date) {
                const endDate = new Date(c.end_date);
                const daysUntil = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
                if (daysUntil > 0 && daysUntil <= 30) {
                    notifications.push({
                        id: `contract-${c.id}`,
                        type: 'info',
                        icon: 'file-contract',
                        title: 'Contrato por vencer',
                        message: `${c.tenant_name || 'Inquilino'} - Vence en ${daysUntil} días`,
                        time: endDate,
                        read: false,
                        link: '/contracts.html'
                    });
                }
            }
        });
        
        // 4. Próximos aumentos (15 días)
        contracts.filter(c => c.next_increase_date).forEach(c => {
            const increaseDate = new Date(c.next_increase_date);
            const daysUntil = Math.ceil((increaseDate - today) / (1000 * 60 * 60 * 24));
            if (daysUntil > 0 && daysUntil <= 15) {
                notifications.push({
                    id: `increase-${c.id}`,
                    type: 'success',
                    icon: 'chart-line',
                    title: 'Próximo aumento',
                    message: `${c.tenant_name || 'Inquilino'} - En ${daysUntil} días`,
                    time: increaseDate,
                    read: false,
                    link: '/contracts.html'
                });
            }
        });
        
        // Ordenar por fecha (más reciente primero)
        notifications.sort((a, b) => a.time - b.time);
        
        this.notifications = notifications;
        this.unreadCount = notifications.length;
        this.updateBadge();
        this.renderNotifications();
        
        // Actualizar hora en el footer
        const footer = this.panel.querySelector('.border-t span');
        if (footer) {
            footer.textContent = `Actualizado ${new Date().toLocaleTimeString()}`;
        }
    },
    
    renderNotifications() {
        const list = this.panel.querySelector('.notifications-list');
        
        if (this.notifications.length === 0) {
            list.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-bell-slash text-3xl mb-2 opacity-50"></i>
                    <p>No hay notificaciones</p>
                    <p class="text-xs mt-1">Todo está al día</p>
                </div>
            `;
            return;
        }
        
        list.innerHTML = this.notifications.map(n => {
            const timeAgo = this.getTimeAgo(n.time);
            const bgColor = {
                danger: 'bg-red-50 border-red-200',
                warning: 'bg-yellow-50 border-yellow-200',
                info: 'bg-blue-50 border-blue-200',
                success: 'bg-green-50 border-green-200'
            }[n.type] || 'bg-gray-50';
            
            const iconColor = {
                danger: 'text-red-500',
                warning: 'text-yellow-500',
                info: 'text-blue-500',
                success: 'text-green-500'
            }[n.type] || 'text-gray-500';
            
            return `
                <div class="notification-item ${bgColor} border-b p-3 hover:bg-opacity-75 transition cursor-pointer" data-link="${n.link}">
                    <div class="flex gap-3">
                        <div class="${iconColor}">
                            <i class="fas fa-${n.icon}"></i>
                        </div>
                        <div class="flex-1">
                            <p class="font-medium text-sm">${n.title}</p>
                            <p class="text-xs text-gray-600">${n.message}</p>
                            <p class="text-xs text-gray-400 mt-1">${timeAgo}</p>
                        </div>
                        ${!n.read ? '<span class="w-2 h-2 bg-blue-600 rounded-full"></span>' : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // Agregar evento click a cada notificación
        list.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', () => {
                const link = item.dataset.link;
                if (link) window.location.href = link;
            });
        });
    },
    
    updateBadge() {
        if (!this.badge) return;
        
        if (this.unreadCount > 0) {
            this.badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
            this.badge.classList.remove('hidden');
        } else {
            this.badge.classList.add('hidden');
        }
    },
    
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    },
    
    open() {
        this.panel.classList.remove('hidden');
        this.isOpen = true;
        
        // Pequeña animación
        this.panel.style.transform = 'translateY(-10px)';
        this.panel.style.opacity = '0';
        setTimeout(() => {
            this.panel.style.transform = 'translateY(0)';
            this.panel.style.opacity = '1';
        }, 10);
    },
    
    close() {
        this.panel.style.transform = 'translateY(-10px)';
        this.panel.style.opacity = '0';
        setTimeout(() => {
            this.panel.classList.add('hidden');
            this.isOpen = false;
        }, 200);
    },
    
    markAllAsRead() {
        this.notifications.forEach(n => n.read = true);
        this.unreadCount = 0;
        this.updateBadge();
        this.renderNotifications();
        
        // Mostrar mensaje
        if (window.UI) {
            UI.toast('Todas las notificaciones marcadas como leídas', 'success');
        }
    },
    
    getTimeAgo(date) {
        const now = new Date();
        const diffMs = date - now;
        const diffMins = Math.round(diffMs / (1000 * 60));
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0) return `en ${diffDays} días`;
        if (diffHours > 0) return `en ${diffHours} horas`;
        if (diffMins > 0) return `en ${diffMins} minutos`;
        if (diffMins === 0) return 'ahora mismo';
        if (diffMins < 0) return `hace ${Math.abs(diffMins)} minutos`;
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    Notifications.init();
});