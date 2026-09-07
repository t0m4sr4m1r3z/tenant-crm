// netlify/functions/properties.js
const { getDb } = require('./db/config');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const sql = getDb();

        // 1. Auto-migración de la tabla properties
        await sql`
            CREATE TABLE IF NOT EXISTS properties (
                id SERIAL PRIMARY KEY,
                owner_id INTEGER NOT NULL,
                address VARCHAR(255) NOT NULL,
                type VARCHAR(50) DEFAULT 'departamento',
                rooms INTEGER DEFAULT 0,
                bathrooms INTEGER DEFAULT 0,
                covered_area NUMERIC(10, 2) DEFAULT 0,
                uncovered_area NUMERIC(10, 2) DEFAULT 0,
                status VARCHAR(30) DEFAULT 'disponible',
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // ========================================================
        // GET: Listar propiedades
        // ========================================================
        if (event.httpMethod === 'GET') {
            const properties = await sql`
                SELECT 
                    p.*,
                    o.name as owner_name,
                    o.dni as owner_dni
                FROM properties p
                LEFT JOIN owners o ON p.owner_id = o.id
                ORDER BY p.id DESC;
            `;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(properties)
            };
        }

        // ========================================================
        // POST: Crear propiedad
        // ========================================================
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { address, owner_id, type, rooms, bathrooms, covered_area, uncovered_area, status, description } = body;

            if (!address || !owner_id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Dirección y Propietario son obligatorios' })
                };
            }

            const nueva = await sql`
                INSERT INTO properties (
                    address, owner_id, type, rooms, bathrooms, covered_area, uncovered_area, status, description, updated_at
                ) VALUES (
                    ${address},
                    ${parseInt(owner_id)},
                    ${type || 'departamento'},
                    ${parseInt(rooms) || 0},
                    ${parseInt(bathrooms) || 0},
                    ${parseFloat(covered_area) || 0},
                    ${parseFloat(uncovered_area) || 0},
                    ${status || 'disponible'},
                    ${description || null},
                    NOW()
                )
                RETURNING *;
            `;

            return {
                statusCode: 201,
                headers,
                body: JSON.stringify(nueva[0])
            };
        }

        // ========================================================
        // PUT: Actualizar propiedad
        // ========================================================
        if (event.httpMethod === 'PUT') {
            const body = JSON.parse(event.body || '{}');
            const { id, address, owner_id, type, rooms, bathrooms, covered_area, uncovered_area, status, description } = body;

            if (!id || !address || !owner_id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID, Dirección y Propietario son obligatorios' })
                };
            }

            const actualizada = await sql`
                UPDATE properties
                SET 
                    address = ${address},
                    owner_id = ${parseInt(owner_id)},
                    type = ${type || 'departamento'},
                    rooms = ${parseInt(rooms) || 0},
                    bathrooms = ${parseInt(bathrooms) || 0},
                    covered_area = ${parseFloat(covered_area) || 0},
                    uncovered_area = ${parseFloat(uncovered_area) || 0},
                    status = ${status || 'disponible'},
                    description = ${description || null},
                    updated_at = NOW()
                WHERE id = ${id}
                RETURNING *;
            `;

            if (actualizada.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Propiedad no encontrada' })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(actualizada[0])
            };
        }

        // ========================================================
        // DELETE: Eliminar propiedad
        // ========================================================
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID requerido' })
                };
            }

            await sql`DELETE FROM properties WHERE id = ${id};`;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: 'Propiedad eliminada' })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método no permitido' })
        };

    } catch (error) {
        console.error('❌ Error en netlify/functions/properties.js:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Error interno del servidor' })
        };
    }
};