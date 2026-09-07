// netlify/functions/delinquency.js
const { Resend } = require('resend');
const { getDb } = require('./db/config');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const sql = getDb();
        const hoy = new Date().toISOString().split('T')[0];

        // 1. Obtener pagos vencidos (consulta de sólo lectura)
        const overduePayments = await sql`
            SELECT 
                p.id as payment_id,
                p.amount,
                TO_CHAR(p.due_date, 'YYYY-MM-DD') as due_date,
                p.concept,
                t.name as tenant_name,
                t.email as tenant_email,
                prop.address as property_address
            FROM payments p
            JOIN contracts c ON p.contract_id = c.id
            JOIN tenants t ON c.tenant_id = t.id
            LEFT JOIN properties prop ON c.property_id = prop.id
            WHERE (p.status = 'overdue' OR (p.status = 'pending' AND p.due_date < ${hoy}::DATE))
              AND t.email IS NOT NULL AND t.email != '';
        `;

        if (overduePayments.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, processed: 0, message: 'No hay pagos vencidos con emails asociados.' })
            };
        }

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    processed: overduePayments.length,
                    warning: true,
                    message: `Se detectaron ${overduePayments.length} pagos vencidos, pero falta configurar RESEND_API_KEY para despachar los emails.`
                })
            };
        }

        const resend = new Resend(apiKey);
        let fromEmail = process.env.EMAIL_FROM || 'Tenant CRM <onboarding@resend.dev>';
        if (fromEmail.includes('@tenantcrm.com')) {
            fromEmail = 'Tenant CRM <onboarding@resend.dev>';
        }

        let sentCount = 0;

        // 2. Enviar recordatorio a cada inquilino moroso
        for (const item of overduePayments) {
            try {
                await resend.emails.send({
                    from: fromEmail,
                    to: [item.tenant_email],
                    subject: `Aviso de Vencimiento de Alquiler - ${item.property_address || 'Inmueble'}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #fee2e2; border-radius: 8px;">
                            <h3 style="color: #b91c1c;">Aviso de Pago Pendiente</h3>
                            <p>Estimado/a <strong>${item.tenant_name}</strong>,</p>
                            <p>Le recordamos que el pago correspondiente a <strong>${item.concept || 'Alquiler'}</strong> por un monto de <strong>$${parseFloat(item.amount).toLocaleString('es-AR')}</strong> venció el día <strong>${item.due_date}</strong>.</p>
                            <p>Inmueble: <em>${item.property_address || 'Propiedad en contrato'}</em></p>
                            <p style="margin-top: 15px;">Por favor, si ya realizó la transferencia, desestime este mensaje y envíe el comprobante.</p>
                            <hr style="border: 0; border-top: 1px solid #fee2e2; margin: 15px 0;">
                            <p style="font-size: 11px; color: #9ca3af;">Tenant CRM - Gestión Inmobiliaria</p>
                        </div>
                    `
                });
                sentCount++;
            } catch (mailErr) {
                console.warn(`No se pudo enviar correo a ${item.tenant_email}:`, mailErr.message);
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                processed: overduePayments.length,
                sent: sentCount,
                message: `Se enviaron ${sentCount} recordatorios de pago de ${overduePayments.length} detectados.`
            })
        };

    } catch (error) {
        console.error('❌ Error en netlify/functions/delinquency.js:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Error al procesar recordatorios de morosidad' })
        };
    }
};