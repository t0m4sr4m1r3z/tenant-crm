// Authentication module (con roles) – VERSIÓN CON ACCESO TEMPORAL
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
        
        console.log('🔍 checkAuth ejecutándose');
        console.log('📍 path:', window.location.pathname);
        
        if (window.location.pathname.includes('login.html') || 
            window.location.pathname.includes('register.html')) {
            console.log('⏭️ Saltando verificación en login/register');
            return;
        }
        
        if (!token || !user) {
            console.log('🔴 No hay sesión, redirigiendo a login');
            window.location.href = '/login.html';
            return false;
        }
        
        const userData = JSON.parse(user);
        console.log('👤 Usuario:', userData.username, 'Rol:', userData.role);
        
        // ===== 🔧 SOLUCIÓN TEMPORAL: Permitir acceso a TODOS los usuarios =====
        console.log('✅ Acceso permitido (temporal)');
        return { token, user: userData };
    },

    hasPageAccess: function(role, path) {
        const page = path.substring(path.lastIndexOf('/') + 1);
        console.log(`🔍 Verificando acceso: rol=${role}, página=${page}`);
        
        const allowedPages = {
            admin: [
                'dashboard.html', 'tenants.html', 'owners.html', 
                'properties.html', 'contracts.html', 'payments.html', 
                'calendar.html', 'reports.html', 'settings.html'
            ],
            agent: [
                'dashboard.html', 'tenants.html', 'owners.html', 
                'properties.html', 'contracts.html', 'payments.html', 
                'calendar.html'
            ],
            viewer: [
                'dashboard.html', 'tenants.html', 'owners.html', 
                'properties.html', 'contracts.html', 'payments.html', 
                'calendar.html'
            ],
            super_admin: [
                'dashboard.html', 'tenants.html', 'owners.html', 
                'properties.html', 'contracts.html', 'payments.html', 
                'calendar.html', 'reports.html', 'settings.html',
                'admin/dashboard.html', 'admin/requests.html', 'admin/companies.html'
            ]
        };
        
        const allowed = allowedPages[role] || [];
        const result = allowed.includes(page);
        console.log(`📋 ${result ? '✅ Acceso permitido' : '❌ Acceso denegado'}`);
        return result;
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
// INICIALIZACIÓN (CON RETRASO)
// ============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🚀 DOMContentLoaded - auth.js');
        setTimeout(() => {
            AUTH.checkAuth();
        }, 100);
    });
} else {
    console.log('🚀 DOM ya cargado - auth.js');
    setTimeout(() => {
        AUTH.checkAuth();
    }, 100);
}

// Event listeners para logout y login
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            AUTH.logout();
        });
    }
    
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

    if (!window.location.pathname.includes('login.html') && 
        !window.location.pathname.includes('register.html')) {
        setTimeout(() => {
            AUTH.aplicarRestriccionesPorRol();
        }, 200);
    }
});

window.AUTH = AUTH;