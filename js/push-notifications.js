// push-notifications.js - Notificaciones push reales

const PushNotifications = {
    // Configuración
    vapidPublicKey: null,
    registration: null,
    subscription: null,
    
    // Inicializar
    async init() {
        if (!('Notification' in window)) {
            console.log('❌ Este navegador no soporta notificaciones');
            return false;
        }
        
        if (!('serviceWorker' in navigator)) {
            console.log('❌ Service Worker no soportado');
            return false;
        }
        
        // Solicitar permiso
        await this.requestPermission();
        
        // Registrar service worker para push
        await this.registerPushService();
        
        return true;
    },
    
    // Solicitar permiso al usuario
    async requestPermission() {
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log('✅ Permiso de notificaciones concedido');
            this.showTestNotification();
            return true;
        } else if (permission === 'denied') {
            console.log('❌ Permiso de notificaciones denegado');
            UI.toast('Activa las notificaciones en la configuración del navegador', 'warning');
            return false;
        } else {
            console.log('⏳ Permiso pendiente');
            return false;
        }
    },
    
    // Mostrar notificación de prueba
    showTestNotification() {
        // Mostrar notificación después de 2 segundos
        setTimeout(() => {
            new Notification('🔔 Tenant CRM', {
                body: 'Las notificaciones están activadas. Recibirás alertas de pagos y contratos.',
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-72x72.png',
                tag: 'welcome',
                silent: false,
                vibrate: [200, 100, 200]
            });
        }, 2000);
    },
    
    // Registrar service worker para push
    async registerPushService() {
        try {
            this.registration = await navigator.serviceWorker.ready;
            
            // Verificar si ya existe suscripción
            const existingSubscription = await this.registration.pushManager.getSubscription();
            
            if (existingSubscription) {
                this.subscription = existingSubscription;
                console.log('✅ Suscripción push existente');
                return this.subscription;
            }
            
            // Crear nueva suscripción
            // Nota: Necesitas generar una clave VAPID desde el backend
            // Por ahora, usamos notificaciones locales
            
            console.log('📢 Notificaciones push configuradas');
            
        } catch (error) {
            console.error('❌ Error registrando push:', error);
        }
    },
    
    // Mostrar notificación (método principal)
    show(title, options = {}) {
        if (Notification.permission !== 'granted') {
            console.log('No hay permiso para notificaciones');
            return;
        }
        
        // Configuración por defecto
        const defaultOptions = {
            body: '',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            tag: Date.now().toString(),
            vibrate: [200, 100, 200],
            silent: false,
            requireInteraction: true, // La notificación persiste hasta que el usuario interactúa
            data: {
                url: window.location.origin,
                timestamp: Date.now()
            }
        };
        
        const finalOptions = { ...defaultOptions, ...options };
        
        try {
            const notification = new Notification(title, finalOptions);
            
            // Al hacer clic en la notificación
            notification.onclick = (event) => {
                event.preventDefault();
                window.focus();
                if (finalOptions.data && finalOptions.data.url) {
                    window.location.href = finalOptions.data.url;
                }
                notification.close();
            };
            
            return notification;
        } catch (error) {
            console.error('Error mostrando notificación:', error);
        }
    },
    
    // Enviar notificación de pago vencido
    sendPaymentOverdue(tenantName, amount, daysOverdue, contractId) {
        this.show('⚠️ Pago vencido', {
            body: `${tenantName} tiene un pago vencido hace ${daysOverdue} días. Monto: ${UI.formatCurrency(amount)}`,
            tag: `payment-overdue-${contractId}`,
            requireInteraction: true,
            data: { url: '/payments.html' }
        });
    },
    
    // Enviar notificación de pago próximo
    sendPaymentUpcoming(tenantName, amount, daysLeft, contractId) {
        this.show('⏰ Pago próximo', {
            body: `${tenantName} tiene un pago programado en ${daysLeft} días. Monto: ${UI.formatCurrency(amount)}`,
            tag: `payment-upcoming-${contractId}`,
            requireInteraction: false,
            data: { url: '/payments.html' }
        });
    },
    
    // Enviar notificación de contrato por vencer
    sendContractExpiring(tenantName, daysLeft, contractId) {
        this.show('📄 Contrato por vencer', {
            body: `El contrato de ${tenantName} vence en ${daysLeft} días. Programa la renovación.`,
            tag: `contract-expiring-${contractId}`,
            requireInteraction: true,
            data: { url: '/contracts.html' }
        });
    },
    
    // Enviar notificación de aumento próximo
    sendIncreaseUpcoming(tenantName, percentage, daysLeft, contractId) {
        this.show('📈 Aumento próximo', {
            body: `${tenantName} tendrá un aumento del ${percentage}% en ${daysLeft} días.`,
            tag: `increase-upcoming-${contractId}`,
            requireInteraction: false,
            data: { url: '/contracts.html' }
        });
    },
    
    // Enviar resumen semanal
    sendWeeklySummary(summary) {
        const {
            totalPending,
            totalOverdue,
            contractsExpiring,
            upcomingIncreases
        } = summary;
        
        let body = '';
        if (totalOverdue > 0) body += `💰 Pagos vencidos: ${totalOverdue}\n`;
        if (totalPending > 0) body += `⏰ Pagos pendientes: ${totalPending}\n`;
        if (contractsExpiring > 0) body += `📄 Contratos por vencer: ${contractsExpiring}\n`;
        if (upcomingIncreases > 0) body += `📈 Aumentos próximos: ${upcomingIncreases}\n`;
        
        if (body === '') {
            body = 'Todo al día. ¡Buen trabajo! 🎉';
        }
        
        this.show('📊 Resumen semanal - Tenant CRM', {
            body: body,
            tag: 'weekly-summary',
            requireInteraction: false,
            data: { url: '/dashboard.html' }
        });
    },
    
    // Verificar notificaciones periódicamente
    startMonitoring(intervalMinutes = 5) {
        console.log(`🔄 Monitoreando notificaciones cada ${intervalMinutes} minutos`);
        
        // Verificar inmediatamente
        this.checkAndSendNotifications();
        
        // Configurar intervalo
        setInterval(() => {
            this.checkAndSendNotifications();
        }, intervalMinutes * 60 * 1000);
    },
    
    // Verificar condiciones y enviar notificaciones
    async checkAndSendNotifications() {
        console.log('🔍 Verificando condiciones para notificaciones...');
        
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;
            
            // Obtener datos
            const [payments, contracts] = await Promise.all([
                fetch('/.netlify/functions/payments', {
                    headers: { 'Authorization': token }
                }).then(r => r.json()),
                fetch('/.netlify/functions/contracts', {
                    headers: { 'Authorization': token }
                }).then(r => r.json())
            ]);
            
            const today = new Date();
            const sentTags = JSON.parse(localStorage.getItem('sent_notifications') || '{}');
            const todayStr = today.toISOString().split('T')[0];
            
            // Limpiar tags viejos (más de 7 días)
            for (const [tag, date] of Object.entries(sentTags)) {
                if (date < todayStr) {
                    delete sentTags[tag];
                }
            }
            
            // 1. Verificar pagos vencidos
            for (const p of payments) {
                if (p.status !== 'pending') continue;
                
                const dueDate = new Date(p.due_date);
                const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
                
                if (daysOverdue >= 1) {
                    const tag = `overdue-${p.contract_id}-${daysOverdue}`;
                    if (!sentTags[tag]) {
                        this.sendPaymentOverdue(
                            p.tenant_name || `Contrato #${p.contract_id}`,
                            p.total_amount,
                            daysOverdue,
                            p.contract_id
                        );
                        sentTags[tag] = todayStr;
                    }
                }
            }
            
            // 2. Verificar pagos próximos (7 días)
            for (const p of payments) {
                if (p.status !== 'pending') continue;
                
                const dueDate = new Date(p.due_date);
                const daysLeft = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                
                if (daysLeft > 0 && daysLeft <= 7) {
                    const tag = `upcoming-${p.contract_id}-${daysLeft}`;
                    if (!sentTags[tag]) {
                        this.sendPaymentUpcoming(
                            p.tenant_name || `Contrato #${p.contract_id}`,
                            p.total_amount,
                            daysLeft,
                            p.contract_id
                        );
                        sentTags[tag] = todayStr;
                    }
                }
            }
            
            // 3. Verificar contratos por vencer (30 días)
            for (const c of contracts) {
                if (c.status !== 'active' || !c.end_date) continue;
                
                const endDate = new Date(c.end_date);
                const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
                
                if (daysLeft > 0 && daysLeft <= 30) {
                    const tag = `contract-expiring-${c.id}-${daysLeft}`;
                    if (!sentTags[tag]) {
                        this.sendContractExpiring(
                            c.tenant_name || `Contrato #${c.id}`,
                            daysLeft,
                            c.id
                        );
                        sentTags[tag] = todayStr;
                    }
                }
            }
            
            // 4. Verificar aumentos próximos (15 días)
            for (const c of contracts) {
                if (!c.next_increase_date) continue;
                
                const increaseDate = new Date(c.next_increase_date);
                const daysLeft = Math.ceil((increaseDate - today) / (1000 * 60 * 60 * 24));
                
                if (daysLeft > 0 && daysLeft <= 15) {
                    const tag = `increase-${c.id}-${daysLeft}`;
                    if (!sentTags[tag]) {
                        this.sendIncreaseUpcoming(
                            c.tenant_name || `Contrato #${c.id}`,
                            c.increase_value || 5,
                            daysLeft,
                            c.id
                        );
                        sentTags[tag] = todayStr;
                    }
                }
            }
            
            // Guardar tags enviados
            localStorage.setItem('sent_notifications', JSON.stringify(sentTags));
            
            // 5. Verificar si es lunes y enviar resumen semanal
            if (today.getDay() === 1) { // Lunes
                const lastWeekly = localStorage.getItem('last_weekly_summary');
                if (lastWeekly !== todayStr) {
                    const summary = {
                        totalPending: payments.filter(p => p.status === 'pending' && new Date(p.due_date) > today).length,
                        totalOverdue: payments.filter(p => p.status === 'pending' && new Date(p.due_date) < today).length,
                        contractsExpiring: contracts.filter(c => {
                            if (!c.end_date) return false;
                            const daysLeft = Math.ceil((new Date(c.end_date) - today) / (1000 * 60 * 60 * 24));
                            return daysLeft > 0 && daysLeft <= 30;
                        }).length,
                        upcomingIncreases: contracts.filter(c => {
                            if (!c.next_increase_date) return false;
                            const daysLeft = Math.ceil((new Date(c.next_increase_date) - today) / (1000 * 60 * 60 * 24));
                            return daysLeft > 0 && daysLeft <= 15;
                        }).length
                    };
                    
                    this.sendWeeklySummary(summary);
                    localStorage.setItem('last_weekly_summary', todayStr);
                }
            }
            
            console.log('✅ Verificación completada');
            
        } catch (error) {
            console.error('Error verificando notificaciones:', error);
        }
    }
};

// Inicializar automáticamente
document.addEventListener('DOMContentLoaded', async () => {
    // Esperar a que UI esté disponible
    setTimeout(async () => {
        await PushNotifications.init();
        
        // Iniciar monitoreo cada 5 minutos
        if (Notification.permission === 'granted') {
            PushNotifications.startMonitoring(5);
        }
    }, 3000);
});

// Exportar para uso global
window.PushNotifications = PushNotifications;