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

        // 1. Asegurar tabla base de inquilinos
        await sql`
            CREATE TABLE IF NOT EXISTS tenants (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL
            );
        `;

        // 2. Auto-migración: Asegurar todas las columnas faltantes
        await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS dni VARCHAR(50);`;
        await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email VARCHAR(255);`;
        await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`;
        await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address VARCHAR(255);`;
        await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`;
        await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`;

        // Asegurar que exista contracts para el LEFT JOIN de contratos
        await sql`CREATE TABLE IF NOT EXISTS contracts (id SERIAL PRIMARY KEY, tenant_id INTEGER);`;

        // ========================================================
        // GET: Listar inquilinos
        // ========================================================
        if (event.httpMethod === 'GET') {
            const tenants = await sql`
                SELECT 
                    t.id,
                    t.dni,
                    t.name,
                    t.email,
                    t.phone,
                    t.address,
                    t.created_at,
                    t.updated_at,
                    COUNT(c.id) as total_contracts
                FROM tenants t
                LEFT JOIN contracts c ON t.id = c.tenant_id
                GROUP BY t.id, t.dni, t.name, t.email, t.phone, t.address, t.created_at, t.updated_at
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

            const cleanDni = dni && String(dni).trim() !== '' ? String(dni).trim() : null;
            const cleanEmail = email && String(email).trim() !== '' ? String(email).trim() : null;
            const cleanPhone = phone && String(phone).trim() !== '' ? String(phone).trim() : null;
            const cleanAddress = address && String(address).trim() !== '' ? String(address).trim() : null;

            const nuevo = await sql`
                INSERT INTO tenants (
                    dni, name, email, phone, address, created_at, updated_at
                ) VALUES (
                    ${cleanDni},
                    ${name.trim()},
                    ${cleanEmail},
                    ${cleanPhone},
                    ${cleanAddress},
                    NOW(),
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

            if (!id || !name || !name.trim()) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID y Nombre son obligatorios' })
                };
            }

            const cleanDni = dni && String(dni).trim() !== '' ? String(dni).trim() : null;
            const cleanEmail = email && String(email).trim() !== '' ? String(email).trim() : null;
            const cleanPhone = phone && String(phone).trim() !== '' ? String(phone).trim() : null;
            const cleanAddress = address && String(address).trim() !== '' ? String(address).trim() : null;

            const actualizado = await sql`
                UPDATE tenants
                SET 
                    dni = ${cleanDni},
                    name = ${name.trim()},
                    email = ${cleanEmail},
                    phone = ${cleanPhone},
                    address = ${cleanAddress},
                    updated_at = NOW()
                WHERE id = ${parseInt(id, 10)}
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

            const tenantId = parseInt(id, 10);

            // Validar si tiene contratos vinculados
            try {
                const contratos = await sql`
                    SELECT COUNT(*) as count FROM contracts WHERE tenant_id = ${tenantId};
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
            } catch (checkErr) {
                console.warn('Advertencia verificando contratos:', checkErr.message);
            }

            await sql`DELETE FROM tenants WHERE id = ${tenantId};`;

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