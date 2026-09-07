// netlify/functions/payments.js
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

        // 1. Auto-migración de la tabla payments
        await sql`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                contract_id INTEGER NOT NULL,
                concept VARCHAR(50) DEFAULT 'Alquiler',
                amount NUMERIC(12, 2) NOT NULL,
                commission NUMERIC(12, 2) DEFAULT 0,
                due_date DATE NOT NULL,
                payment_date DATE,
                payment_method VARCHAR(50) DEFAULT 'transferencia',
                reference VARCHAR(100),
                notes TEXT,
                status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'overdue'
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Columnas opcionales añadidas dinámicamente
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS commission NUMERIC(12, 2) DEFAULT 0;`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'transferencia';`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference VARCHAR(100);`;
        await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;`;

        // ========================================================
        // GET: Obtener todos los pagos con relaciones
        // ========================================================
        if (event.httpMethod === 'GET') {
            const hoyStr = new Date().toISOString().split('T')[0];

            const payments = await sql`
                SELECT 
                    p.id,
                    p.contract_id,
                    p.concept,
                    p.amount,
                    p.commission,
                    TO_CHAR(p.due_date, 'YYYY-MM-DD') as due_date,
                    TO_CHAR(p.payment_date, 'YYYY-MM-DD') as payment_date,
                    p.payment_method,
                    p.reference,
                    p.notes,
                    CASE 
                        WHEN p.status = 'paid' THEN 'paid'
                        WHEN p.due_date < ${hoyStr}::DATE THEN 'overdue'
                        ELSE 'pending'
                    END as status,
                    c.tenant_id,
                    c.owner_id,
                    c.property_id,
                    t.name as tenant_name,
                    t.dni as tenant_dni,
                    o.name as owner_name,
                    prop.address as property_address
                FROM payments p
                LEFT JOIN contracts c ON p.contract_id = c.id
                LEFT JOIN tenants t ON c.tenant_id = t.id
                LEFT JOIN owners o ON c.owner_id = o.id
                LEFT JOIN properties prop ON c.property_id = prop.id
                ORDER BY p.due_date DESC, p.id DESC;
            `;

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

            if (!contract_id || !amount || !due_date) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Contrato, Monto y Fecha de Vencimiento son obligatorios' })
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
        // PUT: Actualizar pago o marcar como cobrado
        // ========================================================
        if (event.httpMethod === 'PUT') {
            const body = JSON.parse(event.body || '{}');
            const { id } = body;

            if (!id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID de pago requerido' })
                };
            }

            // Si solo se pasa para marcar como pagado en 1 clic
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

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(actualizado[0])
                };
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
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Pago no encontrado' })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(actualizado[0])
            };
        }

        // ========================================================
        // DELETE: Eliminar pago
        // ========================================================
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID de pago requerido' })
                };
            }

            await sql`DELETE FROM payments WHERE id = ${id};`;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'Pago eliminado correctamente' })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };

    } catch (error) {
        console.error('❌ Error en netlify/functions/payments.js:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Error interno del servidor' })
        };
    }
};