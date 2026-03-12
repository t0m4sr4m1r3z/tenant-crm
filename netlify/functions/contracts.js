const { getDb } = require('./db/config');

function calculateNextIncreaseDate(startDate, increaseFrequency, lastIncreaseDate = null) {
    try {
        const baseDate = lastIncreaseDate ? new Date(lastIncreaseDate) : new Date(startDate);
        const nextDate = new Date(baseDate);
        nextDate.setMonth(nextDate.getMonth() + parseInt(increaseFrequency));
        return nextDate.toISOString().split('T')[0];
    } catch (error) {
        console.error('Error calculando fecha:', error);
        return null;
    }
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        console.log('📄 Contracts function called with method:', event.httpMethod);

        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return {
                statusCode: 401,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'No autorizado' })
            };
        }

        const sql = getDb();
        console.log('✅ Conectado a Neon DB');

        switch (event.httpMethod) {
            case 'GET':
                console.log('📋 GET all contracts');
                const contracts = await sql`
                    SELECT 
                        c.*,
                        t.name as tenant_name,
                        t.email as tenant_email,
                        t.dni as tenant_dni
                    FROM contracts c
                    LEFT JOIN tenants t ON c.tenant_id = t.id
                    ORDER BY c.created_at DESC
                `;
                console.log(`✅ Encontrados ${contracts.length} contratos`);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(contracts)
                };

            case 'POST':
                console.log('📝 POST new contract');
                const newContract = JSON.parse(event.body);
                
                if (!newContract.tenantId) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'El inquilino es requerido' })
                    };
                }
                
                const startDate = new Date(newContract.startDate);
                const endDate = new Date(startDate);
                endDate.setMonth(endDate.getMonth() + parseInt(newContract.duration));
                
                const nextIncreaseDate = calculateNextIncreaseDate(
                    newContract.startDate,
                    newContract.increaseFrequency || 12
                );
                
                const result = await sql`
                    INSERT INTO contracts (
                        tenant_id, owner, property_address, base_amount,
                        duration, start_date, end_date, increase_type,
                        increase_value, increase_frequency, next_increase_date,
                        agent_commission, status
                    ) VALUES (
                        ${newContract.tenantId},
                        ${newContract.owner || ''},
                        ${newContract.propertyAddress || null},
                        ${newContract.baseAmount},
                        ${newContract.duration},
                        ${startDate.toISOString().split('T')[0]},
                        ${endDate.toISOString().split('T')[0]},
                        ${newContract.increaseType || 'fixed'},
                        ${newContract.increaseValue || null},
                        ${newContract.increaseFrequency || 12},
                        ${nextIncreaseDate},
                        ${newContract.agentCommission || 5},
                        ${newContract.status || 'active'}
                    ) RETURNING *
                `;
                
                console.log('✅ Contrato creado:', result[0].id);
                return {
                    statusCode: 201,
                    headers,
                    body: JSON.stringify(result[0])
                };

            case 'PUT':
                console.log('📝 PUT update contract');
                const updateData = JSON.parse(event.body);
                
                if (!updateData.id) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'ID de contrato no proporcionado' })
                    };
                }
                
                // Construir consulta según si cambia la fecha o no
                let query;
                let values;
                
                if (updateData.startDate) {
                    const startDate = new Date(updateData.startDate);
                    const endDate = new Date(startDate);
                    endDate.setMonth(endDate.getMonth() + parseInt(updateData.duration));
                    const nextIncreaseDate = calculateNextIncreaseDate(
                        updateData.startDate,
                        updateData.increaseFrequency || 12
                    );
                    
                    query = `
                        UPDATE contracts 
                        SET 
                            tenant_id = $1,
                            owner = $2,
                            property_address = $3,
                            base_amount = $4,
                            duration = $5,
                            start_date = $6,
                            end_date = $7,
                            increase_type = $8,
                            increase_value = $9,
                            increase_frequency = $10,
                            next_increase_date = $11,
                            agent_commission = $12,
                            status = $13,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $14
                        RETURNING *
                    `;
                    
                    values = [
                        updateData.tenantId,
                        updateData.owner || '',
                        updateData.propertyAddress || null,
                        updateData.baseAmount,
                        updateData.duration,
                        updateData.startDate,
                        endDate.toISOString().split('T')[0],
                        updateData.increaseType || 'fixed',
                        updateData.increaseValue || null,
                        updateData.increaseFrequency || 12,
                        nextIncreaseDate,
                        updateData.agentCommission || 5,
                        updateData.status || 'active',
                        updateData.id
                    ];
                } else {
                    query = `
                        UPDATE contracts 
                        SET 
                            tenant_id = $1,
                            owner = $2,
                            property_address = $3,
                            base_amount = $4,
                            duration = $5,
                            increase_type = $6,
                            increase_value = $7,
                            increase_frequency = $8,
                            agent_commission = $9,
                            status = $10,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $11
                        RETURNING *
                    `;
                    
                    values = [
                        updateData.tenantId,
                        updateData.owner || '',
                        updateData.propertyAddress || null,
                        updateData.baseAmount,
                        updateData.duration,
                        updateData.increaseType || 'fixed',
                        updateData.increaseValue || null,
                        updateData.increaseFrequency || 12,
                        updateData.agentCommission || 5,
                        updateData.status || 'active',
                        updateData.id
                    ];
                }
                
                console.log('Ejecutando query...');
                const updated = await sql(query, values);
                
                console.log('✅ Contrato actualizado:', updated[0].id);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(updated[0])
                };

            case 'DELETE':
                const id = event.queryStringParameters.id;
                if (!id) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'ID no proporcionado' })
                    };
                }
                
                await sql`DELETE FROM contracts WHERE id = ${id}`;
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: true })
                };

            default:
                return {
                    statusCode: 405,
                    headers,
                    body: JSON.stringify({ error: 'Método no permitido' })
                };
        }
    } catch (error) {
        console.error('🔴 Error en contracts:', error);
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