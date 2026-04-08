// indices-config.js - Configuración central de índices
// Cambia estos valores cuando sea necesario

const INDICES_CONFIG = {
    ipc: {
        mensual: 2.0,      // IPC mensual en %
        anual: 25.0,       // IPC anual en %
        fecha: '2026-03'
    },
    icl: {
        mensual: 2.1,      // ICL mensual en %
        fecha: '2026-03'
    }
};

// Función para actualizar los valores (se puede llamar desde cualquier lugar)
function actualizarIndicesGlobales(ipc, icl) {
    INDICES_CONFIG.ipc.mensual = ipc;
    INDICES_CONFIG.icl.mensual = icl;
    INDICES_CONFIG.ipc.fecha = new Date().toISOString().split('T')[0];
    INDICES_CONFIG.icl.fecha = new Date().toISOString().split('T')[0];
    
    console.log('📊 Índices actualizados:', INDICES_CONFIG);
    
    // Guardar en localStorage
    localStorage.setItem('indices_globales', JSON.stringify(INDICES_CONFIG));
}

// Cargar valores guardados
function cargarIndicesGuardados() {
    const saved = localStorage.getItem('indices_globales');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            INDICES_CONFIG.ipc.mensual = data.ipc.mensual;
            INDICES_CONFIG.icl.mensual = data.icl.mensual;
            INDICES_CONFIG.ipc.fecha = data.ipc.fecha;
            INDICES_CONFIG.icl.fecha = data.icl.fecha;
            console.log('📊 Índices cargados desde localStorage:', INDICES_CONFIG);
        } catch (e) {
            console.error('Error cargando índices:', e);
        }
    }
}

// Obtener valores actuales
function getIndices() {
    return {
        ipc: INDICES_CONFIG.ipc.mensual,
        icl: INDICES_CONFIG.icl.mensual,
        ipcAnual: INDICES_CONFIG.ipc.anual,
        fecha: INDICES_CONFIG.ipc.fecha
    };
}

// Cargar al inicio
cargarIndicesGuardados();

// Exportar para uso global
window.INDICES_CONFIG = INDICES_CONFIG;
window.actualizarIndicesGlobales = actualizarIndicesGlobales;
window.getIndices = getIndices;

console.log('✅ Configuración de índices cargada. IPC:', INDICES_CONFIG.ipc.mensual, '% | ICL:', INDICES_CONFIG.icl.mensual, '%');