// Email sending with Resend
const { Resend } = require('resend');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST'
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
    
    try {
        const { to, subject, html, contractData } = JSON.parse(event.body);
        
        // Initialize Resend
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        // Send email
        const { data, error } = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
            to: [to],
            subject: subject || 'Notificación de Alquiler - Tenant CRM',
            html: html || generateEmailHtml(contractData)
        });
        
        if (error) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: error.message })
            };
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};

function generateEmailHtml(contract) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
                <h1 style="color: #2563eb; margin-bottom: 20px;">Tenant CRM</h1>
                
                <h2 style="color: #1f2937;">Notificación de Pago</h2>
                
                <p>Estimado/a ${contract.tenantName},</p>
                
                <p>Le informamos los detalles de su próximo pago de alquiler:</p>
                
                <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Monto Base:</strong></td>
                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">$${contract.baseAmount.toLocaleString()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Nuevo Monto:</strong></td>
                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #2563eb; font-weight: bold;">$${contract.newAmount.toLocaleString()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Período:</strong></td>
                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${contract.period}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px 0;"><strong>Fecha de Vencimiento:</strong></td>
                            <td style="padding: 10px 0;">${contract.dueDate}</td>
                        </tr>
                    </table>
                </div>
                
                <p><strong>Detalles del incremento:</strong></p>
                <ul style="margin-bottom: 20px;">
                    <li>Tipo: ${contract.increaseType.toUpperCase()}</li>
                    <li>Porcentaje: ${contract.increasePercentage}%</li>
                </ul>
                
                <p>Si tiene alguna duda, no dude en contactarnos.</p>
                
                <p style="margin-top: 30px;">Saludos cordiales,<br>Equipo de Gestión</p>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                
                <p style="font-size: 12px; color: #6b7280; text-align: center;">
                    Este es un mensaje automático. Por favor no responda a este correo.
                </p>
            </div>
        </body>
        </html>
    `;
}