// netlify/functions/tenants.js
const { getDb } = require('./db/config');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const sql = getDb();

        // 1. Auto-migración tabla tenants
        await sql`
            CREATE TABLE IF NOT EXISTS tenants (
                id SERIAL PRIMARY KEY,
                dni VARCHAR(50),
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                address VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ========================================================
        // GET: Listar inquilinos
        // ========================================================
        if (event.httpMethod === 'GET') {
            const tenants = await sql`
                SELECT 
                    t.*,
                    COUNT(c.id) as total_contracts
                FROM tenants t
                LEFT JOIN contracts c ON t.id = c.tenant_id
                GROUP BY t.id
                ORDER BY t.name ASC;
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(tenants)
            };
        }

        // ========================================================
        // POST: Crear inquilino
        // ========================================================
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { dni, name, email, phone, address } = body;

            if (!name || !name.trim()) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'El nombre completo es obligatorio' })
                };
            }

            const nuevo = await sql`
                INSERT INTO tenants (dni, name, email, phone, address, updated_at)
                VALUES (
                    ${dni ? dni.trim() : null},
                    ${name.trim()},
                    ${email ? email.trim() : null},
                    ${phone ? phone.trim() : null},
                    ${address ? address.trim() : null},
                    NOW()
                )
                RETURNING *;
            `;

            return {
                statusCode: 201,
                headers,
                body: JSON.stringify(nuevo[0])
            };
        }

        // ========================================================
        // PUT: Actualizar inquilino
        // ========================================================
        if (event.httpMethod === 'PUT') {
            const body = JSON.parse(event.body || '{}');
            const { id, dni, name, email, phone, address } = body;

            if (!id || !name) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID y Nombre son obligatorios' })
                };
            }

            const actualizado = await sql`
                UPDATE tenants
                SET 
                    dni = ${dni ? dni.trim() : null},
                    name = ${name.trim()},
                    email = ${email ? email.trim() : null},
                    phone = ${phone ? phone.trim() : null},
                    address = ${address ? address.trim() : null},
                    updated_at = NOW()
                WHERE id = ${id}
                RETURNING *;
            `;

            if (actualizado.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Inquilino no encontrado' })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(actualizado[0])
            };
        }

        // ========================================================
        // DELETE: Borrado seguro con verificación de contratos
        // ========================================================
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID de inquilino requerido' })
                };
            }

            // Validar si tiene contratos vinculados
            const contratos = await sql`
                SELECT COUNT(*) as count FROM contracts WHERE tenant_id = ${id};
            `;
            const count = parseInt(contratos[0].count, 10);

            if (count > 0) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: `No puedes eliminar este inquilino porque tiene ${count} contrato(s) asociado(s). Elimina o reasigna sus contratos primero.` 
                    })
                };
            }

            await sql`DELETE FROM tenants WHERE id = ${id};`;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'Inquilino eliminado correctamente' })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };

    } catch (error) {
        console.error('❌ Error en netlify/functions/tenants.js:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Error interno del servidor' })
        };
    }
};