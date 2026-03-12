const { neon } = require('@neondatabase/serverless');

let sql = null;

function getDb() {
    if (!sql) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL no está configurada. Verifica tu archivo .env');
        }
        sql = neon(process.env.DATABASE_URL);
        console.log('✅ Conexión a Neon DB establecida');
    }
    return sql;
}

module.exports = { getDb };