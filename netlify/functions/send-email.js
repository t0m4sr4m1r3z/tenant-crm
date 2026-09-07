// netlify/functions/send-email.js
const { Resend } = require('resend');

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

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
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

        const resend = new Resend(apiKey);
        const body = JSON.parse(event.body || '{}');
        const { to, subject, html, text } = body;

        if (!to || !subject || (!html && !text)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Destinatario (to), Asunto (subject) y Contenido son obligatorios' })
            };
        }

        // Si EMAIL_FROM contiene un dominio no verificado, usamos el remitente seguro de prueba de Resend
        let fromEmail = process.env.EMAIL_FROM || 'Tenant CRM <onboarding@resend.dev>';
        if (fromEmail.includes('@tenantcrm.com')) {
            fromEmail = 'Tenant CRM <onboarding@resend.dev>';
        }

        const data = await resend.emails.send({
            from: fromEmail,
            to: Array.isArray(to) ? to : [to],
            subject: subject,
            html: html || `<p>${text.replace(/\n/g, '<br>')}</p>`,
            text: text || ''
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, id: data.id, message: 'Correo enviado correctamente' })
        };

    } catch (error) {
        console.error('❌ Error enviando email con Resend:', error);

        // Mensaje pedagógico si la cuenta de Resend está en modo sandbox/prueba
        let userMessage = error.message;
        if (error.message && error.message.includes('can only send testing emails')) {
            userMessage = 'Aviso de Resend: En modo prueba gratuito solo puedes enviar correos a la dirección registrada en tu cuenta de Resend. Para enviar a inquilinos reales debes verificar tu dominio en resend.com.';
        }

        return {
            statusCode: 200, // Devolvemos 200 con warning para evitar que la UI crashee con error 500
            headers,
            body: JSON.stringify({
                success: false,
                warning: true,
                message: userMessage
            })
        };
    }
};