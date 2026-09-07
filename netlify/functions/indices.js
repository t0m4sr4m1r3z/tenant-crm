// netlify/functions/indices.js
const { getDb } = require('./db/config');

// Usar fetch nativo de Node 18+ o fallback a node-fetch
const fetch = globalThis.fetch || require('node-fetch');

// Configuración de endpoints oficiales/públicos
const API_INFLACION_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';
const API_ICL_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/icl';

exports.handler = async (event, context) => {
    // Encabezados CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const sql = getDb();

        // 1. Asegurar la tabla de índices en Neon Postgres
        await sql`
            CREATE TABLE IF NOT EXISTS economic_indices (
                id SERIAL PRIMARY KEY,
                type VARCHAR(20) NOT NULL, -- 'ipc', 'icl'
                date VARCHAR(20) NOT NULL,
                value NUMERIC(12, 4) NOT NULL,
                raw_data JSONB,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(type, date)
            );
        `;

        // ============================================
        // PETICIÓN GET: Obtener IPC e ICL
        // ============================================
        if (event.httpMethod === 'GET') {
            const forceRefresh = event.queryStringParameters?.refresh === 'true';

            // Comprobar si tenemos datos actualizados en las últimas 12 horas
            if (!forceRefresh) {
                const cachedData = await sql`
                    SELECT type, value, date, updated_at 
                    FROM economic_indices 
                    WHERE updated_at > NOW() - INTERVAL '12 hours'
                    ORDER BY updated_at DESC;
                `;

                const cachedIpc = cachedData.find(d => d.type === 'ipc');
                const cachedIcl = cachedData.find(d => d.type === 'icl');

                if (cachedIpc && cachedIcl) {
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            success: true,
                            source: 'cache',
                            ipc: parseFloat(cachedIpc.value),
                            ipcDate: cachedIpc.date,
                            icl: parseFloat(cachedIcl.value),
                            iclDate: cachedIcl.date,
                            lastUpdated: cachedIpc.updated_at
                        })
                    };
                }
            }

            // Si no hay caché reciente o se forzó refresh, consultar APIs externas
            let ipcResult = null;
            let iclResult = null;

            try {
                // Timeout de 6 segundos para evitar colgar la función serverless
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000);

                const [resInflacion, resIcl] = await Promise.allSettled([
                    fetch(API_INFLACION_URL, { signal: controller.signal }),
                    fetch(API_ICL_URL, { signal: controller.signal })
                ]);
                clearTimeout(timeoutId);

                // --- Procesar IPC (Inflación mensual INDEC) ---
                if (resInflacion.status === 'fulfilled' && resInflacion.value.ok) {
                    const dataInflacion = await resInflacion.value.json();
                    if (Array.isArray(dataInflacion) && dataInflacion.length > 0) {
                        const latestIpc = dataInflacion[dataInflacion.length - 1];
                        ipcResult = {
                            value: parseFloat(latestIpc.valor),
                            date: latestIpc.fecha
                        };

                        await sql`
                            INSERT INTO economic_indices (type, date, value, updated_at)
                            VALUES ('ipc', ${ipcResult.date}, ${ipcResult.value}, NOW())
                            ON CONFLICT (type, date) DO UPDATE 
                            SET value = EXCLUDED.value, updated_at = NOW();
                        `;
                    }
                }

                // --- Procesar ICL (Índice de Contratos de Locación BCRA) ---
                if (resIcl.status === 'fulfilled' && resIcl.value.ok) {
                    const dataIcl = await resIcl.value.json();
                    if (Array.isArray(dataIcl) && dataIcl.length > 31) {
                        const latestIcl = dataIcl[dataIcl.length - 1];
                        // Buscar el valor de hace aprox. 30 días para calcular el % de aumento mensual
                        const pastMonthIcl = dataIcl[dataIcl.length - 31];

                        const rawLatest = parseFloat(latestIcl.valor);
                        const rawPast = parseFloat(pastMonthIcl.valor);
                        const monthlyVariation = ((rawLatest - rawPast) / rawPast) * 100;

                        iclResult = {
                            value: parseFloat(monthlyVariation.toFixed(2)), // % aplicable al contrato
                            date: latestIcl.fecha,
                            rawIndex: rawLatest
                        };

                        await sql`
                            INSERT INTO economic_indices (type, date, value, raw_data, updated_at)
                            VALUES ('icl', ${iclResult.date}, ${iclResult.value}, ${JSON.stringify({ rawIndex: rawLatest })}, NOW())
                            ON CONFLICT (type, date) DO UPDATE 
                            SET value = EXCLUDED.value, raw_data = EXCLUDED.raw_data, updated_at = NOW();
                        `;
                    }
                }
            } catch (fetchErr) {
                console.warn('⚠️ No se pudo sincronizar con las APIs externas:', fetchErr.message);
            }

            // --- Fallback: Si alguna falló, consultar el último registro guardado en Neon ---
            if (!ipcResult) {
                const lastIpcDb = await sql`
                    SELECT value, date FROM economic_indices 
                    WHERE type = 'ipc' 
                    ORDER BY updated_at DESC LIMIT 1;
                `;
                if (lastIpcDb.length > 0) {
                    ipcResult = { value: parseFloat(lastIpcDb[0].value), date: lastIpcDb[0].date };
                } else {
                    ipcResult = { value: 2.2, date: new Date().toISOString().slice(0, 7) }; // Fallback inicial
                }
            }

            if (!iclResult) {
                const lastIclDb = await sql`
                    SELECT value, date FROM economic_indices 
                    WHERE type = 'icl' 
                    ORDER BY updated_at DESC LIMIT 1;
                `;
                if (lastIclDb.length > 0) {
                    iclResult = { value: parseFloat(lastIclDb[0].value), date: lastIclDb[0].date };
                } else {
                    iclResult = { value: 2.4, date: new Date().toISOString().slice(0, 10) }; // Fallback inicial
                }
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    source: 'live-api',
                    ipc: ipcResult.value,
                    ipcDate: ipcResult.date,
                    icl: iclResult.value,
                    iclDate: iclResult.date,
                    lastUpdated: new Date().toISOString()
                })
            };
        }

        // ============================================
        // PETICIÓN POST: Guardar índices manuales
        // ============================================
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');

            // Caso A: Se envía un payload completo desde Settings ({ ipc, icl, ipcDate, iclDate })
            if (body.ipc !== undefined || body.icl !== undefined) {
                if (body.ipc !== undefined && body.ipcDate) {
                    await sql`
                        INSERT INTO economic_indices (type, date, value, updated_at)
                        VALUES ('ipc', ${body.ipcDate}, ${parseFloat(body.ipc)}, NOW())
                        ON CONFLICT (type, date) DO UPDATE 
                        SET value = EXCLUDED.value, updated_at = NOW();
                    `;
                }
                if (body.icl !== undefined && body.iclDate) {
                    await sql`
                        INSERT INTO economic_indices (type, date, value, updated_at)
                        VALUES ('icl', ${body.iclDate}, ${parseFloat(body.icl)}, NOW())
                        ON CONFLICT (type, date) DO UPDATE 
                        SET value = EXCLUDED.value, updated_at = NOW();
                    `;
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: true, message: 'Índices guardados correctamente' })
                };
            }

            // Caso B: Se envía un índice unitario ({ type, date, value })
            const { type, date, value } = body;
            if (!type || value === undefined || !date) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Faltan parámetros requeridos (type, date, value)' })
                };
            }

            await sql`
                INSERT INTO economic_indices (type, date, value, updated_at)
                VALUES (${type}, ${date}, ${parseFloat(value)}, NOW())
                ON CONFLICT (type, date) DO UPDATE 
                SET value = EXCLUDED.value, updated_at = NOW();
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: `Índice ${type} actualizado con éxito` })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };

    } catch (error) {
        console.error('❌ Error en netlify/functions/indices.js:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Error interno del servidor' })
        };
    }
};