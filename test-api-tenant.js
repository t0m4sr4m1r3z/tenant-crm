const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

async function testTenantsAPI() {
    try {
        console.log('🔍 Probando conexión a Neon DB...');
        const sql = neon(process.env.DATABASE_URL);
        
        // Probar consulta simple
        const result = await sql`SELECT NOW() as time`;
        console.log('✅ Conexión exitosa:', result[0].time);
        
        // Probar tabla tenants
        const tenants = await sql`SELECT * FROM tenants LIMIT 5`;
        console.log(`✅ Tabla tenants accesible. ${tenants.length} registros encontrados`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testTenantsAPI();