// UI Helpers - Funciones de interfaz de usuario

// Mostrar notificación toast
function showToast(message, type = 'success', duration = 3000) {
    // Eliminar toasts existentes
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    // Crear nuevo toast
    const toast = document.createElement('div');
    toast.className = `toast-notification fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 flex items-center gap-3 transform transition-all duration-300 translate-x-full ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        type === 'warning' ? 'bg-yellow-500' :
        'bg-blue-500'
    } text-white`;
    
    // Icono según tipo
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
    
    document.body.appendChild(toast);
    
    // Animación de entrada
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
    }, 10);
    
    // Auto-cerrar
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Mostrar modal de confirmación
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
    
    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    
    // Colores según tipo
    const colors = {
        warning: { bg: 'bg-yellow-500', hover: 'hover:bg-yellow-600' },
        danger: { bg: 'bg-red-500', hover: 'hover:bg-red-600' },
        info: { bg: 'bg-blue-500', hover: 'hover:bg-blue-600' },
        success: { bg: 'bg-green-500', hover: 'hover:bg-green-600' }
    };
    
    const color = colors[type] || colors.warning;
    
    // Crear modal
    overlay.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl max-w-md w-full transform transition-all scale-95 opacity-0" id="confirmModal">
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="${color.bg} p-3 rounded-full">
                        <i class="fas ${type === 'warning' ? 'fa-exclamation-triangle' : type === 'danger' ? 'fa-trash' : 'fa-question'} text-white text-xl"></i>
                    </div>
                    <h3 class="text-lg font-semibold">${title}</h3>
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
    
    // Animación de entrada
    setTimeout(() => {
        const modal = document.getElementById('confirmModal');
        if (modal) {
            modal.classList.remove('scale-95', 'opacity-0');
        }
    }, 10);
    
    // Event listeners
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

// Mostrar loading spinner
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

// Ocultar loading
function hideLoading(container) {
    if (typeof container === 'string') {
        container = document.getElementById(container);
    }
    
    if (container) {
        const loading = container.querySelector('.loading-spinner');
        if (loading) loading.remove();
    }
}

// Validar email
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Validar DNI (ejemplo para Argentina)
function validateDNI(dni) {
    const re = /^\d{7,8}$/;
    return re.test(dni);
}

// Validar teléfono
function validatePhone(phone) {
    const re = /^[\d\s\+\-\(\)]{8,20}$/;
    return re.test(phone);
}

// Formatear moneda
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS'
    }).format(amount);
}

// Formatear fecha
function formatDate(date) {
    return new Date(date).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// Debounce para búsquedas
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Exportar funciones globalmente
window.UI = {
    toast: showToast,
    confirm: showConfirmDialog,
    showLoading,
    hideLoading,
    validateEmail,
    validateDNI,
    validatePhone,
    formatCurrency,
    formatDate,
    debounce
};

// Mejorar tablas para móviles
function mejorarTablasMoviles() {
    if (window.innerWidth <= 768) {
        document.querySelectorAll('table').forEach(table => {
            // Agregar data-label a cada celda para mostrar encabezado
            table.querySelectorAll('thead th').forEach((th, idx) => {
                const label = th.textContent;
                table.querySelectorAll(`tbody tr td:nth-child(${idx + 1})`).forEach(td => {
                    td.setAttribute('data-label', label);
                });
            });
        });
    }
}

// Ejecutar al cargar y al redimensionar
window.addEventListener('resize', mejorarTablasMoviles);
document.addEventListener('DOMContentLoaded', mejorarTablasMoviles);