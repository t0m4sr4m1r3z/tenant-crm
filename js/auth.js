// Authentication module (con roles) – VERSIÓN CORREGIDA
const AUTH = {
    ROLES: {
        ADMIN: 'admin',
        AGENT: 'agent',
        VIEWER: 'viewer',
        SUPER_ADMIN: 'super_admin'
    },

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
        },
        super_admin: {
            canCreate: true,
            canEdit: true,
            canDelete: true,
            canAccessSettings: true,
            canAccessReports: true,
            canManageUsers: true,
            canManageCompanies: true,
            canManageRequests: true
        }
    },

    checkAuth: function() {
        const token = sessionStorage.getItem('authToken');
        const user = sessionStorage.getItem('user');
        
        // Saltar verificación en páginas de login/registro
        if (window.location.pathname.includes('login.html') || 
            window.location.pathname.includes('register.html')) {
            return;
        }
        
        if (!token || !user) {
            window.location.href = '/login.html';
            return false;
        }
        
        const userData = JSON.parse(user);
        
        // Verificar acceso a la página actual
        if (!this.hasPageAccess(userData.role, window.location.pathname)) {
            console.warn(`⚠️ Acceso denegado a ${window.location.pathname} para rol ${userData.role}`);
            window.location.href = '/dashboard.html';
            return false;
        }
        
        return { token, user: userData };
    },

    hasPageAccess: function(role, path) {
        const page = path.substring(path.lastIndexOf('/') + 1);
        const allowedPages = {
            // ===== ADMIN (cliente) - ACCESO COMPLETO =====
            admin: [
                'dashboard.html', 'tenants.html', 'owners.html', 
                'properties.html', 'contracts.html', 'payments.html', 
                'calendar.html', 'reports.html', 'settings.html'
            ],
            // ===== AGENTE =====
            agent: [
                'dashboard.html', 'tenants.html', 'owners.html', 
                'properties.html', 'contracts.html', 'payments.html', 
                'calendar.html'
            ],
            // ===== VISUALIZADOR =====
            viewer: [
                'dashboard.html', 'tenants.html', 'owners.html', 
                'properties.html', 'contracts.html', 'payments.html', 
                'calendar.html'
            ],
            // ===== SUPER ADMIN =====
            super_admin: [
                'dashboard.html', 'tenants.html', 'owners.html', 
                'properties.html', 'contracts.html', 'payments.html', 
                'calendar.html', 'reports.html', 'settings.html',
                'admin/dashboard.html', 'admin/requests.html', 'admin/companies.html'
            ]
        };
        const allowed = allowedPages[role] || [];
        return allowed.includes(page);
    },

    login: async function(username, password) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                let user = null;
                let token = null;

                if (username === 'superadmin' && password === 'SuperAdmin213?!') {
                    user = { username: 'superadmin', name: 'Super Administrador', role: this.ROLES.SUPER_ADMIN };
                } else if (username === 'admin' && password === 'admin123') {
                    user = { username: 'admin', name: 'Administrador', role: this.ROLES.ADMIN };
                } else if (username === 'agente' && password === 'agente123') {
                    user = { username: 'agente', name: 'Agente de Gestión', role: this.ROLES.AGENT };
                } else if (username === 'visualizador' && password === 'visualizador123') {
                    user = { username: 'visualizador', name: 'Visualizador', role: this.ROLES.VIEWER };
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
    
    logout: function() {
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('user');
        window.location.href = '/login.html';
    },
    
    getCurrentUser: function() {
        const user = sessionStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    getCurrentRole: function() {
        const user = this.getCurrentUser();
        return user ? user.role : null;
    },

    hasPermission: function(permission) {
        const role = this.getCurrentRole();
        if (!role) return false;
        return this.PERMISSIONS[role]?.[permission] || false;
    },

    hasRole: function(role) {
        const currentRole = this.getCurrentRole();
        return currentRole === role;
    },

    isAdmin: function() {
        return this.hasRole(this.ROLES.ADMIN);
    },

    isSuperAdmin: function() {
        return this.hasRole(this.ROLES.SUPER_ADMIN);
    },

    aplicarRestriccionesPorRol: function() {
        const user = this.getCurrentUser();
        if (!user) return;

        document.querySelectorAll('[data-required-role]').forEach(el => {
            const requiredRole = el.dataset.requiredRole;
            if (!this.hasRole(requiredRole)) {
                el.style.display = 'none';
            }
        });

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

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticación
    const auth = AUTH.checkAuth();
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            AUTH.logout();
        });
    }
    
    // Login
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

    // Aplicar restricciones de rol en todas las páginas excepto login/register
    if (!window.location.pathname.includes('login.html') && 
        !window.location.pathname.includes('register.html')) {
        setTimeout(() => {
            AUTH.aplicarRestriccionesPorRol();
        }, 100);
    }
});

window.AUTH = AUTH;

// ============================================
// PWA
// ============================================

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

// Instalación PWA
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
});

function showInstallButton() {
    const installBtn = document.getElementById('installPwaBtn');
    if (installBtn) return; // Ya existe
    
    const btn = document.createElement('button');
    btn.id = 'installPwaBtn';
    btn.className = 'fixed bottom-4 left-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition flex items-center gap-2 z-50';
    btn.innerHTML = '<i class="fas fa-download"></i> Instalar App';
    btn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('✅ Usuario aceptó instalar la PWA');
            btn.remove();
        }
        deferredPrompt = null;
    });
    document.body.appendChild(btn);
}

window.addEventListener('appinstalled', () => {
    console.log('✅ PWA instalada correctamente');
    const installBtn = document.getElementById('installPwaBtn');
    if (installBtn) installBtn.remove();
    if (window.UI) {
        UI.toast('¡Gracias por instalar Tenant CRM!', 'success');
    }
});