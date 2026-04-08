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

    try {
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return {
                statusCode: 401,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'No autorizado' })
            };
        }

        const sql = getDb();
        console.log('✅ Conectado a Neon DB para owner-reports');

        if (event.httpMethod === 'GET') {
            console.log('📋 GET owner reports');
            const reports = await sql`
                SELECT * FROM owner_report 
                ORDER BY owner_name ASC
            `;
            
            // fetch detailed properties for each owner if specified in query, or just fetch all
            // To make it easy, we will fetch contracts details for reporting
            const allContracts = await sql`
                SELECT c.id, c.owner_id, c.property_address, c.base_amount, c.agent_commission, t.name as tenant_name
                FROM contracts c
                LEFT JOIN tenants t ON c.tenant_id = t.id
                WHERE c.status = 'active'
            `;

            const enhancedReports = reports.map(report => {
                const properties = allContracts.filter(c => c.owner_id === report.owner_id);
                return {
                    ...report,
                    properties
                };
            });

            console.log(`✅ Reports returned for ${enhancedReports.length} owners`);
            return {
                statusCode: 200,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(enhancedReports)
            };
        } else {
            return {
                statusCode: 405,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Método no permitido' })
            };
        }
    } catch (error) {
        console.error('🔴 Error en owner-reports:', error);
        return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: 'Error interno del servidor',
                details: error.message
            })
        };
    }
};
