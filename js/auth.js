// Authentication module (con roles) – VERSIÓN CORREGIDA
const AUTH = {
    // Roles definidos
    ROLES: {
        ADMIN: 'admin',
        AGENT: 'agent',
        VIEWER: 'viewer'
    },

    // Permisos por rol
    PERMISSIONS: {
        admin: {
            canCreate: true,
            canEdit: true,
            canDelete: true,
            canAccessSettings: true,
            canAccessReports: true,
            canManageUsers: true
        },
        agent: {
            canCreate: true,
            canEdit: true,
            canDelete: false,
            canAccessSettings: false,
            canAccessReports: false,
            canManageUsers: false
        },
        viewer: {
            canCreate: false,
            canEdit: false,
            canDelete: false,
            canAccessSettings: false,
            canAccessReports: false,
            canManageUsers: false
        }
    },

    // Check if user is logged in
    checkAuth: function() {
        // Usamos sessionStorage para mayor seguridad
        const token = sessionStorage.getItem('authToken');
        const user = sessionStorage.getItem('user');
        
        // Skip auth check on login page
        if (window.location.pathname.includes('login.html')) {
            return;
        }
        
        if (!token || !user) {
            window.location.href = '/login.html';
            return false;
        }
        
        const userData = JSON.parse(user);
        // Verificar acceso a la página actual según el rol
        if (!this.hasPageAccess(userData.role, window.location.pathname)) {
            window.location.href = '/dashboard.html';
            return false;
        }
        
        return { token, user: userData };
    },

    // Verificar si el rol tiene acceso a una página
    hasPageAccess: function(role, path) {
        const page = path.substring(path.lastIndexOf('/') + 1);
        const allowedPages = {
            admin: ['dashboard.html', 'tenants.html', 'owners.html', 'properties.html', 'contracts.html', 'payments.html', 'calendar.html', 'reports.html', 'settings.html'],
            agent: ['dashboard.html', 'tenants.html', 'owners.html', 'properties.html', 'contracts.html', 'payments.html', 'calendar.html'],
            viewer: ['dashboard.html', 'tenants.html', 'owners.html', 'properties.html', 'contracts.html', 'payments.html', 'calendar.html']
        };
        const allowed = allowedPages[role] || [];
        return allowed.includes(page);
    },

    // Login function (ahora con roles)
    login: async function(username, password) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                let user = null;
                let token = null;

                // Mapeo de usuarios a roles
                if (username === 'admin' && password === 'admin123') {
                    user = { 
                        username: 'admin', 
                        name: 'Administrador',
                        role: this.ROLES.ADMIN
                    };
                } else if (username === 'agente' && password === 'agente123') {
                    user = { 
                        username: 'agente', 
                        name: 'Agente de Gestión',
                        role: this.ROLES.AGENT
                    };
                } else if (username === 'visualizador' && password === 'visualizador123') {
                    user = { 
                        username: 'visualizador', 
                        name: 'Visualizador',
                        role: this.ROLES.VIEWER
                    };
                } else {
                    reject({ success: false, message: 'Usuario o contraseña incorrectos' });
                    return;
                }

                token = 'demo-token-' + Math.random().toString(36).substring(2);
                sessionStorage.setItem('authToken', token);
                sessionStorage.setItem('user', JSON.stringify(user));
                resolve({ success: true, user, token });
            }, 500);
        });
    },
    
    // Logout function
    logout: function() {
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('user');
        window.location.href = '/login.html';
    },
    
    // Get current user
    getCurrentUser: function() {
        const user = sessionStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    // Get current role
    getCurrentRole: function() {
        const user = this.getCurrentUser();
        return user ? user.role : null;
    },

    // Check if user has a specific permission
    hasPermission: function(permission) {
        const role = this.getCurrentRole();
        if (!role) return false;
        return this.PERMISSIONS[role]?.[permission] || false;
    },

    // Check if user has a specific role
    hasRole: function(role) {
        const currentRole = this.getCurrentRole();
        return currentRole === role;
    },

    // Check if user is admin
    isAdmin: function() {
        return this.hasRole(this.ROLES.ADMIN);
    },

    // Aplicar restricciones de visibilidad en la página actual
    aplicarRestriccionesPorRol: function() {
        const user = this.getCurrentUser();
        if (!user) return;

        // Ocultar elementos del sidebar según rol
        document.querySelectorAll('[data-required-role]').forEach(el => {
            const requiredRole = el.dataset.requiredRole;
            if (!this.hasRole(requiredRole)) {
                el.style.display = 'none';
            }
        });

        // Ocultar botones de acción según permisos
        if (!this.hasPermission('canCreate')) {
            document.querySelectorAll('[data-action="create"]').forEach(el => el.style.display = 'none');
        }
        if (!this.hasPermission('canEdit')) {
            document.querySelectorAll('[data-action="edit"]').forEach(el => el.style.display = 'none');
        }
        if (!this.hasPermission('canDelete')) {
            document.querySelectorAll('[data-action="delete"]').forEach(el => el.style.display = 'none');
        }
    }
};

// Inicializar auth check y restricciones al cargar la página
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
            
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            const errorDiv = document.getElementById('errorMessage');
            
            UI.clearAllFieldErrors(loginForm);
            errorDiv.classList.add('hidden');
            
            let isValid = true;
            if (!usernameInput.value.trim()) {
                UI.showFieldError(usernameInput, 'El usuario es obligatorio');
                isValid = false;
            }
            if (!passwordInput.value.trim()) {
                UI.showFieldError(passwordInput, 'La contraseña es obligatoria');
                isValid = false;
            }
            if (!isValid) return;
            
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verificando...';
            submitBtn.disabled = true;
            
            try {
                const result = await AUTH.login(usernameInput.value, passwordInput.value);
                if (result.success) {
                    window.location.href = '/dashboard.html';
                }
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.classList.remove('hidden');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Aplicar restricciones de rol en todas las páginas excepto login
    if (!window.location.pathname.includes('login.html')) {
        setTimeout(() => {
            AUTH.aplicarRestriccionesPorRol();
        }, 100);
    }
});

// Export for use in other files
window.AUTH = AUTH;

// PWA Registration (código existente)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker registrado:', registration.scope);
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
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
        
        window.addEventListener('online', () => {
            console.log('📶 Conexión restablecida');
            if (window.UI) {
                UI.toast('Conexión restablecida. Sincronizando datos...', 'success');
            }
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

// Instalación PWA (código existente)
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
});

function showInstallButton() {
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

window.addEventListener('appinstalled', () => {
    console.log('✅ PWA instalada correctamente');
    const installBtn = document.getElementById('installPwaBtn');
    if (installBtn) installBtn.remove();
    if (window.UI) {
        UI.toast('¡Gracias por instalar Tenant CRM!', 'success');
    }
});