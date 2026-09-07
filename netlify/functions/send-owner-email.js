// netlify/functions/send-owner-email.js
const { Resend } = require('resend');
const { getDb } = require('./db/config');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: false,
                    warning: true,
                    message: 'Falta configurar RESEND_API_KEY en las variables de entorno (.env).'
                })
            };
        }

        const body = JSON.parse(event.body || '{}');
        const { owner_id } = body;

        if (!owner_id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'ID de propietario requerido' })
            };
        }

        const sql = getDb();

        // 1. Obtener datos del propietario (consulta 100% lectura)
        const owners = await sql`SELECT * FROM owners WHERE id = ${owner_id};`;
        if (owners.length === 0) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'Propietario no encontrado' }) };
        }
        const owner = owners[0];

        if (!owner.email) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: false, warning: true, message: 'Este propietario no tiene una dirección de email registrada.' })
            };
        }

        // 2. Obtener contratos activos y propiedades del propietario
        const contracts = await sql`
            SELECT 
                c.id, c.base_amount, c.agent_commission,
                p.address as property_address,
                t.name as tenant_name
            FROM contracts c
            LEFT JOIN properties p ON c.property_id = p.id
            LEFT JOIN tenants t ON c.tenant_id = t.id
            WHERE c.owner_id = ${owner_id} AND c.status = 'active';
        `;

        let totalBruto = 0;
        let totalComision = 0;
        let filasHtml = '';

        contracts.forEach(c => {
            const monto = parseFloat(c.base_amount) || 0;
            const comRate = parseFloat(c.agent_commission) || 5;
            const comision = (monto * comRate) / 100;
            const neto = monto - comision;

            totalBruto += monto;
            totalComision += comision;

            filasHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${c.property_address || 'Inmueble'}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${c.tenant_name || 'N/A'}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">$${monto.toLocaleString('es-AR')}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626;">-$${comision.toLocaleString('es-AR')}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #16a34a;">$${neto.toLocaleString('es-AR')}</td>
                </tr>
            `;
        });

        const totalNeto = totalBruto - totalComision;
        const mesActual = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                <h2 style="color: #4f46e5; margin-bottom: 5px;">Tenant CRM - Liquidación Mensual</h2>
                <p style="color: #64748b; font-size: 14px;">Resumen de rentas correspondientes a: <strong>${mesActual}</strong></p>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                
                <p>Estimado/a <strong>${owner.name}</strong>,</p>
                <p>Le compartimos el detalle de liquidación de sus inmuebles administrados:</p>

                <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 20px 0;">
                    <thead>
                        <tr style="background-color: #f8fafc; text-align: left;">
                            <th style="padding: 8px;">Inmueble</th>
                            <th style="padding: 8px;">Inquilino</th>
                            <th style="padding: 8px; text-align: right;">Alquiler</th>
                            <th style="padding: 8px; text-align: right;">Comisión</th>
                            <th style="padding: 8px; text-align: right;">Neto</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasHtml}
                    </tbody>
                </table>

                <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin-top: 15px;">
                    <p style="margin: 0; font-size: 16px; color: #166534; font-weight: bold;">
                        Neto a Liquidar: $${totalNeto.toLocaleString('es-AR')}
                    </p>
                    ${owner.bank_account ? `<p style="margin: 5px 0 0 0; font-size: 12px; color: #15803d;">Destino: ${owner.bank_account}</p>` : ''}
                </div>

                <p style="font-size: 12px; color: #94a3b8; margin-top: 25px; text-align: center;">
                    Documento generado automáticamente por el sistema de gestión.
                </p>
            </div>
        `;

        const resend = new Resend(apiKey);
        let fromEmail = process.env.EMAIL_FROM || 'Tenant CRM <onboarding@resend.dev>';
        if (fromEmail.includes('@tenantcrm.com')) {
            fromEmail = 'Tenant CRM <onboarding@resend.dev>';
        }

        await resend.emails.send({
            from: fromEmail,
            to: [owner.email],
            subject: `Liquidación de Alquileres - ${mesActual} - ${owner.name}`,
            html: htmlContent
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: `Liquidación enviada con éxito a ${owner.email}` })
        };

    } catch (error) {
        console.error('❌ Error en send-owner-email.js:', error);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: false,
                warning: true,
                message: error.message || 'Error al procesar envío de liquidación'
            })
        };
    }
};