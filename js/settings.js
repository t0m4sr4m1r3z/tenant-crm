// settings.js - Gestión de configuración
document.addEventListener('DOMContentLoaded', () => {
    if (!window.AUTH) {
        console.error('Auth module not loaded');
        return;
    }
    
    const user = window.AUTH.getCurrentUser();
    if (!user) return;
    
    initSidebar();
    loadSettings();
    initSettingsForm();
    initIndicesPanel();
    initNotificationsConfig();
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

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('appSettings')) || {
        emailFrom: 'notificaciones@tenantcrm.com',
        emailSignature: 'Atentamente,\nEquipo de Gestión',
        defaultCommission: 5,
        defaultIncreaseFrequency: 12
    };
    
    const emailFrom = document.getElementById('emailFrom');
    const emailSignature = document.getElementById('emailSignature');
    const defaultCommission = document.getElementById('defaultCommission');
    const defaultIncreaseFrequency = document.getElementById('defaultIncreaseFrequency');
    
    if (emailFrom) emailFrom.value = settings.emailFrom;
    if (emailSignature) emailSignature.value = settings.emailSignature;
    if (defaultCommission) defaultCommission.value = settings.defaultCommission;
    if (defaultIncreaseFrequency) defaultIncreaseFrequency.value = settings.defaultIncreaseFrequency;
    
    const lastSync = document.getElementById('lastSync');
    if (lastSync) lastSync.textContent = new Date().toLocaleString();
}

function initSettingsForm() {
    const inputs = ['emailFrom', 'emailSignature', 'defaultCommission', 'defaultIncreaseFrequency'];
    
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', saveSettings);
            element.addEventListener('keyup', debounce(saveSettings, 500));
        }
    });
}

function saveSettings() {
    const settings = {
        emailFrom: document.getElementById('emailFrom')?.value || '',
        emailSignature: document.getElementById('emailSignature')?.value || '',
        defaultCommission: parseFloat(document.getElementById('defaultCommission')?.value) || 5,
        defaultIncreaseFrequency: parseInt(document.getElementById('defaultIncreaseFrequency')?.value) || 12
    };
    
    localStorage.setItem('appSettings', JSON.stringify(settings));
    console.log('Settings saved:', settings);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
// CONFIGURACIÓN DE NOTIFICACIONES
// ============================================

function initNotificationsConfig() {
    const enableNotificationsBtn = document.getElementById('enableNotificationsBtn');
    if (!enableNotificationsBtn) return;
    
    enableNotificationsBtn.addEventListener('click', async () => {
        const status = document.getElementById('notificationStatus');
        
        if (Notification.permission === 'granted') {
            if (status) status.innerHTML = '<span class="text-green-600">✅ Notificaciones ya están activadas</span>';
            return;
        }
        
        const permission = await Notification.requestPermission();
        
        if (status) {
            if (permission === 'granted') {
                status.innerHTML = '<span class="text-green-600">✅ Notificaciones activadas correctamente</span>';
                new Notification('🔔 Tenant CRM', {
                    body: 'Notificaciones activadas. Recibirás alertas importantes.',
                    icon: '/icons/icon-192x192.png'
                });
            } else {
                status.innerHTML = '<span class="text-red-600">❌ No se pudieron activar las notificaciones</span>';
            }
        }
    });
}

// ============================================
// CONFIGURACIÓN DE ÍNDICES ECONÓMICOS (VERSIÓN CENTRALIZADA)
// ============================================

// Cargar índices actuales al iniciar
async function cargarIndicesActuales() {
    const indices = window.getIndices ? window.getIndices() : { ipc: 2.0, icl: 2.1, ipcFecha: '2026-03', iclFecha: '2026-03' };
    
    const ipcInput = document.getElementById('ipcMensual');
    const ipcFechaInput = document.getElementById('ipcFecha');
    const iclInput = document.getElementById('iclMensual');
    const iclFechaInput = document.getElementById('iclFecha');
    
    if (ipcInput) ipcInput.value = indices.ipc;
    if (ipcFechaInput) ipcFechaInput.value = indices.ipcFecha || '2026-03';
    if (iclInput) iclInput.value = indices.icl;
    if (iclFechaInput) iclFechaInput.value = indices.iclFecha || '2026-03';
    
    const ipcDisplay = document.getElementById('ipcActualDisplay');
    const iclDisplay = document.getElementById('iclActualDisplay');
    const fuente = window.INDICES_CONFIG?.ipc?.fuente || 'MANUAL';
    
    if (ipcDisplay) {
        ipcDisplay.textContent = `${indices.ipc}% (${indices.ipcFecha || '2026-03'}) - Fuente: ${fuente}`;
    }
    if (iclDisplay) {
        iclDisplay.textContent = `${indices.icl}% (${indices.iclFecha || '2026-03'}) - Fuente: ${fuente}`;
    }
}

// Guardar índices manuales usando el sistema central
function guardarIndicesManuales() {
    const ipcInput = document.getElementById('ipcMensual');
    const ipcFechaInput = document.getElementById('ipcFecha');
    const iclInput = document.getElementById('iclMensual');
    const iclFechaInput = document.getElementById('iclFecha');
    
    if (!ipcInput || !iclInput) {
        console.error('No se encontraron los campos de índices');
        return;
    }
    
    const ipc = parseFloat(ipcInput.value);
    const ipcFecha = ipcFechaInput?.value || '2026-03';
    const icl = parseFloat(iclInput.value);
    const iclFecha = iclFechaInput?.value || '2026-03';
    
    if (isNaN(ipc) || isNaN(icl)) {
        UI.toast('Por favor ingresa valores válidos', 'error');
        return;
    }
    
    // Usar la función global de configuración si existe
    if (window.guardarIndices) {
        window.guardarIndices(ipc, icl, ipcFecha, iclFecha);
    } else {
        // Fallback manual
        const indicesData = {
            ipc: { mensual: ipc, fecha: ipcFecha },
            icl: { mensual: icl, fecha: iclFecha },
            actualizado: new Date().toISOString()
        };
        localStorage.setItem('indices_globales', JSON.stringify(indicesData));
    }
    
    const statusEl = document.getElementById('indicesStatus');
    if (statusEl) {
        statusEl.innerHTML = '<span class="text-green-600">✅ Índices guardados correctamente</span>';
        setTimeout(() => {
            statusEl.innerHTML = '';
        }, 3000);
    }
    
    UI.toast(`IPC: ${ipc}% / ICL: ${icl}% guardados`, 'success');
    
    // Actualizar display
    cargarIndicesActuales();
    
    // Disparar evento para actualizar otros componentes
    if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('indicesActualizados'));
    }
}

// Sincronizar con API usando el sistema central
async function sincronizarConAPI() {
    const statusEl = document.getElementById('indicesStatus');
    if (statusEl) {
        statusEl.innerHTML = '<span class="text-blue-600">🔄 Sincronizando con API...</span>';
    }
    
    try {
        let success = false;
        
        if (window.sincronizarConAPI) {
            success = await window.sincronizarConAPI();
        } else {
            // Fallback: llamar directamente a la API
            const token = localStorage.getItem('authToken');
            if (!token) throw new Error('No autenticado');
            
            const response = await fetch('/.netlify/functions/indices', {
                headers: { 'Authorization': token }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (window.guardarIndices && data.ipc && data.icl) {
                    window.guardarIndices(data.ipc.monthly, data.icl.monthly, data.ipc.date, data.icl.date);
                    success = true;
                }
            }
        }
        
        if (success) {
            if (statusEl) {
                statusEl.innerHTML = '<span class="text-green-600">✅ Sincronizado con API</span>';
                setTimeout(() => {
                    if (statusEl) statusEl.innerHTML = '';
                }, 3000);
            }
            UI.toast('Índices sincronizados correctamente', 'success');
        } else {
            throw new Error('Error en la sincronización');
        }
        
    } catch (error) {
        console.error('Error sincronizando:', error);
        if (statusEl) {
            statusEl.innerHTML = '<span class="text-red-600">❌ Error al sincronizar</span>';
            setTimeout(() => {
                if (statusEl) statusEl.innerHTML = '';
            }, 3000);
        }
        UI.toast('Error al sincronizar con API', 'error');
    }
    
    await cargarIndicesActuales();
}

// Inicializar panel de índices
function initIndicesPanel() {
    const guardarBtn = document.getElementById('guardarIndicesBtn');
    const sincronizarBtn = document.getElementById('sincronizarIndicesBtn');
    
    if (guardarBtn) {
        // Remover event listeners anteriores para evitar duplicados
        guardarBtn.removeEventListener('click', guardarIndicesManuales);
        guardarBtn.addEventListener('click', guardarIndicesManuales);
    }
    
    if (sincronizarBtn) {
        sincronizarBtn.removeEventListener('click', sincronizarConAPI);
        sincronizarBtn.addEventListener('click', sincronizarConAPI);
    }
    
    // Escuchar cambios en los índices desde otros componentes
    window.addEventListener('indicesActualizados', () => {
        cargarIndicesActuales();
    });
    
    // Cargar valores guardados
    cargarIndicesActuales();
}