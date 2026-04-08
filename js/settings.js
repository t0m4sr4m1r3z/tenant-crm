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
// CONFIGURACIÓN DE ÍNDICES ECONÓMICOS
// ============================================

const INDICES_STORAGE_KEY = 'tenant_crm_indices';

// Cargar índices guardados en localStorage
function cargarIndicesGuardados() {
    const saved = localStorage.getItem(INDICES_STORAGE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            const ipcInput = document.getElementById('ipcMensual');
            const ipcFechaInput = document.getElementById('ipcFecha');
            const iclInput = document.getElementById('iclMensual');
            const iclFechaInput = document.getElementById('iclFecha');
            
            if (ipcInput && data.ipc) ipcInput.value = data.ipc.mensual;
            if (ipcFechaInput && data.ipc) ipcFechaInput.value = data.ipc.fecha || '2026-03';
            if (iclInput && data.icl) iclInput.value = data.icl.mensual;
            if (iclFechaInput && data.icl) iclFechaInput.value = data.icl.fecha || '2026-03';
            
            return data;
        } catch (e) {
            console.error('Error parsing saved indices:', e);
        }
    }
    return null;
}

// Guardar índices manuales
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
    
    const indicesData = {
        ipc: { mensual: ipc, fecha: ipcFecha },
        icl: { mensual: icl, fecha: iclFecha },
        actualizado: new Date().toISOString()
    };
    
    localStorage.setItem(INDICES_STORAGE_KEY, JSON.stringify(indicesData));
    window.indicesManuales = indicesData;
    
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
}

// Cargar índices actuales desde la API o localStorage
async function cargarIndicesActuales() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) return;
        
        const response = await fetch('/.netlify/functions/indices', {
            headers: { 'Authorization': token }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            const ipcDisplay = document.getElementById('ipcActualDisplay');
            const iclDisplay = document.getElementById('iclActualDisplay');
            
            if (ipcDisplay && data.ipc) {
                ipcDisplay.textContent = `${data.ipc.monthly}% (${data.ipc.date}) - Fuente: ${data.ipc.source || 'API'}`;
            }
            if (iclDisplay && data.icl) {
                iclDisplay.textContent = `${data.icl.monthly}% (${data.icl.date}) - Fuente: ${data.icl.source || 'API'}`;
            }
            return data;
        }
    } catch (error) {
        console.error('Error cargando índices desde API:', error);
    }
    
    // Fallback a localStorage
    const saved = localStorage.getItem(INDICES_STORAGE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            const ipcDisplay = document.getElementById('ipcActualDisplay');
            const iclDisplay = document.getElementById('iclActualDisplay');
            
            if (ipcDisplay && data.ipc) {
                ipcDisplay.textContent = `${data.ipc.mensual}% (${data.ipc.fecha}) - Fuente: MANUAL`;
            }
            if (iclDisplay && data.icl) {
                iclDisplay.textContent = `${data.icl.mensual}% (${data.icl.fecha}) - Fuente: MANUAL`;
            }
            return data;
        } catch (e) {
            console.error('Error parsing saved indices:', e);
        }
    }
    
    return null;
}

// Sincronizar con API (cargar valores actuales y sobrescribir formulario)
async function sincronizarConAPI() {
    const statusEl = document.getElementById('indicesStatus');
    if (statusEl) {
        statusEl.innerHTML = '<span class="text-blue-600">🔄 Sincronizando con API...</span>';
    }
    
    try {
        const token = localStorage.getItem('authToken');
        if (!token) throw new Error('No autenticado');
        
        const response = await fetch('/.netlify/functions/indices', {
            headers: { 'Authorization': token }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            const ipcInput = document.getElementById('ipcMensual');
            const ipcFechaInput = document.getElementById('ipcFecha');
            const iclInput = document.getElementById('iclMensual');
            const iclFechaInput = document.getElementById('iclFecha');
            
            if (ipcInput && data.ipc) ipcInput.value = data.ipc.monthly;
            if (ipcFechaInput && data.ipc) ipcFechaInput.value = data.ipc.date;
            if (iclInput && data.icl) iclInput.value = data.icl.monthly;
            if (iclFechaInput && data.icl) iclFechaInput.value = data.icl.date;
            
            if (statusEl) {
                statusEl.innerHTML = '<span class="text-green-600">✅ Sincronizado con API</span>';
                setTimeout(() => {
                    if (statusEl) statusEl.innerHTML = '';
                }, 3000);
            }
            
            UI.toast('Índices sincronizados correctamente', 'success');
            await cargarIndicesActuales();
        } else {
            throw new Error('Error en la respuesta');
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
}

// Inicializar panel de índices
function initIndicesPanel() {
    const guardarBtn = document.getElementById('guardarIndicesBtn');
    const sincronizarBtn = document.getElementById('sincronizarIndicesBtn');
    
    if (guardarBtn) {
        guardarBtn.addEventListener('click', guardarIndicesManuales);
    }
    
    if (sincronizarBtn) {
        sincronizarBtn.addEventListener('click', sincronizarConAPI);
    }
    
    // Cargar valores guardados
    cargarIndicesGuardados();
    cargarIndicesActuales();
}