const { getDb } = require('./db/config');

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

        const sql = getDb();
        
        // Versión corregida sin EXTRACT
        const delinquent = await sql`
            SELECT 
                p.id,
                p.contract_id,
                p.amount,
                p.total_amount,
                p.due_date,
                p.status,
                t.name as tenant_name,
                c.owner as owner_name,
                (CURRENT_DATE - p.due_date) as days_overdue
            FROM payments p
            LEFT JOIN contracts c ON p.contract_id = c.id
            LEFT JOIN tenants t ON c.tenant_id = t.id
            WHERE p.status = 'pending' 
            AND p.due_date < CURRENT_DATE
            ORDER BY p.due_date ASC
        `;
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(delinquent)
        };

    } catch (error) {
        console.error('Error en delinquency:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Error interno del servidor',
                details: error.message
            })
        };
    }
};