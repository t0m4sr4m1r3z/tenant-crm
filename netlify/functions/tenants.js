const { getDb } = require('./db/config');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    };

    // Preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        console.log('📊 Tenants function called with method:', event.httpMethod);
        console.log('Headers:', JSON.stringify(event.headers));

        // Verificar autenticación
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            console.log('❌ No authorization header');
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
                console.log('📋 GET all tenants');
                const tenants = await sql`
                    SELECT * FROM tenants 
                    ORDER BY created_at DESC
                `;
                console.log(`✅ Encontrados ${tenants.length} inquilinos`);
                return {
                    statusCode: 200,
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(tenants)
                };

            case 'POST':
                console.log('📝 POST new tenant');
                const newTenant = JSON.parse(event.body);
                console.log('Datos:', newTenant);
                
                const result = await sql`
                    INSERT INTO tenants (
                        dni, name, email, phone, address
                    ) VALUES (
                        ${newTenant.dni},
                        ${newTenant.name},
                        ${newTenant.email},
                        ${newTenant.phone || null},
                        ${newTenant.address || null}
                    ) RETURNING *
                `;
                
                console.log('✅ Inquilino creado:', result[0].id);
                return {
                    statusCode: 201,
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(result[0])
                };

            case 'PUT':
                console.log('📝 PUT update tenant');
                const updateData = JSON.parse(event.body);
                console.log('Datos:', updateData);
                
                const updated = await sql`
                    UPDATE tenants 
                    SET 
                        dni = ${updateData.dni},
                        name = ${updateData.name},
                        email = ${updateData.email},
                        phone = ${updateData.phone},
                        address = ${updateData.address},
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ${updateData.id}
                    RETURNING *
                `;
                
                console.log('✅ Inquilino actualizado:', updateData.id);
                return {
                    statusCode: 200,
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(updated[0])
                };

            case 'DELETE':
                console.log('🗑️ DELETE tenant');
                const id = event.queryStringParameters.id;
                console.log('ID:', id);
                
                await sql`DELETE FROM tenants WHERE id = ${id}`;
                
                console.log('✅ Inquilino eliminado:', id);
                return {
                    statusCode: 200,
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true })
                };

            default:
                return {
                    statusCode: 405,
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Método no permitido' })
                };
        }
    } catch (error) {
        console.error('🔴 Error en tenants:', error);
        console.error('Stack:', error.stack);
        
        return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: 'Error interno del servidor',
                details: error.message,
                stack: error.stack
            })
        };
    }
};