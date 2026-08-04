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

    // --- Formatea una fecha a formato local (ej: 15/03/2026) ---
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
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