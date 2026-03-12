const { neon } = require('@neondatabase/serverless');

let sql = null;

function getDb() {
    if (!sql) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL no está configurada');
        }
        sql = neon(process.env.DATABASE_URL);
    }
    return sql;
}

module.exports = { getDb };