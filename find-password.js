const crypto = require('crypto');

const targetHash = '240be518fabd2725ddb6f04affeb5b6d2a1c6e7f7d7d8b9a8c7e6f5d4c3b2a1';

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Lista de posibles contraseñas comunes
const posibles = [
    'admin',
    'admin123',
    'Administrador',
    'administrador',
    'password',
    'contraseña',
    '123456',
    'admin2024',
    'Admin2024',
    'tenant',
    'tenantcrm',
    'root',
    'root123',
    'adm1n',
    'adm1n123'
];

console.log('Buscando contraseña que genere el hash:');
console.log(targetHash);
console.log('='.repeat(64));

for (const pwd of posibles) {
    const hash = hashPassword(pwd);
    console.log(`${pwd.padEnd(15)}: ${hash}`);
    if (hash === targetHash) {
        console.log('\n✅ ¡ENCONTRADA! La contraseña es:', pwd);
        break;
    }
}