// js/settings.js - Configuración del Sistema y Sincronización de Índices
document.addEventListener('DOMContentLoaded', async () => {
    if (window.AppSidebar) AppSidebar.init();
    if (window.Breadcrumbs) Breadcrumbs.init();

    cargarValoresPorDefecto();
    initSettingsEvents();
    initPushNotificationsButton();

    // 1. Cargar índices actuales y 2. Verificar estado real de Neon DB
    await Promise.all([
        cargarIndicesActuales(),
        verificarConexionBaseDeDatos()
    ]);
});

// ============================================
// GESTIÓN DE VALORES POR DEFECTO DEL SISTEMA
// ============================================

function cargarValoresPorDefecto() {
    const emailFromInput = document.getElementById('emailFrom');
    const emailSigInput = document.getElementById('emailSignature');
    const commInput = document.getElementById('defaultCommission');
    const freqInput = document.getElementById('defaultIncreaseFrequency');

    if (emailFromInput) {
        emailFromInput.value = localStorage.getItem('crm_email_from') || 'notificaciones@tenantcrm.com';
        emailFromInput.addEventListener('change', () => {
            localStorage.setItem('crm_email_from', emailFromInput.value.trim());
            UI.toast('Remitente guardado', 'info');
        });
    }

    if (emailSigInput) {
        emailSigInput.value = localStorage.getItem('crm_email_signature') || 'Atentamente,\nEquipo de Gestión Inmobiliaria';
        emailSigInput.addEventListener('change', () => {
            localStorage.setItem('crm_email_signature', emailSigInput.value.trim());
            UI.toast('Firma guardada', 'info');
        });
    }

    if (commInput) {
        commInput.value = localStorage.getItem('crm_default_commission') || '5';
        commInput.addEventListener('change', () => {
            localStorage.setItem('crm_default_commission', commInput.value.trim());
            UI.toast('Comisión por defecto guardada', 'info');
        });
    }

    if (freqInput) {
        freqInput.value = localStorage.getItem('crm_default_frequency') || '12';
        freqInput.addEventListener('change', () => {
            localStorage.setItem('crm_default_frequency', freqInput.value.trim());
            UI.toast('Frecuencia por defecto guardada', 'info');
        });
    }
}

// ============================================
// EVENTOS DE ÍNDICES ECONÓMICOS
// ============================================

function initSettingsEvents() {
    const syncBtn = document.getElementById('sincronizarIndicesBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', sincronizarIndicesConAPI);
    }

    const saveBtn = document.getElementById('guardarIndicesBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', guardarIndicesManualmente);
    }
}

async function cargarIndicesActuales() {
    try {
        const res = await fetch('/.netlify/functions/indices');
        if (!res.ok) return;
        const data = await res.json();

        actualizarCamposIndices(data);
    } catch (e) {
        console.warn('No se pudieron consultar los índices actuales:', e.message);
    }
}

function actualizarCamposIndices(data) {
    const ipcInput = document.getElementById('ipcMensual');
    const ipcFechaInput = document.getElementById('ipcFecha');
    const iclInput = document.getElementById('iclMensual');
    const iclFechaInput = document.getElementById('iclFecha');

    const ipcDisplay = document.getElementById('ipcActualDisplay');
    const iclDisplay = document.getElementById('iclActualDisplay');

    if (ipcInput && data.ipc !== undefined) ipcInput.value = data.ipc;
    if (ipcFechaInput && data.ipcDate) ipcFechaInput.value = data.ipcDate.slice(0, 7); // Formato YYYY-MM
    if (iclInput && data.icl !== undefined) iclInput.value = data.icl;
    if (iclFechaInput && data.iclDate) iclFechaInput.value = data.iclDate.slice(0, 7);

    if (ipcDisplay && data.ipc !== undefined) {
        ipcDisplay.textContent = `${data.ipc}% (${data.ipcDate || 'Actual'})`;
    }
    if (iclDisplay && data.icl !== undefined) {
        iclDisplay.textContent = `${data.icl}% (${data.iclDate || 'Actual'})`;
    }
}

async function sincronizarIndicesConAPI() {
    const syncBtn = document.getElementById('sincronizarIndicesBtn');
    const statusSpan = document.getElementById('indicesStatus');

    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Consultando APIs...';
    }
    if (statusSpan) statusSpan.textContent = 'Sincronizando con INDEC y BCRA...';

    try {
        const res = await fetch('/.netlify/functions/indices?refresh=true');
        if (!res.ok) throw new Error('Error en el servidor de índices');
        const data = await res.json();

        actualizarCamposIndices(data);

        if (statusSpan) {
            statusSpan.className = 'text-sm text-emerald-600 font-medium self-center';
            statusSpan.textContent = '¡Sincronizado con éxito!';
        }
        UI.toast('Índices actualizados desde fuentes oficiales', 'success');
    } catch (err) {
        console.error(err);
        if (statusSpan) {
            statusSpan.className = 'text-sm text-red-500 font-medium self-center';
            statusSpan.textContent = 'Error al consultar API externa.';
        }
        UI.toast('No se pudo conectar a la API externa', 'error');
    } finally {
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Sincronizar con API';
        }
        setTimeout(() => {
            if (statusSpan) statusSpan.textContent = '';
        }, 4000);
    }
}

async function guardarIndicesManualmente() {
    const saveBtn = document.getElementById('guardarIndicesBtn');
    const ipc = parseFloat(document.getElementById('ipcMensual')?.value);
    const ipcDate = document.getElementById('ipcFecha')?.value;
    const icl = parseFloat(document.getElementById('iclMensual')?.value);
    const iclDate = document.getElementById('iclFecha')?.value;

    if (isNaN(ipc) || isNaN(icl) || !ipcDate || !iclDate) {
        UI.toast('Por favor completa los valores y fechas de ambos índices', 'warning');
        return;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';
    }

    try {
        const res = await fetch('/.netlify/functions/indices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ipc, ipcDate, icl, iclDate })
        });

        if (!res.ok) throw new Error('Error al guardar en el servidor');

        UI.toast('Valores de índices guardados en la base de datos', 'success');

        // Actualizar vistas
        const ipcDisplay = document.getElementById('ipcActualDisplay');
        const iclDisplay = document.getElementById('iclActualDisplay');
        if (ipcDisplay) ipcDisplay.textContent = `${ipc}% (${ipcDate})`;
        if (iclDisplay) iclDisplay.textContent = `${icl}% (${iclDate})`;

    } catch (e) {
        console.error(e);
        UI.toast('Error al guardar índices', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Guardar Índices';
        }
    }
}

// ============================================
// VERIFICACIÓN DE ESTADO REAL DE NEON DB
// ============================================

async function verificarConexionBaseDeDatos() {
    const lastSyncEl = document.getElementById('lastSync');
    const statusContainer = lastSyncEl ? lastSyncEl.closest('.bg-gray-50') : null;

    if (!lastSyncEl) return;

    lastSyncEl.textContent = 'Comprobando conexión...';

    const t0 = performance.now();
    try {
        // Hacemos una consulta ligera de sólo lectura
        const res = await fetch('/.netlify/functions/indices');
        const latencia = Math.round(performance.now() - t0);

        if (res.ok) {
            const ahora = new Date();
            const horaStr = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            lastSyncEl.textContent = `Hoy a las ${horaStr} (Latencia: ${latencia} ms)`;

            if (statusContainer) {
                const conBadge = statusContainer.querySelector('.text-green-600');
                if (conBadge) {
                    conBadge.innerHTML = `<i class="fas fa-check-circle text-xs mr-2"></i>Conectado a Neon (${latencia} ms)`;
                }
            }
        } else {
            throw new Error('Respuesta no satisfactoria');
        }
    } catch (e) {
        lastSyncEl.textContent = 'Sin respuesta del servidor';
        if (statusContainer) {
            const conBadge = statusContainer.querySelector('.text-green-600');
            if (conBadge) {
                conBadge.className = 'text-sm text-red-600 font-medium flex items-center';
                conBadge.innerHTML = `<i class="fas fa-exclamation-circle text-xs mr-2"></i>Fallo de conexión`;
            }
        }
    }
}

// ============================================
// NOTIFICACIONES PUSH
// ============================================

function initPushNotificationsButton() {
    const btn = document.getElementById('enableNotificationsBtn');
    const status = document.getElementById('notificationStatus');

    if (!btn) return;

    if (!('Notification' in window)) {
        btn.style.display = 'none';
        if (status) status.textContent = 'Las notificaciones push no son compatibles con este navegador.';
        return;
    }

    if (Notification.permission === 'granted') {
        btn.disabled = true;
        btn.className = 'bg-slate-200 text-slate-600 px-4 py-2 rounded-lg cursor-default';
        btn.innerHTML = '<i class="fas fa-check mr-2"></i>Notificaciones activadas';
        if (status) status.innerHTML = '<span class="text-emerald-600 font-medium">Recibirás avisos de vencimientos en este dispositivo.</span>';
    } else {
        btn.addEventListener('click', async () => {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
                btn.disabled = true;
                btn.className = 'bg-slate-200 text-slate-600 px-4 py-2 rounded-lg cursor-default';
                btn.innerHTML = '<i class="fas fa-check mr-2"></i>Notificaciones activadas';
                if (status) status.innerHTML = '<span class="text-emerald-600 font-medium">¡Notificaciones activadas con éxito!</span>';
                UI.toast('Notificaciones habilitadas', 'success');
            } else {
                UI.toast('Permiso de notificaciones denegado', 'warning');
            }
        });
    }
}