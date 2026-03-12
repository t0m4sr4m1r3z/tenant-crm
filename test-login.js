const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

async function testLogin() {
    try {
        // 1. Conectar a Neon
        const sql = neon(process.env.DATABASE_URL);
        console.log('✅ Conectado a Neon');
        
        // 2. Buscar el usuario
        const users = await sql`
            SELECT * FROM users WHERE username = 'admin'
        `;
        
        if (users.length === 0) {
            console.log('❌ Usuario no encontrado');
            return;
        }
        
        const user = users[0];
        console.log('✅ Usuario encontrado:', user.username);
        console.log('📦 Hash en DB:', user.password_hash);
        
        // 3. Probar con diferentes contraseñas
        const passwords = ['admin123', 'admin', 'Admin123', 'ADMIN123'];
        
        for (const pwd of passwords) {
            const hash = crypto.createHash('sha256').update(pwd).digest('hex');
            console.log(`\n🔑 Probando: "${pwd}"`);
            console.log('   Hash calculado:', hash);
            console.log('   Coincide:', hash === user.password_hash ? '✅ SÍ' : '❌ NO');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testLogin();