// Authentication module
const AUTH = {
    // Check if user is logged in
    checkAuth: function() {
        const token = localStorage.getItem('authToken');
        const user = localStorage.getItem('user');
        
        // Skip auth check on login page
        if (window.location.pathname.includes('login.html')) {
            return;
        }
        
        if (!token || !user) {
            window.location.href = '/login.html';
            return false;
        }
        
        return { token, user: JSON.parse(user) };
    },
    
    // Login function
    login: async function(username, password) {
        // In production, this would call your Netlify function
        // For demo, we'll use a simple validation
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (username === 'admin' && password === 'admin123') {
                    const user = { username: 'admin', name: 'Administrador' };
                    const token = 'demo-token-' + Math.random().toString(36).substr(2);
                    
                    localStorage.setItem('authToken', token);
                    localStorage.setItem('user', JSON.stringify(user));
                    
                    resolve({ success: true, user, token });
                } else {
                    reject({ success: false, message: 'Usuario o contraseña incorrectos' });
                }
            }, 500);
        });
    },
    
    // Logout function
    logout: function() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    },
    
    // Get current user
    getCurrentUser: function() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    }
};

// Initialize auth check on page load
document.addEventListener('DOMContentLoaded', () => {
    const auth = AUTH.checkAuth();
    
    // Setup logout button if exists
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            AUTH.logout();
        });
    }
    
    // Setup login form if exists
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('errorMessage');
            
            try {
                const result = await AUTH.login(username, password);
                if (result.success) {
                    window.location.href = '/dashboard.html';
                }
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.classList.remove('hidden');
            }
        });
    }
});

// Export for use in other files
window.AUTH = AUTH;

// PWA Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker registrado:', registration.scope);
                
                // Verificar actualizaciones
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('🔄 Nueva versión del Service Worker instalando...');
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Mostrar notificación de actualización disponible
                            if (window.UI) {
                                UI.toast('Nueva versión disponible. Actualiza la página para ver los cambios.', 'info', 10000);
                            }
                        }
                    });
                });
            })
            .catch(error => {
                console.error('❌ Error registrando Service Worker:', error);
            });
        
        // Detectar cambios en la conexión
        window.addEventListener('online', () => {
            console.log('📶 Conexión restablecida');
            if (window.UI) {
                UI.toast('Conexión restablecida. Sincronizando datos...', 'success');
            }
            // Intentar sincronizar datos pendientes
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.sync.register('sync-payments');
                });
            }
        });
        
        window.addEventListener('offline', () => {
            console.log('📴 Sin conexión');
            if (window.UI) {
                UI.toast('Modo offline activado. Los cambios se guardarán localmente.', 'warning');
            }
        });
    });
}

// Detectar si la app se puede instalar
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Mostrar un botón de instalación si el usuario no tiene la app instalada
    showInstallButton();
});

function showInstallButton() {
    // Crear botón de instalación flotante
    const installBtn = document.createElement('button');
    installBtn.id = 'installPwaBtn';
    installBtn.className = 'fixed bottom-4 left-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition flex items-center gap-2 z-50';
    installBtn.innerHTML = '<i class="fas fa-download"></i> Instalar App';
    
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('✅ Usuario aceptó instalar la PWA');
            installBtn.remove();
        }
        
        deferredPrompt = null;
    });
    
    document.body.appendChild(installBtn);
}

// Detectar si la app ya está instalada
window.addEventListener('appinstalled', () => {
    console.log('✅ PWA instalada correctamente');
    const installBtn = document.getElementById('installPwaBtn');
    if (installBtn) installBtn.remove();
    
    if (window.UI) {
        UI.toast('¡Gracias por instalar Tenant CRM!', 'success');
    }
});