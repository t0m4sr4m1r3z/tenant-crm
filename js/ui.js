// ui.js - Funciones de interfaz de usuario (TOASTS, MODALES, LOADING, FORMATOS, PERMISOS)
(function(global) {
    'use strict';

    // ============================================
    // TOAST NOTIFICATIONS
    // ============================================

    function showToast(message, type = 'success', duration = 3000) {
        // Eliminar toasts existentes
        const existingToasts = document.querySelectorAll('.toast-notification');
        existingToasts.forEach(toast => toast.remove());

        const toast = document.createElement('div');
        toast.className = `toast-notification fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 flex items-center gap-3 transform transition-all duration-300 translate-x-full ${
            type === 'success' ? 'bg-green-500' :
            type === 'error' ? 'bg-red-500' :
            type === 'warning' ? 'bg-yellow-500' :
            'bg-blue-500'
        } text-white`;

        const icon = type === 'success' ? 'fa-check-circle' :
                     type === 'error' ? 'fa-exclamation-circle' :
                     type === 'warning' ? 'fa-exclamation-triangle' :
                     'fa-info-circle';

        toast.innerHTML = `
            <i class="fas ${icon} text-xl"></i>
            <span class="flex-1">${message}</span>
            <button onclick="this.parentElement.remove()" class="hover:opacity-75">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Accesibilidad
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'polite');

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.remove('translate-x-full');
        }, 10);

        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ============================================
    // CONFIRM DIALOG
    // ============================================

    function showConfirmDialog(options) {
        const {
            title = 'Confirmar acción',
            message = '¿Estás seguro?',
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            type = 'warning',
            onConfirm,
            onCancel
        } = options;

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';

        const colors = {
            warning: { bg: 'bg-yellow-500', hover: 'hover:bg-yellow-600' },
            danger: { bg: 'bg-red-500', hover: 'hover:bg-red-600' },
            info: { bg: 'bg-blue-500', hover: 'hover:bg-blue-600' },
            success: { bg: 'bg-green-500', hover: 'hover:bg-green-600' }
        };

        const color = colors[type] || colors.warning;

        overlay.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl max-w-md w-full transform transition-all scale-95 opacity-0" id="confirmModal">
                <div class="p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="${color.bg} p-3 rounded-full">
                            <i class="fas ${type === 'warning' ? 'fa-exclamation-triangle' : type === 'danger' ? 'fa-trash' : 'fa-question'} text-white text-xl"></i>
                        </div>
                        <h3 id="confirmDialogTitle" class="text-lg font-semibold">${title}</h3>
                    </div>
                    <p class="text-gray-600 mb-6">${message}</p>
                    <div class="flex gap-3 justify-end">
                        <button class="cancel-btn px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                            ${cancelText}
                        </button>
                        <button class="confirm-btn ${color.bg} ${color.hover} text-white px-4 py-2 rounded-lg transition">
                            ${confirmText}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Accesibilidad
        const modalContent = overlay.querySelector('#confirmModal');
        if (modalContent) {
            modalContent.setAttribute('role', 'alertdialog');
            modalContent.setAttribute('aria-modal', 'true');
            modalContent.setAttribute('aria-labelledby', 'confirmDialogTitle');
        }

        setTimeout(() => {
            const modal = document.getElementById('confirmModal');
            if (modal) {
                modal.classList.remove('scale-95', 'opacity-0');
            }
        }, 10);

        const confirmBtn = overlay.querySelector('.confirm-btn');
        const cancelBtn = overlay.querySelector('.cancel-btn');

        confirmBtn.addEventListener('click', () => {
            if (onConfirm) onConfirm();
            overlay.remove();
        });

        cancelBtn.addEventListener('click', () => {
            if (onCancel) onCancel();
            overlay.remove();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (onCancel) onCancel();
                overlay.remove();
            }
        });
    }

    // ============================================
    // LOADING SPINNER
    // ============================================

    function showLoading(container, message = 'Cargando...') {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'loading-spinner flex flex-col items-center justify-center py-8';
        loadingEl.innerHTML = `
            <div class="spinner mb-3"></div>
            <p class="text-gray-500">${message}</p>
        `;

        if (typeof container === 'string') {
            container = document.getElementById(container);
        }

        if (container) {
            container.innerHTML = '';
            container.appendChild(loadingEl);
        }

        return loadingEl;
    }

    function hideLoading(container) {
        if (typeof container === 'string') {
            container = document.getElementById(container);
        }

        if (container) {
            const loading = container.querySelector('.loading-spinner');
            if (loading) loading.remove();
        }
    }

    // ============================================
    // VALIDACIONES
    // ============================================

    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    function validateDNI(dni) {
        const re = /^\d{7,8}$/;
        return re.test(dni);
    }

    function validatePhone(phone) {
        const re = /^[\d\s\+\-\(\)]{8,20}$/;
        return re.test(phone);
    }

    // ============================================
    // FORMATOS (delegados a AppUtils para consistencia)
    // ============================================

    function formatCurrency(amount) {
        return AppUtils ? AppUtils.formatCurrency(amount) : `$${Number(amount).toLocaleString()}`;
    }

    function formatDate(date) {
        return AppUtils ? AppUtils.formatDate(date) : new Date(date).toLocaleDateString('es-ES');
    }

    // ============================================
    // DEBOUNCE
    // ============================================

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============================================
    // VALIDACIÓN DE FORMULARIOS - MENSAJES DE ERROR
    // ============================================

    function showFieldError(inputElement, message) {
        const errorContainer = inputElement.parentElement.querySelector('.field-error');
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.classList.remove('hidden');
            inputElement.classList.add('border-red-500', 'ring-1', 'ring-red-500');
        }
    }

    function clearFieldError(inputElement) {
        const errorContainer = inputElement.parentElement.querySelector('.field-error');
        if (errorContainer) {
            errorContainer.textContent = '';
            errorContainer.classList.add('hidden');
            inputElement.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
        }
    }

    function clearAllFieldErrors(formElement) {
        formElement.querySelectorAll('.field-error').forEach(el => {
            el.textContent = '';
            el.classList.add('hidden');
        });
        formElement.querySelectorAll('.border-red-500').forEach(el => {
            el.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
        });
    }

    function validateField(inputElement, validationFn, errorMessage) {
        const value = inputElement.value.trim();
        if (!value) {
            showFieldError(inputElement, 'Este campo es obligatorio');
            return false;
        }
        if (validationFn && !validationFn(value)) {
            showFieldError(inputElement, errorMessage || 'Valor inválido');
            return false;
        }
        clearFieldError(inputElement);
        return true;
    }

    // ============================================
    // MODO OSCURO (DARK MODE)
    // ============================================

    function initDarkMode() {
        const toggleBtn = document.getElementById('darkModeToggle');
        const icon = document.getElementById('darkModeIcon');
        if (!toggleBtn || !icon) return;

        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedTheme = localStorage.getItem('theme');

        let isDark = false;

        if (savedTheme === 'dark') {
            isDark = true;
        } else if (savedTheme === 'light') {
            isDark = false;
        } else {
            isDark = prefersDark;
        }

        if (isDark) {
            document.body.classList.add('dark');
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }

        toggleBtn.addEventListener('click', () => {
            isDark = !isDark;
            if (isDark) {
                document.body.classList.add('dark');
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.remove('dark');
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
                localStorage.setItem('theme', 'light');
            }
        });

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                isDark = e.matches;
                if (isDark) {
                    document.body.classList.add('dark');
                    icon.classList.remove('fa-moon');
                    icon.classList.add('fa-sun');
                } else {
                    document.body.classList.remove('dark');
                    icon.classList.remove('fa-sun');
                    icon.classList.add('fa-moon');
                }
            }
        });
    }

    // ============================================
    // FUNCIONES DE PERMISOS Y ROLES
    // ============================================

    function canAccess(permission) {
        return window.AUTH ? window.AUTH.hasPermission(permission) : false;
    }

    function showIfPermission(permission, elementIds) {
        const hasPermission = canAccess(permission);
        if (typeof elementIds === 'string') {
            elementIds = [elementIds];
        }
        elementIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = hasPermission ? '' : 'none';
            }
        });
    }

    function hideIfPermission(permission, elementIds) {
        const hasPermission = canAccess(permission);
        if (typeof elementIds === 'string') {
            elementIds = [elementIds];
        }
        elementIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = hasPermission ? 'none' : '';
            }
        });
    }

    function applyRoleRestrictions() {
        if (window.AUTH && typeof window.AUTH.aplicarRestriccionesPorRol === 'function') {
            window.AUTH.aplicarRestriccionesPorRol();
        } else {
            // Fallback: ocultar elementos con data-required-role usando el rol del usuario
            const user = window.AUTH ? window.AUTH.getCurrentUser() : null;
            if (!user) return;
            document.querySelectorAll('[data-required-role]').forEach(el => {
                const requiredRole = el.dataset.requiredRole;
                if (user.role !== requiredRole) {
                    el.style.display = 'none';
                }
            });
        }
    }

    // ============================================
    // EXPONER AL ÁMBITO GLOBAL
    // ============================================

    global.UI = {
        toast: showToast,
        confirm: showConfirmDialog,
        showLoading: showLoading,
        hideLoading: hideLoading,
        validateEmail: validateEmail,
        validateDNI: validateDNI,
        validatePhone: validatePhone,
        formatCurrency: formatCurrency,
        formatDate: formatDate,
        debounce: debounce,
        showFieldError: showFieldError,
        clearFieldError: clearFieldError,
        clearAllFieldErrors: clearAllFieldErrors,
        validateField: validateField,
        initDarkMode: initDarkMode,
        canAccess: canAccess,
        showIfPermission: showIfPermission,
        hideIfPermission: hideIfPermission,
        applyRoleRestrictions: applyRoleRestrictions
    };

    console.log('✅ UI centralizada cargada');

})(window);

// ============================================
// INICIALIZACIÓN AUTOMÁTICA
// ============================================

// Inicializar modo oscuro cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    UI.initDarkMode();
});