const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

// Función para hashear
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Configuración directa (reemplaza con tus datos)
const DATABASE_URL = 'postgresql://neondb_owner:npg_CtVxD5wPT2Wm@ep-patient-mountain-acsjbk69-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function testLogin() {
    try {
        console.log('🔍 Iniciando prueba...');
        
        // Conectar a Neon
        const sql = neon(DATABASE_URL);
        console.log('✅ Conectado a Neon');
        
        // Buscar el usuario admin
        const users = await sql`
            SELECT username, password_hash FROM users WHERE username = 'admin'
        `;
        
        if (users.length === 0) {
            console.log('❌ Usuario admin no encontrado');
            return;
        }
        
        const user = users[0];
        console.log('✅ Usuario encontrado:', user.username);
        console.log('📦 Hash en DB:', user.password_hash);
        console.log('📦 Longitud del hash:', user.password_hash.length);
        
        // Probar diferentes variaciones de la contraseña
        const passwords = [
            'admin123',
            'admin123\n',
            'admin123 ',
            ' admin123',
            'ADMIN123',
            'Admin123'
        ];
        
        console.log('\n🔑 Probando diferentes contraseñas:');
        console.log('='.repeat(50));
        
        for (const pwd of passwords) {
            const hash = hashPassword(pwd);
            const coincide = hash === user.password_hash;
            console.log(`\nContraseña: "${pwd}"`);
            console.log(`Hash: ${hash}`);
            console.log(`Coincide: ${coincide ? '✅ SÍ' : '❌ NO'}`);
            console.log(`Longitud hash: ${hash.length}`);
        }
        
        // Probar específicamente con la contraseña del formulario
        console.log('\n' + '='.repeat(50));
        console.log('🔬 PRUEBA ESPECÍFICA:');
        const testHash = hashPassword('admin123');
        console.log('Hash de "admin123":', testHash);
        console.log('Hash en DB:        ', user.password_hash);
        console.log('¿Iguales?', testHash === user.password_hash ? '✅ SÍ' : '❌ NO');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testLogin();