const { getDb } = require('./db/config');

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
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'No autorizado' })
            };
        }

        const sql = getDb();
        console.log('💰 Payments function called with method:', event.httpMethod);

        switch (event.httpMethod) {
            case 'GET':
                const payments = await sql`
                    SELECT 
                        p.*,
                        t.name as tenant_name,
                        t.email as tenant_email,
                        t.dni as tenant_dni,
                        c.owner as owner_name,
                        pc.name as concept_name
                    FROM payments p
                    LEFT JOIN contracts c ON p.contract_id = c.id
                    LEFT JOIN tenants t ON c.tenant_id = t.id
                    LEFT JOIN payment_concepts pc ON p.concept_id = pc.id
                    ORDER BY p.due_date DESC
                    LIMIT 100
                `;
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(payments)
                };

            case 'POST':
                console.log('📝 Recibiendo POST de pago');
                const newPayment = JSON.parse(event.body);
                
                if (!newPayment.contract_id || !newPayment.amount || !newPayment.due_date) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'Faltan datos requeridos' })
                    };
                }
                
                const amount = parseFloat(newPayment.amount);
                const commission = parseFloat(newPayment.commission) || 0;
                const totalAmount = amount + commission;
                
                // Calcular período (por defecto el mes de la fecha de vencimiento)
                const dueDate = new Date(newPayment.due_date);
                const periodStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1).toISOString().split('T')[0];
                const periodEnd = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).toISOString().split('T')[0];
                
                const result = await sql`
                    INSERT INTO payments (
                        contract_id, 
                        concept_id, 
                        amount, 
                        commission, 
                        total_amount,
                        due_date, 
                        period_start, 
                        period_end,
                        payment_method, 
                        reference_number, 
                        status, 
                        paid_at
                    ) VALUES (
                        ${newPayment.contract_id},
                        ${newPayment.concept_id || 1},
                        ${amount},
                        ${commission},
                        ${totalAmount},
                        ${newPayment.due_date},
                        ${periodStart},
                        ${periodEnd},
                        ${newPayment.payment_method || 'efectivo'},
                        ${newPayment.reference_number || null},
                        ${newPayment.payment_date ? 'paid' : 'pending'},
                        ${newPayment.payment_date ? new Date() : null}
                    ) RETURNING *
                `;
                
                console.log('✅ Pago creado:', result[0]);
                
                return {
                    statusCode: 201,
                    headers,
                    body: JSON.stringify(result[0])
                };

            case 'PUT':
                const updateData = JSON.parse(event.body);
                
                if (!updateData.id) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'ID de pago requerido' })
                    };
                }
                
                const updated = await sql`
                    UPDATE payments 
                    SET 
                        status = ${updateData.status || 'paid'},
                        payment_method = COALESCE(${updateData.payment_method}, payment_method),
                        reference_number = COALESCE(${updateData.reference_number}, reference_number),
                        paid_at = ${updateData.status === 'paid' ? new Date() : null},
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ${updateData.id}
                    RETURNING *
                `;
                
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
                        body: JSON.stringify({ error: 'ID requerido' })
                    };
                }
                
                await sql`DELETE FROM payments WHERE id = ${id}`;
                
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
        console.error('❌ Error en payments:', error);
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