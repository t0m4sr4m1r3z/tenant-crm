// pwa.js - Manejo de PWA (Progressive Web App)
// NOTA: deferredPrompt ya está declarado en auth.js

// Registrar Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker registrado correctamente');
                console.log('Scope:', registration.scope);
                
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('🔄 Nueva versión del Service Worker instalando...');
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            if (window.UI) {
                                UI.toast('Nueva versión disponible. Recarga la página para actualizar.', 'info', 10000);
                            }
                        }
                    });
                });
            })
            .catch(error => {
                console.error('❌ Error registrando Service Worker:', error);
            });
    });
}

// Detectar cambios en la conexión
window.addEventListener('online', () => {
    console.log('📶 Conexión restablecida');
    if (window.UI) {
        UI.toast('Conexión restablecida. Los datos se sincronizarán automáticamente.', 'success');
    }
});

window.addEventListener('offline', () => {
    console.log('📴 Sin conexión - Modo offline activado');
    if (window.UI) {
        UI.toast('Modo offline activado. Los cambios se guardarán localmente.', 'warning');
    }
});

// Verificar si la app está instalada
window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    if (e.matches) {
        console.log('App instalada ejecutándose');
        const installBtn = document.getElementById('installPwaBtn');
        if (installBtn) installBtn.remove();
    }
});

console.log('✅ PWA inicializada correctamente');