// netlify/functions/owner-reports.js
const { getDb } = require('./db/config');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const sql = getDb();

        // Consulta de sólo lectura que agrupa contratos activos por propietario
        const reports = await sql`
            SELECT 
                o.id as owner_id,
                o.name as owner_name,
                o.dni as owner_dni,
                o.bank_account as owner_bank_account,
                COUNT(DISTINCT p.id) as total_properties,
                COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END) as active_contracts_count,
                COALESCE(SUM(CASE WHEN c.status = 'active' THEN c.base_amount ELSE 0 END), 0) as gross_rent,
                COALESCE(SUM(CASE WHEN c.status = 'active' THEN (c.base_amount * (COALESCE(c.agent_commission, 5) / 100)) ELSE 0 END), 0) as total_commission,
                COALESCE(SUM(CASE WHEN c.status = 'active' THEN (c.base_amount * (1 - (COALESCE(c.agent_commission, 5) / 100))) ELSE 0 END), 0) as net_payable,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'contract_id', c.id,
                            'tenant_name', t.name,
                            'property_address', p.address,
                            'base_amount', c.base_amount,
                            'commission_rate', c.agent_commission,
                            'status', c.status
                        )
                    ) FILTER (WHERE c.id IS NOT NULL AND c.status = 'active'), 
                    '[]'::json
                ) as active_contracts
            FROM owners o
            LEFT JOIN properties p ON o.id = p.owner_id
            LEFT JOIN contracts c ON o.id = c.owner_id
            LEFT JOIN tenants t ON c.tenant_id = t.id
            GROUP BY o.id, o.name, o.dni, o.bank_account
            ORDER BY o.name ASC;
        `;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(reports)
        };

    } catch (error) {
        console.error('❌ Error en netlify/functions/owner-reports.js:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Error interno al generar reporte de propietarios' })
        };
    }
};