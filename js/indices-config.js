// indices-config.js - Configuración central de índices

const INDICES_CONFIG = {
    ipc: {
        mensual: 2.0,
        anual: 25.0,
        fecha: '2026-03',
        fuente: 'MANUAL'
    },
    icl: {
        mensual: 2.1,
        fecha: '2026-03',
        fuente: 'MANUAL'
    },
    ultimaActualizacion: new Date().toISOString()
};

// Cargar índices guardados de localStorage
function cargarIndicesGuardados() {
    const saved = localStorage.getItem('indices_globales');
    console.log('📦 Cargando índices guardados:', saved);
    
    if (saved) {
        try {
            const data = JSON.parse(saved);
            INDICES_CONFIG.ipc.mensual = data.ipc?.mensual ?? INDICES_CONFIG.ipc.mensual;
            INDICES_CONFIG.ipc.fecha = data.ipc?.fecha ?? INDICES_CONFIG.ipc.fecha;
            INDICES_CONFIG.icl.mensual = data.icl?.mensual ?? INDICES_CONFIG.icl.mensual;
            INDICES_CONFIG.icl.fecha = data.icl?.fecha ?? INDICES_CONFIG.icl.fecha;
            INDICES_CONFIG.ultimaActualizacion = data.actualizado ?? new Date().toISOString();
            console.log('✅ Índices cargados desde localStorage:', INDICES_CONFIG);
            return true;
        } catch (e) {
            console.error('Error parsing saved indices:', e);
        }
    }
    return false;
}

// Guardar índices manuales
function guardarIndices(ipc, icl, ipcFecha, iclFecha) {
    INDICES_CONFIG.ipc.mensual = ipc;
    INDICES_CONFIG.icl.mensual = icl;
    INDICES_CONFIG.ipc.fecha = ipcFecha;
    INDICES_CONFIG.icl.fecha = iclFecha;
    INDICES_CONFIG.ultimaActualizacion = new Date().toISOString();
    
    const data = {
        ipc: { mensual: ipc, fecha: ipcFecha },
        icl: { mensual: icl, fecha: iclFecha },
        actualizado: INDICES_CONFIG.ultimaActualizacion
    };
    
    localStorage.setItem('indices_globales', JSON.stringify(data));
    console.log('✅ Índices guardados en localStorage:', data);
    
    // Disparar evento para actualizar otros componentes
    window.dispatchEvent(new CustomEvent('indicesActualizados', { detail: INDICES_CONFIG }));
}

// Obtener índices actuales
function getIndices() {
    return {
        ipc: INDICES_CONFIG.ipc.mensual,
        icl: INDICES_CONFIG.icl.mensual,
        ipcFecha: INDICES_CONFIG.ipc.fecha,
        iclFecha: INDICES_CONFIG.icl.fecha,
        fuente: INDICES_CONFIG.ipc.fuente,
        ultimaActualizacion: INDICES_CONFIG.ultimaActualizacion
    };
}

// Sincronizar con API (para obtener datos oficiales)
async function sincronizarConAPI() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/.netlify/functions/indices', {
            headers: { 'Authorization': token }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.ipc) {
                INDICES_CONFIG.ipc.mensual = data.ipc.monthly;
                INDICES_CONFIG.ipc.fecha = data.ipc.date;
                INDICES_CONFIG.ipc.fuente = data.ipc.source;
            }
            if (data.icl) {
                INDICES_CONFIG.icl.mensual = data.icl.monthly;
                INDICES_CONFIG.icl.fecha = data.icl.date;
                INDICES_CONFIG.icl.fuente = data.icl.source;
            }
            
            guardarIndices(
                INDICES_CONFIG.ipc.mensual,
                INDICES_CONFIG.icl.mensual,
                INDICES_CONFIG.ipc.fecha,
                INDICES_CONFIG.icl.fecha
            );
            
            return true;
        }
    } catch (error) {
        console.error('Error sincronizando con API:', error);
    }
    return false;
}

// Inicializar - CARGAR ÍNDICES PRIMERO
cargarIndicesGuardados();

// Exportar para uso global
window.INDICES_CONFIG = INDICES_CONFIG;
window.getIndices = getIndices;
window.guardarIndices = guardarIndices;
window.sincronizarConAPI = sincronizarConAPI;

console.log('✅ Configuración de índices cargada. IPC:', INDICES_CONFIG.ipc.mensual, '% | ICL:', INDICES_CONFIG.icl.mensual, '%');