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

    // --- Obtiene la fecha local actual en formato YYYY-MM-DD sin desfasaje UTC ---
    function getTodayString() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // --- Formatea fecha (DÍA/MES/AÑO) sin desfasaje horario (evita restar 1 día) ---
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        
        // Si viene como string 'YYYY-MM-DD' o 'YYYY-MM-DDT...'
        if (typeof dateStr === 'string') {
            const cleanStr = dateStr.split('T')[0].trim();
            const parts = cleanStr.split('-');
            if (parts.length === 3) {
                const [year, month, day] = parts;
                if (year && month && day) {
                    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
                }
            }
        }
        
        // Fallback para objetos Date
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        
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
        getTodayString: getTodayString,
        debounce: debounce
    };

    console.log('✅ Utilidades compartidas cargadas (AppUtils)');

})(window);