// indices.js - Versión con soporte para valores manuales
const fetch = require('node-fetch');

// Valores por defecto (marzo 2026)
const VALORES_DEFECTO = {
    ipc: { monthly: 2.0, yearly: 25.0, date: '2026-03' },
    icl: { monthly: 2.1, date: '2026-03' }
};

// Intentar obtener datos de API
async function obtenerIPC_API() {
    try {
        const url = 'https://apis.datos.gob.ar/series/api/series/?ids=148.1_IMIPOC_0_0_29&limit=12';
        const response = await fetch(url, { timeout: 3000 });
        
        if (response.ok) {
            const data = await response.json();
            if (data && data.data && data.data.length >= 2) {
                const ultimo = data.data[data.data.length - 1];
                const anterior = data.data[data.data.length - 2];
                const variacion = ((ultimo - anterior) / anterior * 100).toFixed(2);
                return {
                    monthly: parseFloat(variacion),
                    yearly: 0,
                    date: data.periods ? data.periods[data.periods.length - 1] : new Date().toISOString().split('T')[0],
                    source: 'API'
                };
            }
        }
    } catch (error) {
        console.log('⚠️ No se pudo obtener IPC de API');
    }
    return null;
}

async function obtenerICL_API() {
    try {
        const url = 'https://apis.datos.gob.ar/series/api/series/?ids=168.1_ICL_0_0_27&limit=12';
        const response = await fetch(url, { timeout: 3000 });
        
        if (response.ok) {
            const data = await response.json();
            if (data && data.data && data.data.length >= 2) {
                const ultimo = data.data[data.data.length - 1];
                const anterior = data.data[data.data.length - 2];
                const variacion = ((ultimo - anterior) / anterior * 100).toFixed(2);
                return {
                    monthly: parseFloat(variacion),
                    date: data.periods ? data.periods[data.periods.length - 1] : new Date().toISOString().split('T')[0],
                    source: 'API'
                };
            }
        }
    } catch (error) {
        console.log('⚠️ No se pudo obtener ICL de API');
    }
    return null;
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };
    }

    try {
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'No autorizado' })
            };
        }

        // Intentar obtener valores manuales desde el frontend (vía query string)
        const manualIpc = event.queryStringParameters?.ipc;
        const manualIcl = event.queryStringParameters?.icl;
        
        let ipc, icl;
        
        // Si se pasaron valores manuales, usarlos
        if (manualIpc && manualIcl) {
            ipc = {
                monthly: parseFloat(manualIpc),
                yearly: 0,
                date: new Date().toISOString().split('T')[0],
                source: 'MANUAL'
            };
            icl = {
                monthly: parseFloat(manualIcl),
                date: new Date().toISOString().split('T')[0],
                source: 'MANUAL'
            };
            console.log(`📊 Usando valores manuales: IPC ${ipc.monthly}%, ICL ${icl.monthly}%`);
        } else {
            // Intentar obtener de API
            let ipcAPI = await obtenerIPC_API();
            let iclAPI = await obtenerICL_API();
            
            if (ipcAPI) {
                ipc = ipcAPI;
                ipc.source = 'API';
            } else {
                ipc = {
                    monthly: VALORES_DEFECTO.ipc.monthly,
                    yearly: VALORES_DEFECTO.ipc.yearly,
                    date: VALORES_DEFECTO.ipc.date,
                    source: 'DEFAULT'
                };
            }
            
            if (iclAPI) {
                icl = iclAPI;
                icl.source = 'API';
            } else {
                icl = {
                    monthly: VALORES_DEFECTO.icl.monthly,
                    date: VALORES_DEFECTO.icl.date,
                    source: 'DEFAULT'
                };
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ipc,
                icl,
                updatedAt: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Error en indices:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Error obteniendo índices',
                details: error.message
            })
        };
    }
};