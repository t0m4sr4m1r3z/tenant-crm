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

        // 1. Asegurar la existencia de tablas relacionadas para que los JOIN no fallen
        await sql`CREATE TABLE IF NOT EXISTS tenants (id SERIAL PRIMARY KEY, name VARCHAR(255));`;
        await sql`CREATE TABLE IF NOT EXISTS owners (id SERIAL PRIMARY KEY, name VARCHAR(255));`;
        await sql`CREATE TABLE IF NOT EXISTS properties (id SERIAL PRIMARY KEY, address VARCHAR(255), type VARCHAR(50));`;

        // 2. Asegurar la tabla base de contracts
        await sql`
            CREATE TABLE IF NOT EXISTS contracts (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL,
                owner_id INTEGER NOT NULL,
                property_id INTEGER
            );
        `;

        // 3. Auto-migración: Asegurar todas las columnas necesarias
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS property_id INTEGER;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS reference_date DATE;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 24;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS base_amount NUMERIC(12, 2) DEFAULT 0;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS increase_type VARCHAR(20) DEFAULT 'fixed';`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS increase_value NUMERIC(8, 2) DEFAULT 0;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS increase_frequency INTEGER DEFAULT 12;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS agent_commission NUMERIC(5, 2) DEFAULT 5;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS next_increase_date DATE;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`;

        // Si end_date tuviera una restricción NOT NULL de un schema viejo, removerla de forma segura
        try {
            await sql`ALTER TABLE contracts ALTER COLUMN end_date DROP NOT NULL;`;
        } catch (e) {}

        // Funciones de cálculo de fechas (sin desfasaje horario)
        const calcularFechaFin = (fechaInicioStr, duracionMeses) => {
            if (!fechaInicioStr) return null;
            const dur = parseInt(duracionMeses, 10) || 24;
            const parts = fechaInicioStr.slice(0, 10).split('-').map(Number);
            if (parts.length !== 3) return null;
            const fecha = new Date(parts[0], parts[1] - 1, parts[2]);
            fecha.setMonth(fecha.getMonth() + dur);
            const y = fecha.getFullYear();
            const m = String(fecha.getMonth() + 1).padStart(2, '0');
            const d = String(fecha.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const calcularProximoAumento = (fechaInicioStr, frecuenciaMeses) => {
            if (!fechaInicioStr || !frecuenciaMeses) return null;
            const freq = parseInt(frecuenciaMeses, 10) || 12;
            const parts = fechaInicioStr.slice(0, 10).split('-').map(Number);
            if (parts.length !== 3) return null;

            let fecha = new Date(parts[0], parts[1] - 1, parts[2]);
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            // Sumar siempre al menos 1 ciclo de aumento
            fecha.setMonth(fecha.getMonth() + freq);

            // Si todavía queda en el pasado respecto a hoy, avanzar hasta el próximo ciclo futuro
            while (fecha <= hoy) {
                fecha.setMonth(fecha.getMonth() + freq);
            }

            const y = fecha.getFullYear();
            const m = String(fecha.getMonth() + 1).padStart(2, '0');
            const d = String(fecha.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        // ========================================================
        // GET: Listar todos los contratos con texto plano en fechas
        // ========================================================
        if (event.httpMethod === 'GET') {
            const contracts = await sql`
                SELECT 
                    c.id,
                    c.tenant_id,
                    c.owner_id,
                    c.property_id,
                    c.start_date::TEXT as start_date,
                    c.end_date::TEXT as end_date,
                    c.reference_date::TEXT as reference_date,
                    c.duration,
                    c.base_amount,
                    c.increase_type,
                    c.increase_value,
                    c.increase_frequency,
                    c.agent_commission,
                    c.status,
                    c.next_increase_date::TEXT as next_increase_date,
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
                    body: JSON.stringify({ error: 'Faltan campos obligatorios (Inquilino, Propietario, Fecha de Inicio o Monto Base)' })
                };
            }

            const cleanStartDate = String(start_date).slice(0, 10);
            const cleanReferenceDate = (reference_date && String(reference_date).trim() !== '') ? String(reference_date).slice(0, 10) : null;
            const dur = parseInt(duration, 10) || 24;
            const freq = parseInt(increase_frequency, 10) || 12;

            const endDate = calcularFechaFin(cleanStartDate, dur);
            const nextIncreaseDate = calcularProximoAumento(cleanStartDate, freq);

            const nuevo = await sql`
                INSERT INTO contracts (
                    tenant_id,
                    owner_id,
                    property_id,
                    start_date,
                    end_date,
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
                    created_at,
                    updated_at
                ) VALUES (
                    ${parseInt(tenant_id, 10)},
                    ${parseInt(owner_id, 10)},
                    ${property_id ? parseInt(property_id, 10) : null},
                    ${cleanStartDate}::DATE,
                    ${endDate ? endDate : null}::DATE,
                    ${cleanReferenceDate ? cleanReferenceDate : null}::DATE,
                    ${dur},
                    ${parseFloat(base_amount)},
                    ${increase_type || 'fixed'},
                    ${parseFloat(increase_value) || 0},
                    ${freq},
                    ${parseFloat(agent_commission) || 5},
                    ${status || 'active'},
                    ${nextIncreaseDate ? nextIncreaseDate : null}::DATE,
                    ${JSON.stringify(documents || [])}::jsonb,
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
                    WHERE id = ${parseInt(id, 10)}
                    RETURNING *;
                `;
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(actualizado[0])
                };
            }

            const cleanStartDate = String(body.start_date).slice(0, 10);
            const cleanReferenceDate = (body.reference_date && String(body.reference_date).trim() !== '') ? String(body.reference_date).slice(0, 10) : null;
            const dur = parseInt(body.duration, 10) || 24;
            const freq = parseInt(body.increase_frequency, 10) || 12;

            const endDate = calcularFechaFin(cleanStartDate, dur);
            const nextIncreaseDate = calcularProximoAumento(cleanStartDate, freq);

            const actualizado = await sql`
                UPDATE contracts
                SET 
                    tenant_id = ${parseInt(body.tenant_id, 10)},
                    owner_id = ${parseInt(body.owner_id, 10)},
                    property_id = ${body.property_id ? parseInt(body.property_id, 10) : null},
                    start_date = ${cleanStartDate}::DATE,
                    end_date = ${endDate ? endDate : null}::DATE,
                    reference_date = ${cleanReferenceDate ? cleanReferenceDate : null}::DATE,
                    duration = ${dur},
                    base_amount = ${parseFloat(body.base_amount)},
                    increase_type = ${body.increase_type || 'fixed'},
                    increase_value = ${parseFloat(body.increase_value) || 0},
                    increase_frequency = ${freq},
                    agent_commission = ${parseFloat(body.agent_commission) || 5},
                    status = ${body.status || 'active'},
                    next_increase_date = ${nextIncreaseDate ? nextIncreaseDate : null}::DATE,
                    documents = ${JSON.stringify(body.documents || [])}::jsonb,
                    updated_at = NOW()
                WHERE id = ${parseInt(id, 10)}
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

            await sql`DELETE FROM contracts WHERE id = ${parseInt(id, 10)};`;

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