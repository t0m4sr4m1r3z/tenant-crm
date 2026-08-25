// netlify/functions/properties.js - CRUD completo de propiedades
const { neon } = require('@neondatabase/serverless');

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    try {
        const sql = neon(process.env.DATABASE_URL);
        const method = event.httpMethod;
        const queryParams = event.queryStringParameters || {};

        // ===== GET =====
        if (method === 'GET') {
            // Si tiene id, obtener una propiedad específica
            if (queryParams.id) {
                const id = parseInt(queryParams.id);
                const result = await sql`
                    SELECT p.*, o.name as owner_name 
                    FROM properties p
                    LEFT JOIN owners o ON p.owner_id = o.id
                    WHERE p.id = ${id}
                `;
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(result[0] || {})
                };
            }

            // Si tiene owner_id, filtrar por propietario
            if (queryParams.owner_id) {
                const ownerId = parseInt(queryParams.owner_id);
                const result = await sql`
                    SELECT p.*, o.name as owner_name 
                    FROM properties p
                    LEFT JOIN owners o ON p.owner_id = o.id
                    WHERE p.owner_id = ${ownerId}
                    ORDER BY p.id DESC
                `;
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(result)
                };
            }

            // Listar todas las propiedades
            const result = await sql`
                SELECT p.*, o.name as owner_name 
                FROM properties p
                LEFT JOIN owners o ON p.owner_id = o.id
                ORDER BY p.id DESC
            `;
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result)
            };
        }

        // ===== POST =====
        if (method === 'POST') {
            const data = JSON.parse(event.body);
            
            if (!data.address || !data.owner_id || !data.type) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Faltan campos obligatorios: address, owner_id, type' 
                    })
                };
            }

            const result = await sql`
                INSERT INTO properties (
                    address, owner_id, type, rooms, bathrooms, 
                    covered_area, uncovered_area, status, description
                ) VALUES (
                    ${data.address}, 
                    ${data.owner_id}, 
                    ${data.type}, 
                    ${data.rooms || 0}, 
                    ${data.bathrooms || 0}, 
                    ${data.covered_area || null}, 
                    ${data.uncovered_area || null}, 
                    ${data.status || 'disponible'}, 
                    ${data.description || ''}
                )
                RETURNING *
            `;
            
            return {
                statusCode: 201,
                headers,
                body: JSON.stringify(result[0])
            };
        }

        // ===== PUT =====
        if (method === 'PUT') {
            const data = JSON.parse(event.body);
            
            if (!data.id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID de propiedad requerido' })
                };
            }

            const result = await sql`
                UPDATE properties SET
                    address = ${data.address},
                    owner_id = ${data.owner_id},
                    type = ${data.type},
                    rooms = ${data.rooms || 0},
                    bathrooms = ${data.bathrooms || 0},
                    covered_area = ${data.covered_area || null},
                    uncovered_area = ${data.uncovered_area || null},
                    status = ${data.status || 'disponible'},
                    description = ${data.description || ''},
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ${data.id}
                RETURNING *
            `;
            
            if (result.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Propiedad no encontrada' })
                };
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result[0])
            };
        }

        // ===== DELETE =====
        if (method === 'DELETE') {
            const id = parseInt(queryParams.id);
            
            if (!id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID de propiedad requerido' })
                };
            }

            const result = await sql`
                DELETE FROM properties 
                WHERE id = ${id}
                RETURNING id
            `;
            
            if (result.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Propiedad no encontrada' })
                };
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: 'Propiedad eliminada correctamente' 
                })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };

    } catch (error) {
        console.error('Error en properties:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};