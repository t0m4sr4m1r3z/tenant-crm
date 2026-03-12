const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

async function testConnection() {
    try {
        const sql = neon(process.env.DATABASE_URL);
        
        // Probar conexión
        const result = await sql`SELECT NOW() as time`;
        console.log('✅ Conexión exitosa a Neon!');
        console.log('Hora del servidor:', result[0].time);
        
        // Verificar tablas
        const tables = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `;
        console.log('\n📊 Tablas en la base de datos:');
        tables.forEach(t => console.log(`   - ${t.table_name}`));
        
    } catch (error) {
        console.error('❌ Error de conexión:', error);
    }
}

testConnection();