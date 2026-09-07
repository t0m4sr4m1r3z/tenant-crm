// netlify/functions/payments.js - Gestión Blindada de Pagos (Seguro para datos existentes)
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

        // 1. Asegurar la existencia de todas las tablas relacionadas para que el JOIN nunca falle
        await sql`CREATE TABLE IF NOT EXISTS tenants (id SERIAL PRIMARY KEY, name VARCHAR(255));`;
        await sql`CREATE TABLE IF NOT EXISTS owners (id SERIAL PRIMARY KEY, name VARCHAR(255));`;
        await sql`CREATE TABLE IF NOT EXISTS properties (id SERIAL PRIMARY KEY, address VARCHAR(255));`;
        await sql`CREATE TABLE IF NOT EXISTS contracts (id SERIAL PRIMARY KEY, tenant_id INTEGER, owner_id INTEGER, property_id INTEGER);`;
        await sql`CREATE TABLE IF NOT EXISTS payments (id SERIAL PRIMARY KEY, contract_id INTEGER);`;

        // 2. Asegurar columnas en tablas foráneas sin alterar datos existentes
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS property_id INTEGER;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tenant_id INTEGER;`;
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS owner_id INTEGER;`;
        await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`;
        await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS dni VARCHAR(50);`;

        // 3. Asegurar todas las columnas en la tabla payments
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS contract_id INTEGER;`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS concept VARCHAR(50) DEFAULT 'Alquiler';`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) DEFAULT 0;`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2) DEFAULT 0;`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS commission NUMERIC(12, 2) DEFAULT 0;`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS due_date DATE;`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_date DATE;`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS date DATE;`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'transferencia';`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference VARCHAR(100);`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';`;

        // ========================================================
        // GET: Consulta ultra-segura (evita errores de tipo en PostgreSQL)
        // ========================================================
        if (event.httpMethod === 'GET') {
            const hoyStr = new Date().toISOString().split('T')[0];

            const rows = await sql`
                SELECT 
                    p.id,
                    p.contract_id,
                    COALESCE(p.concept, 'Alquiler') as concept,
                    COALESCE(p.amount::TEXT, p.total_amount::TEXT, '0') as amount_raw,
                    COALESCE(p.commission::TEXT, '0') as commission_raw,
                    p.due_date::TEXT as due_date,
                    COALESCE(p.payment_date::TEXT, p.date::TEXT, NULL) as payment_date,
                    COALESCE(p.payment_method, 'transferencia') as payment_method,
                    p.reference,
                    p.notes,
                    COALESCE(p.status, 'pending') as raw_status,
                    c.tenant_id,
                    c.owner_id,
                    c.property_id,
                    t.name as tenant_name,
                    t.dni as tenant_dni,
                    t.phone as tenant_phone,
                    o.name as owner_name,
                    prop.address as property_address
                FROM payments p
                LEFT JOIN contracts c ON p.contract_id = c.id
                LEFT JOIN tenants t ON c.tenant_id = t.id
                LEFT JOIN owners o ON c.owner_id = o.id
                LEFT JOIN properties prop ON c.property_id = prop.id
                ORDER BY p.id DESC;
            `;

            // Procesamiento en JavaScript para cálculo de morosidad y formateo seguro
            const payments = rows.map(p => {
                let status = p.raw_status;
                const dueDateStr = p.due_date ? p.due_date.slice(0, 10) : null;

                if (status === 'paid') {
                    status = 'paid';
                } else if (dueDateStr && dueDateStr < hoyStr) {
                    status = 'overdue';
                } else {
                    status = 'pending';
                }

                return {
                    id: p.id,
                    contract_id: p.contract_id,
                    concept: p.concept,
                    amount: parseFloat(p.amount_raw) || 0,
                    commission: parseFloat(p.commission_raw) || 0,
                    due_date: dueDateStr,
                    payment_date: p.payment_date ? p.payment_date.slice(0, 10) : null,
                    payment_method: p.payment_method,
                    reference: p.reference,
                    notes: p.notes,
                    status: status,
                    tenant_id: p.tenant_id,
                    owner_id: p.owner_id,
                    property_id: p.property_id,
                    tenant_name: p.tenant_name,
                    tenant_dni: p.tenant_dni,
                    tenant_phone: p.tenant_phone,
                    owner_name: p.owner_name,
                    property_address: p.property_address
                };
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(payments)
            };
        }

        // ========================================================
        // POST: Registrar nuevo pago
        // ========================================================
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const {
                contract_id,
                concept,
                amount,
                commission,
                due_date,
                payment_date,
                payment_method,
                reference,
                notes,
                status
            } = body;

            if (!contract_id || amount === undefined || !due_date) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Contrato, Monto y Fecha de Vencimiento son requeridos' })
                };
            }

            const initialStatus = payment_date ? 'paid' : (status || 'pending');

            const nuevo = await sql`
                INSERT INTO payments (
                    contract_id,
                    concept,
                    amount,
                    commission,
                    due_date,
                    payment_date,
                    payment_method,
                    reference,
                    notes,
                    status,
                    updated_at
                ) VALUES (
                    ${parseInt(contract_id)},
                    ${concept || 'Alquiler'},
                    ${parseFloat(amount)},
                    ${parseFloat(commission) || 0},
                    ${due_date}::DATE,
                    ${payment_date ? payment_date : null}::DATE,
                    ${payment_method || 'transferencia'},
                    ${reference || null},
                    ${notes || null},
                    ${initialStatus},
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
        // PUT: Actualizar pago o cobro rápido
        // ========================================================
        if (event.httpMethod === 'PUT') {
            const body = JSON.parse(event.body || '{}');
            const { id } = body;

            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'ID de pago requerido' }) };
            }

            // Marcar como cobrado en 1 clic
            if (body.status === 'paid' && Object.keys(body).length <= 3) {
                const fechaCobro = body.payment_date || new Date().toISOString().split('T')[0];
                const actualizado = await sql`
                    UPDATE payments
                    SET 
                        status = 'paid',
                        payment_date = ${fechaCobro}::DATE,
                        updated_at = NOW()
                    WHERE id = ${id}
                    RETURNING *;
                `;
                return { statusCode: 200, headers, body: JSON.stringify(actualizado[0]) };
            }

            const actualizado = await sql`
                UPDATE payments
                SET 
                    contract_id = ${parseInt(body.contract_id)},
                    concept = ${body.concept || 'Alquiler'},
                    amount = ${parseFloat(body.amount)},
                    commission = ${parseFloat(body.commission) || 0},
                    due_date = ${body.due_date}::DATE,
                    payment_date = ${body.payment_date ? body.payment_date : null}::DATE,
                    payment_method = ${body.payment_method || 'transferencia'},
                    reference = ${body.reference || null},
                    notes = ${body.notes || null},
                    status = ${body.payment_date ? 'paid' : (body.status || 'pending')},
                    updated_at = NOW()
                WHERE id = ${id}
                RETURNING *;
            `;

            if (actualizado.length === 0) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Pago no encontrado' }) };
            }

            return { statusCode: 200, headers, body: JSON.stringify(actualizado[0]) };
        }

        // ========================================================
        // DELETE: Eliminar pago
        // ========================================================
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'ID de pago requerido' }) };
            }

            await sql`DELETE FROM payments WHERE id = ${id};`;
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };

    } catch (error) {
        console.error('❌ Error exacto en payments.js:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: error.message || 'Error en servidor de pagos',
                detail: error.detail || null
            })
        };
    }
};