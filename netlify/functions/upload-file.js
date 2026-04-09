const { getDb } = require('./db/config');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
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

        const sql = getDb();
        const { contract_id, file_url, file_name, file_type, file_size, action, file_id } = JSON.parse(event.body);

        // GET - Obtener archivos de un contrato
        if (event.httpMethod === 'GET') {
            const contract_id = event.queryStringParameters.contract_id;
            
            const files = await sql`
                SELECT * FROM contract_files 
                WHERE contract_id = ${contract_id}
                ORDER BY uploaded_at DESC
            `;
            
            // Siempre devolver un array, aunque esté vacío
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(files || [])
            };
        }

        // POST - Guardar referencia del archivo
        if (event.httpMethod === 'POST') {
            const result = await sql`
                INSERT INTO contract_files (contract_id, file_url, file_name, file_type, file_size)
                VALUES (${contract_id}, ${file_url}, ${file_name}, ${file_type}, ${file_size})
                RETURNING *
            `;
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result[0])
            };
        }

        // DELETE - Eliminar archivo
        if (event.httpMethod === 'DELETE') {
            await sql`DELETE FROM contract_files WHERE id = ${file_id}`;
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};