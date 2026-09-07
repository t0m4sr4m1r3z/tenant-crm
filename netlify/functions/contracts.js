// netlify/functions/contracts.js
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

        // 1. Auto-creación y auto-migración de la tabla contracts
        await sql`
            CREATE TABLE IF NOT EXISTS contracts (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL,
                owner_id INTEGER NOT NULL,
                property_id INTEGER,
                start_date DATE NOT NULL,
                reference_date DATE,
                duration INTEGER NOT NULL DEFAULT 24,
                base_amount NUMERIC(12, 2) NOT NULL,
                increase_type VARCHAR(20) DEFAULT 'fixed',
                increase_value NUMERIC(8, 2) DEFAULT 0,
                increase_frequency INTEGER DEFAULT 12,
                agent_commission NUMERIC(5, 2) DEFAULT 5,
                status VARCHAR(20) DEFAULT 'active',
                next_increase_date DATE,
                documents JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Columnas añadidas dinámicamente si la tabla ya existía
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS property_id INTEGER;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS reference_date DATE;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS next_increase_date DATE;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS agent_commission NUMERIC(5, 2) DEFAULT 5;`;

        // ========================================================
        // GET: Listar todos los contratos con sus relaciones
        // ========================================================
        if (event.httpMethod === 'GET') {
            const contracts = await sql`
                SELECT 
                    c.id,
                    c.tenant_id,
                    c.owner_id,
                    c.property_id,
                    c.start_date,
                    c.reference_date,
                    c.duration,
                    c.base_amount,
                    c.increase_type,
                    c.increase_value,
                    c.increase_frequency,
                    c.agent_commission,
                    c.status,
                    c.next_increase_date,
                    COALESCE(c.documents, '[]'::jsonb) as documents,
                    t.name as tenant_name,
                    t.dni as tenant_dni,
                    t.email as tenant_email,
                    t.phone as tenant_phone,
                    o.name as owner_name,
                    o.dni as owner_dni,
                    p.address as property_address,
                    p.type as property_type
                FROM contracts c
                LEFT JOIN tenants t ON c.tenant_id = t.id
                LEFT JOIN owners o ON c.owner_id = o.id
                LEFT JOIN properties p ON c.property_id = p.id
                ORDER BY c.id DESC;
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(contracts)
            };
        }

        // Función auxiliar para calcular la fecha del próximo aumento
        const calcularProximoAumento = (fechaInicioStr, frecuenciaMeses) => {
            if (!fechaInicioStr || !frecuenciaMeses) return null;
            const hoy = new Date();
            let fecha = new Date(fechaInicioStr);
            const freq = parseInt(frecuenciaMeses, 10) || 12;

            // Avanzar en intervalos de "freq" meses hasta encontrar una fecha futura
            while (fecha <= hoy) {
                fecha.setMonth(fecha.getMonth() + freq);
            }
            return fecha.toISOString().split('T')[0];
        };

        // ========================================================
        // POST: Crear nuevo contrato
        // ========================================================
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const {
                tenant_id,
                owner_id,
                property_id,
                start_date,
                reference_date,
                duration,
                base_amount,
                increase_type,
                increase_value,
                increase_frequency,
                agent_commission,
                status,
                documents
            } = body;

            if (!tenant_id || !owner_id || !start_date || !base_amount) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Faltan campos obligatorios' })
                };
            }

            const nextIncreaseDate = calcularProximoAumento(start_date, increase_frequency);

            const nuevo = await sql`
                INSERT INTO contracts (
                    tenant_id,
                    owner_id,
                    property_id,
                    start_date,
                    reference_date,
                    duration,
                    base_amount,
                    increase_type,
                    increase_value,
                    increase_frequency,
                    agent_commission,
                    status,
                    next_increase_date,
                    documents,
                    updated_at
                ) VALUES (
                    ${tenant_id},
                    ${owner_id},
                    ${property_id || null},
                    ${start_date}::DATE,
                    ${reference_date ? reference_date : null}::DATE,
                    ${parseInt(duration) || 24},
                    ${parseFloat(base_amount)},
                    ${increase_type || 'fixed'},
                    ${parseFloat(increase_value) || 0},
                    ${parseInt(increase_frequency) || 12},
                    ${parseFloat(agent_commission) || 5},
                    ${status || 'active'},
                    ${nextIncreaseDate}::DATE,
                    ${JSON.stringify(documents || [])}::jsonb,
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
        // PUT: Actualizar contrato existente
        // ========================================================
        if (event.httpMethod === 'PUT') {
            const body = JSON.parse(event.body || '{}');
            const { id } = body;

            if (!id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID de contrato requerido' })
                };
            }

            // Si solo se actualiza el monto base (desde calcular aumento)
            if (body.base_amount && Object.keys(body).length === 2) {
                const actualizado = await sql`
                    UPDATE contracts
                    SET base_amount = ${parseFloat(body.base_amount)}, updated_at = NOW()
                    WHERE id = ${id}
                    RETURNING *;
                `;
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(actualizado[0])
                };
            }

            const nextIncreaseDate = calcularProximoAumento(body.start_date, body.increase_frequency);

            const actualizado = await sql`
                UPDATE contracts
                SET 
                    tenant_id = ${body.tenant_id},
                    owner_id = ${body.owner_id},
                    property_id = ${body.property_id || null},
                    start_date = ${body.start_date}::DATE,
                    reference_date = ${body.reference_date ? body.reference_date : null}::DATE,
                    duration = ${parseInt(body.duration) || 24},
                    base_amount = ${parseFloat(body.base_amount)},
                    increase_type = ${body.increase_type || 'fixed'},
                    increase_value = ${parseFloat(body.increase_value) || 0},
                    increase_frequency = ${parseInt(body.increase_frequency) || 12},
                    agent_commission = ${parseFloat(body.agent_commission) || 5},
                    status = ${body.status || 'active'},
                    next_increase_date = ${nextIncreaseDate}::DATE,
                    documents = ${JSON.stringify(body.documents || [])}::jsonb,
                    updated_at = NOW()
                WHERE id = ${id}
                RETURNING *;
            `;

            if (actualizado.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Contrato no encontrado' })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(actualizado[0])
            };
        }

        // ========================================================
        // DELETE: Eliminar contrato
        // ========================================================
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID de contrato requerido' })
                };
            }

            await sql`DELETE FROM contracts WHERE id = ${id};`;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'Contrato eliminado correctamente' })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };

    } catch (error) {
        console.error('❌ Error en netlify/functions/contracts.js:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Error interno del servidor' })
        };
    }
};