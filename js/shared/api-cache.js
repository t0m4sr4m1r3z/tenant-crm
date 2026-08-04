// api-cache.js - Caché en memoria para respuestas de API
(function(global) {
    'use strict';

    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
    const cache = {};

    function getCacheKey(endpoint, options = {}) {
        // Generar clave única basada en endpoint y método (GET por defecto)
        const method = options.method || 'GET';
        const body = options.body || '';
        return `${method}:${endpoint}:${body}`;
    }

    function isExpired(entry) {
        return Date.now() - entry.timestamp > CACHE_DURATION;
    }

    function getFromCache(endpoint, options = {}) {
        const key = getCacheKey(endpoint, options);
        const entry = cache[key];
        if (entry && !isExpired(entry)) {
            console.log(`📦 Cache hit: ${endpoint}`);
            return entry.data;
        }
        return null;
    }

    function setInCache(endpoint, data, options = {}) {
        const key = getCacheKey(endpoint, options);
        cache[key] = {
            data: data,
            timestamp: Date.now()
        };
        console.log(`💾 Cache stored: ${endpoint}`);
    }

    function clearCache() {
        for (const key in cache) {
            delete cache[key];
        }
        console.log('🧹 Cache cleared');
    }

    // Exponer al ámbito global
    global.APICache = {
        get: getFromCache,
        set: setInCache,
        clear: clearCache
    };

    console.log('✅ API Cache module loaded');

})(window);