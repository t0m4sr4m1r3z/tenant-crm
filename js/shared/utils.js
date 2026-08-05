// /js/shared/utils.js - Utilidades compartidas para todo el CRM
(function(global) {
    'use strict';

    // --- Escapa caracteres especiales para prevenir XSS ---
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // --- Formatea un número como moneda (ARS) ---
    function formatCurrency(amount) {
        if (amount === undefined || amount === null || isNaN(amount)) {
            return '$0';
        }
        return '$' + Number(amount).toLocaleString('es-AR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

  // utils.js - Modificar la función formatDate
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    
    // ===== FORMATO DÍA/MES/AÑO =====
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

    // --- Debounce para búsquedas y eventos frecuentes ---
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

    // --- Exponer al ámbito global ---
    global.AppUtils = {
        escapeHtml: escapeHtml,
        formatCurrency: formatCurrency,
        formatDate: formatDate,
        debounce: debounce
    };

    console.log('✅ Utilidades compartidas cargadas (AppUtils)');

})(window);