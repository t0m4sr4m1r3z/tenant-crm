const { getDb } = require('./db/config');
const { Resend } = require('resend');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };
    }

    try {
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'No autorizado' })
            };
        }

        const { to, subject, html } = JSON.parse(event.body);
        
        if (!to || !subject || !html) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Faltan datos requeridos' })
            };
        }

        // Inicializar Resend
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        // Configuración del email
        const emailFrom = process.env.EMAIL_FROM || 'onboarding@resend.dev';
        
        // Enviar email
        const { data, error } = await resend.emails.send({
            from: emailFrom,
            to: [to],
            subject: subject,
            html: html
        });
        
        if (error) {
            console.error('Error de Resend:', error);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: error.message })
            };
        }
        
        console.log('✅ Email enviado a:', to);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: 'Email enviado correctamente',
                data: data
            })
        };
        
    } catch (error) {
        console.error('Error en send-owner-email:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Error interno del servidor',
                details: error.message
            })
        };
    }
};