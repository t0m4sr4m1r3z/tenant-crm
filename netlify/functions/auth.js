const { getDb } = require('./db/config');
const crypto = require('crypto');

// Funci√≥n para hashear contrase√±as
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'M√©todo no permitido' })
        };
    }

    try {
        console.log('Ì¥µ Auth function started');
        
        const { username, password } = JSON.parse(event.body);
        
        if (!username || !password) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Usuario y contrase√±a requeridos' 
                })
            };
        }

        // Conectar a la base de datos
        const sql = getDb();
        console.log('Ìø¢ Conectado a Neon DB');
        
        // Buscar usuario
        const users = await sql`
            SELECT id, username, password_hash, name, email, role 
            FROM users 
            WHERE username = ${username}
        `;

        if (users.length === 0) {
            console.log('Ìø° Usuario no encontrado:', username);
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Usuario o contrase√±a incorrectos' 
                })
            };
        }

        const user = users[0];
        const passwordHash = hashPassword(password);

        if (user.password_hash !== passwordHash) {
            console.log('Ìø° Contrase√±a incorrecta para:', username);
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Usuario o contrase√±a incorrectos' 
                })
            };
        }

        // Generar token (en producci√≥n usa JWT)
        const token = crypto.randomBytes(32).toString('hex');

        console.log('Ìø¢ Login exitoso para:', username);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                token
            })
        };

    } catch (error) {
        console.error('Ì¥¥ Error en auth:', error);
        console.error('Stack:', error.stack);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Error interno del servidor: ' + error.message 
            })
        };
    }
};
