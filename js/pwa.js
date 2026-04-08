// pwa.js - Manejo de PWA (Progressive Web App)

// Registrar Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker registrado correctamente');
                console.log('Scope:', registration.scope);
                
                // Verificar actualizaciones
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('🔄 Nueva versión del Service Worker instalando...');
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Mostrar notificación de actualización disponible
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

// Detectar si la app se puede instalar
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('📱 App instalable detectada');
    e.preventDefault();
    deferredPrompt = e;
    
    // Mostrar botón de instalación después de 2 segundos
    setTimeout(() => {
        showInstallButton();
    }, 2000);
});

function showInstallButton() {
    // Verificar si el botón ya existe
    if (document.getElementById('installPwaBtn')) return;
    
    // Crear botón de instalación flotante
    const installBtn = document.createElement('button');
    installBtn.id = 'installPwaBtn';
    installBtn.innerHTML = '<i class="fas fa-download mr-2"></i> Instalar App';
    installBtn.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-5 py-3 rounded-full shadow-lg hover:bg-blue-700 transition-all z-50 flex items-center gap-2';
    
    // Estilos adicionales
    installBtn.style.fontSize = '14px';
    installBtn.style.fontWeight = '500';
    installBtn.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.2)';
    
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        
        // Mostrar el prompt de instalación
        deferredPrompt.prompt();
        
        // Esperar la respuesta del usuario
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Usuario ${outcome === 'accepted' ? 'aceptó' : 'rechazó'} la instalación`);
        
        // Limpiar el prompt
        deferredPrompt = null;
        
        // Ocultar el botón
        installBtn.remove();
    });
    
    document.body.appendChild(installBtn);
}

// Detectar si la app ya está instalada
window.addEventListener('appinstalled', () => {
    console.log('✅ PWA instalada correctamente');
    const installBtn = document.getElementById('installPwaBtn');
    if (installBtn) installBtn.remove();
    
    if (window.UI) {
        UI.toast('¡Gracias por instalar Tenant CRM! 🎉', 'success');
    }
});

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

// Verificar si la app está instalada (para esconder el botón si ya está instalada)
window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    if (e.matches) {
        console.log('App instalada ejecutándose');
        const installBtn = document.getElementById('installPwaBtn');
        if (installBtn) installBtn.remove();
    }
});

console.log('✅ PWA inicializada correctamente');