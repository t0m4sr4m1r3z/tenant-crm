const { getDb } = require('./db/config');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
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
        
        // Verificar si la tabla existe
        try {
            await sql`SELECT 1 FROM contract_files LIMIT 1`;
        } catch (tableError) {
            // Crear tabla si no existe
            await sql`
                CREATE TABLE IF NOT EXISTS contract_files (
                    id SERIAL PRIMARY KEY,
                    contract_id INTEGER,
                    file_url TEXT NOT NULL,
                    file_name VARCHAR(255) NOT NULL,
                    file_type VARCHAR(100),
                    file_size INTEGER,
                    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;
            console.log('✅ Tabla contract_files creada');
        }

        // GET - Obtener archivos
        if (event.httpMethod === 'GET') {
            const contract_id = event.queryStringParameters.contract_id;
            
            if (!contract_id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'contract_id requerido' })
                };
            }
            
            const files = await sql`
                SELECT * FROM contract_files 
                WHERE contract_id = ${contract_id}
                ORDER BY uploaded_at DESC
            `;
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(files || [])
            };
        }

        // POST - Guardar archivo
        if (event.httpMethod === 'POST') {
            const { contract_id, file_url, file_name, file_type, file_size } = JSON.parse(event.body);
            
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
            const { file_id } = JSON.parse(event.body);
            
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
        console.error('Error en upload-file:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Error interno',
                details: error.message 
            })
        };
    }
};