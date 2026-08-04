// settings.js - Gestión de configuración – CORREGIDO
document.addEventListener('DOMContentLoaded', () => {
    if (!window.AUTH) {
        console.error('Auth module not loaded');
        return;
    }
    
    const user = window.AUTH.getCurrentUser();
    if (!user) return;
    
    // Usar AppSidebar en lugar de initSidebar local
    if (window.AppSidebar) {
        AppSidebar.init();
    }
    
    loadSettings();
    initSettingsForm();
    initIndicesPanel();
    initNotificationsConfig();
});

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
        if (window.UI) UI.toast('Por favor ingresa valores válidos', 'error');
        return;
    }
    
    if (window.guardarIndices) {
        window.guardarIndices(ipc, icl, ipcFecha, iclFecha);
    } else {
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
    
    if (window.UI) UI.toast(`IPC: ${ipc}% / ICL: ${icl}% guardados`, 'success');
    
    cargarIndicesActuales();
    if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('indicesActualizados'));
    }
}

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
            const token = sessionStorage.getItem('authToken');
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
            if (window.UI) UI.toast('Índices sincronizados correctamente', 'success');
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
        if (window.UI) UI.toast('Error al sincronizar con API', 'error');
    }
    
    await cargarIndicesActuales();
}

function initIndicesPanel() {
    const guardarBtn = document.getElementById('guardarIndicesBtn');
    const sincronizarBtn = document.getElementById('sincronizarIndicesBtn');
    
    if (guardarBtn) {
        guardarBtn.removeEventListener('click', guardarIndicesManuales);
        guardarBtn.addEventListener('click', guardarIndicesManuales);
    }
    
    if (sincronizarBtn) {
        sincronizarBtn.removeEventListener('click', sincronizarConAPI);
        sincronizarBtn.addEventListener('click', sincronizarConAPI);
    }
    
    window.addEventListener('indicesActualizados', () => {
        cargarIndicesActuales();
    });
    
    cargarIndicesActuales();
}