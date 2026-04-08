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
        const { id, properties } = event.queryStringParameters || {};

        // ============================================
        // GET - Obtener datos
        // ============================================
        if (event.httpMethod === 'GET') {
            // Si se piden las propiedades de un propietario específico
            if (id && properties === 'true') {
                const contracts = await sql`
                    SELECT 
                        c.id,
                        c.property_address,
                        c.base_amount,
                        c.next_increase_date,
                        c.status,
                        t.id as tenant_id,
                        t.name as tenant_name,
                        t.email as tenant_email,
                        t.phone as tenant_phone
                    FROM contracts c
                    LEFT JOIN tenants t ON c.tenant_id = t.id
                    WHERE c.owner_id = ${id}
                    ORDER BY c.start_date DESC
                `;
                
                // Obtener últimos pagos para cada contrato
                for (const contract of contracts) {
                    const lastPayment = await sql`
                        SELECT paid_at, total_amount
                        FROM payments
                        WHERE contract_id = ${contract.id} AND status = 'paid'
                        ORDER BY paid_at DESC
                        LIMIT 1
                    `;
                    contract.last_payment_date = lastPayment[0]?.paid_at || null;
                }
                
                const totalIncome = contracts.reduce((sum, c) => sum + (c.base_amount || 0), 0);
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        contracts,
                        total_monthly_income: totalIncome
                    })
                };
            }
            
            // Obtener todos los propietarios
            const owners = await sql`
                SELECT 
                    o.id,
                    o.name,
                    o.email,
                    o.phone,
                    o.dni,
                    o.address,
                    o.bank_account,
                    o.notes,
                    COUNT(c.id) as total_contracts,
                    COALESCE(SUM(c.base_amount), 0) as total_income
                FROM owners o
                LEFT JOIN contracts c ON c.owner_id = o.id AND c.status = 'active'
                GROUP BY o.id
                ORDER BY o.name
            `;
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(owners)
            };
        }

        // ============================================
        // POST - Crear nuevo propietario
        // ============================================
        if (event.httpMethod === 'POST') {
            const newOwner = JSON.parse(event.body);
            
            const result = await sql`
                INSERT INTO owners (name, email, phone, dni, address, bank_account, notes)
                VALUES (${newOwner.name}, ${newOwner.email || null}, ${newOwner.phone || null}, 
                        ${newOwner.dni || null}, ${newOwner.address || null}, 
                        ${newOwner.bank_account || null}, ${newOwner.notes || null})
                RETURNING *
            `;
            
            return {
                statusCode: 201,
                headers,
                body: JSON.stringify(result[0])
            };
        }

        // ============================================
        // PUT - Actualizar propietario
        // ============================================
        if (event.httpMethod === 'PUT') {
            const updateData = JSON.parse(event.body);
            
            if (!updateData.id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID no proporcionado' })
                };
            }
            
            const result = await sql`
                UPDATE owners 
                SET 
                    name = ${updateData.name},
                    email = ${updateData.email},
                    phone = ${updateData.phone},
                    dni = ${updateData.dni},
                    address = ${updateData.address},
                    bank_account = ${updateData.bank_account},
                    notes = ${updateData.notes},
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ${updateData.id}
                RETURNING *
            `;
            
            if (result.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Propietario no encontrado' })
                };
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result[0])
            };
        }

        // ============================================
        // DELETE - Eliminar propietario
        // ============================================
        if (event.httpMethod === 'DELETE') {
            const deleteId = event.queryStringParameters.id;
            
            if (!deleteId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID no proporcionado' })
                };
            }
            
            // Verificar si el propietario existe
            const checkOwner = await sql`SELECT id FROM owners WHERE id = ${deleteId}`;
            if (checkOwner.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Propietario no encontrado' })
                };
            }
            
            // Opcional: Verificar si tiene contratos asociados
            const contracts = await sql`SELECT id FROM contracts WHERE owner_id = ${deleteId}`;
            if (contracts.length > 0) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: 'No se puede eliminar porque tiene contratos asociados',
                        contracts_count: contracts.length
                    })
                };
            }
            
            await sql`DELETE FROM owners WHERE id = ${deleteId}`;
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'Propietario eliminado' })
            };
        }

        // ============================================
        // Método no permitido
        // ============================================
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };

    } catch (error) {
        console.error('Error en owners:', error);
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