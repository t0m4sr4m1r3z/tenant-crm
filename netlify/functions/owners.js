// netlify/functions/owners.js
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

        // 1. Auto-migración tabla owners
        await sql`
            CREATE TABLE IF NOT EXISTS owners (
                id SERIAL PRIMARY KEY,
                dni VARCHAR(50),
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                address VARCHAR(255),
                bank_account VARCHAR(100),
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await sql`ALTER TABLE owners ADD COLUMN IF NOT EXISTS dni VARCHAR(50);`;
        await sql`ALTER TABLE owners ADD COLUMN IF NOT EXISTS bank_account VARCHAR(100);`;
        await sql`ALTER TABLE owners ADD COLUMN IF NOT EXISTS notes TEXT;`;

        // ========================================================
        // GET: Listar propietarios con resumen de contratos e ingresos
        // ========================================================
        if (event.httpMethod === 'GET') {
            const ownerId = event.queryStringParameters?.id;

            // Si se piden las propiedades de un propietario específico
            if (ownerId && event.queryStringParameters?.properties === 'true') {
                const props = await sql`
                    SELECT 
                        p.*,
                        c.id as contract_id,
                        c.base_amount,
                        c.status as contract_status,
                        t.name as tenant_name
                    FROM properties p
                    LEFT JOIN contracts c ON p.id = c.property_id AND c.status = 'active'
                    LEFT JOIN tenants t ON c.tenant_id = t.id
                    WHERE p.owner_id = ${ownerId}
                    ORDER BY p.address ASC;
                `;
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(props)
                };
            }

            const owners = await sql`
                SELECT 
                    o.*,
                    COUNT(DISTINCT c.id) as contracts_count,
                    COALESCE(SUM(CASE WHEN c.status = 'active' THEN c.base_amount ELSE 0 END), 0) as total_income
                FROM owners o
                LEFT JOIN contracts c ON o.id = c.owner_id
                GROUP BY o.id
                ORDER BY o.name ASC;
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(owners)
            };
        }

        // ========================================================
        // POST: Crear propietario
        // ========================================================
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { dni, name, email, phone, address, bank_account, notes } = body;

            if (!name || !name.trim()) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'El nombre completo es obligatorio' })
                };
            }

            const nuevo = await sql`
                INSERT INTO owners (dni, name, email, phone, address, bank_account, notes, updated_at)
                VALUES (
                    ${dni ? dni.trim() : null},
                    ${name.trim()},
                    ${email ? email.trim() : null},
                    ${phone ? phone.trim() : null},
                    ${address ? address.trim() : null},
                    ${bank_account ? bank_account.trim() : null},
                    ${notes ? notes.trim() : null},
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
        // PUT: Actualizar propietario
        // ========================================================
        if (event.httpMethod === 'PUT') {
            const body = JSON.parse(event.body || '{}');
            const { id, dni, name, email, phone, address, bank_account, notes } = body;

            if (!id || !name) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID y Nombre son obligatorios' })
                };
            }

            const actualizado = await sql`
                UPDATE owners
                SET 
                    dni = ${dni ? dni.trim() : null},
                    name = ${name.trim()},
                    email = ${email ? email.trim() : null},
                    phone = ${phone ? phone.trim() : null},
                    address = ${address ? address.trim() : null},
                    bank_account = ${bank_account ? bank_account.trim() : null},
                    notes = ${notes ? notes.trim() : null},
                    updated_at = NOW()
                WHERE id = ${id}
                RETURNING *;
            `;

            if (actualizado.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Propietario no encontrado' })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(actualizado[0])
            };
        }

        // ========================================================
        // DELETE: Borrado seguro con verificación de contratos y propiedades
        // ========================================================
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID de propietario requerido' })
                };
            }

            // Validar contratos
            const contratos = await sql`SELECT COUNT(*) as count FROM contracts WHERE owner_id = ${id};`;
            const countContracts = parseInt(contratos[0].count, 10);

            // Validar propiedades
            const propiedades = await sql`SELECT COUNT(*) as count FROM properties WHERE owner_id = ${id};`;
            const countProperties = parseInt(propiedades[0].count, 10);

            if (countContracts > 0 || countProperties > 0) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: `No puedes eliminar este propietario porque tiene ${countProperties} propiedad(es) y ${countContracts} contrato(s) vinculados. Debes reasignarlos o eliminarlos primero.` 
                    })
                };
            }

            await sql`DELETE FROM owners WHERE id = ${id};`;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'Propietario eliminado correctamente' })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };

    } catch (error) {
        console.error('❌ Error en netlify/functions/owners.js:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Error interno del servidor' })
        };
    }
};