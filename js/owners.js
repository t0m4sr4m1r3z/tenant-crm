const API = {
    baseUrl: '/.netlify/functions',
    
    async request(endpoint, options = {}) {
        const token = localStorage.getItem('authToken');
        
        // Agregar timestamp para evitar caché en GET
        let url = `${this.baseUrl}${endpoint}`;
        if (!options.method || options.method === 'GET') {
            const separator = url.includes('?') ? '&' : '?';
            url = `${url}${separator}_t=${Date.now()}`;
        }
        
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': token }),
            ...options.headers
        };
        
        try {
            const response = await fetch(url, { ...options, headers });
            
            if (response.status === 401) {
                localStorage.removeItem('authToken');
                window.location.href = '/login.html';
                throw new Error('Sesión expirada');
            }
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Error');
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
    
    async getOwners() {
        return this.request('/owners');
    },
    
    async getOwnerProperties(ownerId) {
        return this.request(`/owners?id=${ownerId}&properties=true`);
    },
    
    async createOwner(owner) {
        return this.request('/owners', { method: 'POST', body: JSON.stringify(owner) });
    },
    
    async updateOwner(owner) {
        return this.request('/owners', { method: 'PUT', body: JSON.stringify(owner) });
    },
    
    async deleteOwner(id) {
        return this.request(`/owners?id=${id}`, { method: 'DELETE' });
    }
};

let currentOwners = [];

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    initSidebar();
    initModal();
    await loadOwners();
    
    document.getElementById('addOwnerBtn').addEventListener('click', () => openOwnerModal());
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('ownerForm').addEventListener('submit', saveOwner);
});

function initSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const closeBtn = document.getElementById('closeSidebarBtn');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (menuBtn && sidebar) menuBtn.addEventListener('click', () => sidebar.classList.remove('hidden'));
    if (closeBtn && sidebar) closeBtn.addEventListener('click', () => sidebar.classList.add('hidden'));
    if (overlay && sidebar) overlay.addEventListener('click', () => sidebar.classList.add('hidden'));
}

function initModal() {
    const modal = document.getElementById('ownerModal');
    const modalOverlay = modal?.querySelector('.absolute.inset-0.bg-gray-600');
    if (modalOverlay) modalOverlay.addEventListener('click', closeModal);
}

function closeModal() {
    document.getElementById('ownerModal').classList.add('hidden');
}

function closePropertiesModal() {
    document.getElementById('propertiesModal').classList.add('hidden');
}

async function loadOwners() {
    console.log('🔄 loadOwners ejecutándose...');
    try {
        // Forzar evitar caché con headers
        const token = localStorage.getItem('authToken');
        const response = await fetch('/.netlify/functions/owners?_t=' + Date.now(), {
            headers: { 
                'Authorization': token,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (!response.ok) throw new Error('Error en la respuesta');
        
        const owners = await response.json();
        console.log('✅ Propietarios cargados:', owners.length);
        currentOwners = owners;
        renderOwnersTable(currentOwners);
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('ownersTableBody').innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-500">Error al cargar</div></td></tr>';
    }
}

function renderOwnersTable(owners) {
    const tbody = document.getElementById('ownersTableBody');
    if (!owners || owners.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8">No hay propietarios registrados</td></tr>';
        return;
    }
    
    tbody.innerHTML = owners.map(owner => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4 font-medium">${escapeHtml(owner.name)}</td>
            <td class="px-6 py-4">${escapeHtml(owner.email || '-')}</td>
            <td class="px-6 py-4">${escapeHtml(owner.phone || '-')}</td>
            <td class="px-6 py-4 text-center">${owner.total_contracts || 0}</td>
            <td class="px-6 py-4 font-medium">$${(owner.total_income || 0).toLocaleString()}</td>
            <td class="px-6 py-4">
                <div class="flex gap-2">
                    <button onclick="viewProperties(${owner.id})" class="text-indigo-600 hover:text-indigo-800 p-1" title="Ver Propiedades">
                        <i class="fas fa-building"></i>
                    </button>
                    <button onclick="editOwner(${owner.id})" class="text-blue-600 hover:text-blue-800 p-1" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteOwner(${owner.id})" class="text-red-600 hover:text-red-800 p-1" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function viewProperties(ownerId) {
    const owner = currentOwners.find(o => o.id === ownerId);
    if (!owner) return;
    
    document.getElementById('modalOwnerName').textContent = `Propiedades de ${escapeHtml(owner.name)}`;
    document.getElementById('propertiesList').innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-2">Cargando propiedades...</p></div>';
    document.getElementById('propertiesModal').classList.remove('hidden');
    
    try {
        const properties = await API.getOwnerProperties(ownerId);
        // Guardar datos incluyendo el email del propietario
        setPropertiesData(properties, owner.name, owner.email);
        renderPropertiesList(properties);
    } catch (error) {
        document.getElementById('propertiesList').innerHTML = `<div class="text-center py-8 text-red-500">Error al cargar las propiedades: ${error.message}</div>`;
    }
}
function renderPropertiesList(data) {
    const container = document.getElementById('propertiesList');
    const properties = data.contracts || [];
    
    // Guardar datos para exportación
    setPropertiesData(data, document.getElementById('modalOwnerName').textContent.replace('Propiedades de ', ''));
    
    if (properties.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-500">No tiene propiedades en alquiler registradas</div>';
        return;
    }
    
    container.innerHTML = `
        <div class="overflow-x-auto" id="propertiesTableContainer">
            <table class="min-w-full divide-y divide-gray-200" id="propertiesTable">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dirección</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inquilino</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contacto</th>
                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Renta Mensual</th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Último Pago</th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Próximo Aumento</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${properties.map(prop => `
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3 font-medium">${escapeHtml(prop.property_address || 'No especificada')}</td>
                            <td class="px-4 py-3">${escapeHtml(prop.tenant_name || 'Sin inquilino')}</td>
                            <td class="px-4 py-3">
                                ${prop.tenant_email ? `<div class="text-sm">${escapeHtml(prop.tenant_email)}</div>` : ''}
                                ${prop.tenant_phone ? `<div class="text-xs text-gray-500">${escapeHtml(prop.tenant_phone)}</div>` : ''}
                            </td>
                            <td class="px-4 py-3 text-right font-semibold text-green-600">${UI.formatCurrency(prop.base_amount)}</td>
                            <td class="px-4 py-3 text-center">
                                ${prop.last_payment_date ? `<span class="text-sm">${UI.formatDate(prop.last_payment_date)}</span>` : '<span class="text-gray-400 text-sm">Sin pagos</span>'}
                            </td>
                            <td class="px-4 py-3 text-center">
                                ${prop.next_increase_date ? `
                                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getIncreaseClass(prop.next_increase_date)}">
                                        ${UI.formatDate(prop.next_increase_date)}
                                    </span>
                                ` : '<span class="text-gray-400 text-sm">No programado</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot class="bg-gray-50">
                    <tr class="font-bold">
                        <td colspan="3" class="px-4 py-3 text-right">TOTAL MENSUAL:</td>
                        <td class="px-4 py-3 text-right text-xl text-green-600">${UI.formatCurrency(data.total_monthly_income || 0)}</td>
                        <td colspan="2"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
}

function getIncreaseClass(nextIncreaseDate) {
    const today = new Date();
    const increaseDate = new Date(nextIncreaseDate);
    const daysUntil = Math.ceil((increaseDate - today) / (1000 * 60 * 60 * 24));
    
    if (daysUntil <= 7) return 'bg-red-100 text-red-800';
    if (daysUntil <= 30) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
}

function openOwnerModal(owner = null) {
    const modal = document.getElementById('ownerModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('ownerForm');
    
    form.reset();
    document.getElementById('ownerId').value = '';
    title.textContent = 'Nuevo Propietario';
    
    if (owner) {
        title.textContent = 'Editar Propietario';
        document.getElementById('ownerId').value = owner.id;
        document.getElementById('ownerDni').value = owner.dni || '';
        document.getElementById('ownerName').value = owner.name;
        document.getElementById('ownerEmail').value = owner.email || '';
        document.getElementById('ownerPhone').value = owner.phone || '';
        document.getElementById('ownerAddress').value = owner.address || '';
        document.getElementById('ownerBankAccount').value = owner.bank_account || '';
        if (document.getElementById('ownerNotes')) {
            document.getElementById('ownerNotes').value = owner.notes || '';
        }
    }
    
    modal.classList.remove('hidden');
}

async function saveOwner(e) {
    e.preventDefault();
    console.log('🚀 saveOwner iniciado');
    
    const ownerData = {
        name: document.getElementById('ownerName').value.trim(),
        email: document.getElementById('ownerEmail').value.trim(),
        phone: document.getElementById('ownerPhone').value.trim(),
        dni: document.getElementById('ownerDni').value.trim(),
        address: document.getElementById('ownerAddress').value.trim(),
        bank_account: document.getElementById('ownerBankAccount').value.trim()
    };
    
    const notesInput = document.getElementById('ownerNotes');
    if (notesInput) ownerData.notes = notesInput.value.trim();
    
    const id = document.getElementById('ownerId').value;
    if (id) ownerData.id = parseInt(id);
    
    if (!ownerData.name) return UI.toast('El nombre es obligatorio', 'warning');
    
    const submitBtn = document.querySelector('#ownerForm button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';
    submitBtn.disabled = true;
    
    try {
        if (id) {
            await API.updateOwner(ownerData);
            UI.toast('Propietario actualizado', 'success');
            console.log('✅ Propietario ACTUALIZADO, ID:', id);
        } else {
            await API.createOwner(ownerData);
            UI.toast('Propietario creado', 'success');
            console.log('✅ Propietario CREADO');
        }
        
        closeModal();
        
        console.log('🔄 Llamando a loadOwners()...');
        await loadOwners();
        console.log('✅ loadOwners() completado');
        
    } catch (error) {
        console.error('❌ Error:', error);
        UI.toast('Error: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}



async function editOwner(id) {
    const owner = currentOwners.find(o => o.id === id);
    if (owner) openOwnerModal(owner);
}

async function deleteOwner(id) {
    console.log('🗑️ deleteOwner iniciado, ID:', id);
    if (!confirm('¿Eliminar este propietario? Se conservarán los contratos.')) return;
    
    try {
        await API.deleteOwner(id);
        UI.toast('Propietario eliminado', 'success');
        console.log('✅ Propietario ELIMINADO, ID:', id);
        
        console.log('🔄 Llamando a loadOwners()...');
        await loadOwners();
        console.log('✅ loadOwners() completado');
        
    } catch (error) {
        console.error('❌ Error:', error);
        UI.toast('Error: ' + error.message, 'error');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m];
    });
}
// ============================================
// FUNCIONES DE EXPORTACIÓN PARA PROPIEDADES
// ============================================

let currentPropertiesData = null;
let currentOwnerName = '';

function setPropertiesData(data, ownerName, ownerEmail) {
    currentPropertiesData = data;
    currentOwnerName = ownerName;
    if (ownerEmail) currentPropertiesData.owner_email = ownerEmail;
}

function imprimirPropiedades() {
    if (!currentPropertiesData) return;
    
    const printContent = document.getElementById('propertiesList').innerHTML;
    const ownerName = currentOwnerName;
    const fecha = new Date().toLocaleDateString('es-ES');
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Propiedades de ${ownerName} - Tenant CRM</title>
            <script src="https://cdn.tailwindcss.com"><\/script>
            <style>
                @media print {
                    body { padding: 20px; }
                    .no-print { display: none; }
                }
                body { font-family: 'Inter', sans-serif; padding: 20px; }
                h1 { color: #4f46e5; margin-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #4f46e5; color: white; padding: 10px; text-align: left; }
                td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
                .total { margin-top: 20px; text-align: right; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Tenant CRM - Propiedades de ${escapeHtml(ownerName)}</h1>
            <p>Fecha de generación: ${fecha}</p>
            ${printContent}
            <div class="no-print text-center mt-8">
                <button onclick="window.print()" class="px-4 py-2 bg-blue-600 text-white rounded-lg">
                    Imprimir
                </button>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function exportarPropiedadesPDF() {
    if (!currentPropertiesData) return;
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');
        const ownerName = currentOwnerName;
        const fecha = new Date().toLocaleDateString('es-ES');
        
        // Título
        doc.setFontSize(18);
        doc.setTextColor(79, 70, 229);
        doc.text(`Propiedades de ${ownerName}`, 14, 22);
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Fecha: ${fecha}`, 14, 32);
        
        // Preparar datos para la tabla
        const properties = currentPropertiesData.contracts || [];
        const tableHeaders = [['Dirección', 'Inquilino', 'Contacto', 'Renta Mensual', 'Último Pago', 'Próximo Aumento']];
        const tableBody = properties.map(prop => [
            prop.property_address || 'No especificada',
            prop.tenant_name || 'Sin inquilino',
            prop.tenant_email || prop.tenant_phone || '-',
            `$${Number(prop.base_amount).toLocaleString()}`,
            prop.last_payment_date ? new Date(prop.last_payment_date).toLocaleDateString() : 'Sin pagos',
            prop.next_increase_date ? new Date(prop.next_increase_date).toLocaleDateString() : 'No programado'
        ]);
        
        // Agregar total
        tableBody.push(['', '', '', `TOTAL: $${(currentPropertiesData.total_monthly_income || 0).toLocaleString()}`, '', '']);
        
        doc.autoTable({
            head: tableHeaders,
            body: tableBody,
            startY: 40,
            theme: 'striped',
            styles: { fontSize: 9 },
            headStyles: { fillColor: [79, 70, 229] },
            columnStyles: {
                0: { cellWidth: 40 },
                1: { cellWidth: 35 },
                2: { cellWidth: 45 },
                3: { cellWidth: 25 },
                4: { cellWidth: 25 },
                5: { cellWidth: 25 }
            }
        });
        
        doc.save(`propiedades_${ownerName.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
        UI.toast('PDF generado correctamente', 'success');
        
    } catch (error) {
        console.error('Error generando PDF:', error);
        UI.toast('Error al generar PDF', 'error');
    }
}

function exportarPropiedadesExcel() {
    if (!currentPropertiesData) return;
    
    try {
        const properties = currentPropertiesData.contracts || [];
        const ownerName = currentOwnerName;
        
        const excelData = properties.map(prop => ({
            'Dirección': prop.property_address || 'No especificada',
            'Inquilino': prop.tenant_name || 'Sin inquilino',
            'Email Inquilino': prop.tenant_email || '-',
            'Teléfono Inquilino': prop.tenant_phone || '-',
            'Renta Mensual': `$${Number(prop.base_amount).toLocaleString()}`,
            'Último Pago': prop.last_payment_date ? new Date(prop.last_payment_date).toLocaleDateString() : 'Sin pagos',
            'Próximo Aumento': prop.next_increase_date ? new Date(prop.next_increase_date).toLocaleDateString() : 'No programado'
        }));
        
        // Agregar fila de total
        excelData.push({
            'Dirección': 'TOTAL',
            'Inquilino': '',
            'Email Inquilino': '',
            'Teléfono Inquilino': '',
            'Renta Mensual': `$${(currentPropertiesData.total_monthly_income || 0).toLocaleString()}`,
            'Último Pago': '',
            'Próximo Aumento': ''
        });
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);
        XLSX.utils.book_append_sheet(wb, ws, 'Propiedades');
        
        XLSX.writeFile(wb, `propiedades_${ownerName.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
        UI.toast('Excel generado correctamente', 'success');
        
    } catch (error) {
        console.error('Error generando Excel:', error);
        UI.toast('Error al generar Excel', 'error');
    }
}

// ============================================
// FUNCIÓN PARA GENERAR TEXTO DEL REPORTE (EMAIL)
// ============================================

function generarTextoReporte() {
    const properties = currentPropertiesData.contracts || [];
    const fecha = new Date().toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
    const totalIncome = currentPropertiesData.total_monthly_income || 0;
    
    let text = `========================================\n`;
    text = `📊 REPORTE DE PROPIEDADES EN ALQUILER\n`;
    text += `========================================\n\n`;
    text += `👤 PROPIETARIO: ${currentOwnerName}\n`;
    text += `📅 FECHA: ${fecha}\n\n`;
    text += `========================================\n`;
    text += `📋 PROPIEDADES EN ALQUILER\n`;
    text += `========================================\n\n`;
    
    properties.forEach((prop, index) => {
        text += `[${index + 1}] ${'='.repeat(40)}\n`;
        text += `🏠 DIRECCIÓN: ${prop.property_address || 'No especificada'}\n`;
        text += `👤 INQUILINO: ${prop.tenant_name || 'Sin inquilino'}\n`;
        if (prop.tenant_email) text += `📧 EMAIL INQUILINO: ${prop.tenant_email}\n`;
        if (prop.tenant_phone) text += `📞 TELÉFONO INQUILINO: ${prop.tenant_phone}\n`;
        text += `💰 RENTA MENSUAL: $${Number(prop.base_amount || 0).toLocaleString()}\n`;
        text += `📅 ÚLTIMO PAGO: ${prop.last_payment_date ? new Date(prop.last_payment_date).toLocaleDateString() : 'Sin pagos registrados'}\n`;
        text += `📈 PRÓXIMO AUMENTO: ${prop.next_increase_date ? new Date(prop.next_increase_date).toLocaleDateString() : 'No programado'}\n\n`;
    });
    
    text += `========================================\n`;
    text += `💰 RESUMEN FINANCIERO\n`;
    text += `========================================\n`;
    text += `🏘️ TOTAL PROPIEDADES: ${properties.length}\n`;
    text += `💰 INGRESO MENSUAL TOTAL: $${Number(totalIncome).toLocaleString()}\n`;
        if (properties.length > 0) {
        text += `📊 PROMEDIO POR PROPIEDAD: $${Math.round(totalIncome / properties.length).toLocaleString()}\n`;
    }
    text += `\n========================================\n`;
    text += `📧 Este reporte fue generado automáticamente por Mortola y Asociados\n`;
    text += `========================================\n`;
    
    return text;
}

// ============================================
// FUNCIÓN PARA ENVIAR EMAIL (GMAIL UNIVERSAL)
// ============================================

function enviarEmailPropietario() {
    if (!currentPropertiesData || !currentOwnerName) {
        UI.toast('No hay datos para enviar', 'error');
        return;
    }
    
    const ownerEmail = currentPropertiesData.owner_email;
    
    if (!ownerEmail) {
        UI.toast('El propietario no tiene email registrado', 'warning');
        return;
    }
    
    // Generar el contenido del email
    const subject = `Reporte de Propiedades - ${currentOwnerName} - Tenant CRM`;
    const body = generarTextoReporte();
    
    // Codificar para URL
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    
    // Detectar si es dispositivo móvil
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    let mailtoLink;
    
    if (isMobile) {
        // En móvil: usar intent de Gmail app
        mailtoLink = `intent://mailto:${ownerEmail}?subject=${encodedSubject}&body=${encodedBody}#Intent;scheme=mailto;package=com.google.android.gm;end`;
    } else {
        // En computadora: usar Gmail web
        mailtoLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${ownerEmail}&su=${encodedSubject}&body=${encodedBody}`;
    }
    
    // Abrir el enlace
    window.open(mailtoLink, '_blank');
    
    UI.toast('Abriendo Gmail...', 'info');
}

// También mantén la versión alternativa para Outlook/Hotmail si lo prefieres
function enviarEmailOutlook() {
    if (!currentPropertiesData || !currentOwnerName) return;
    
    const ownerEmail = currentPropertiesData.owner_email;
    if (!ownerEmail) {
        UI.toast('El propietario no tiene email registrado', 'warning');
        return;
    }
    
    const subject = `Reporte de Propiedades - ${currentOwnerName} - Tenant CRM`;
    const body = generarTextoReporte();
    
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    
    // Outlook/Hotmail web
    const outlookLink = `https://outlook.live.com/mail/0/deeplink/compose?to=${ownerEmail}&subject=${encodedSubject}&body=${encodedBody}`;
    
    window.open(outlookLink, '_blank');
    UI.toast('Abriendo Outlook...', 'info');
}

function generarHTMLReportePropiedades() {
    const properties = currentPropertiesData.contracts || [];
    const ownerName = currentOwnerName;
    const fecha = new Date().toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
    const totalIncome = currentPropertiesData.total_monthly_income || 0;
    
    // Generar filas de la tabla
    let tableRows = '';
    properties.forEach(prop => {
        const lastPayment = prop.last_payment_date ? new Date(prop.last_payment_date).toLocaleDateString() : 'Sin pagos';
        const nextIncrease = prop.next_increase_date ? new Date(prop.next_increase_date).toLocaleDateString() : 'No programado';
        
        tableRows += `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 8px;">${escapeHtml(prop.property_address || 'No especificada')}</td>
                <td style="padding: 12px 8px;">${escapeHtml(prop.tenant_name || 'Sin inquilino')}</td>
                <td style="padding: 12px 8px;">${escapeHtml(prop.tenant_email || '-')}<br><small style="color:#6b7280;">${escapeHtml(prop.tenant_phone || '')}</small></td>
                <td style="padding: 12px 8px; text-align: right; font-weight: bold; color: #10b981;">$${Number(prop.base_amount || 0).toLocaleString()}</td>
                <td style="padding: 12px 8px; text-align: center;">${lastPayment}</td>
                <td style="padding: 12px 8px; text-align: center;">${nextIncrease}</td>
            </tr>
        `;
    });
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reporte de Propiedades - ${escapeHtml(ownerName)}</title>
            <style>
                body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    line-height: 1.5;
                    color: #1f2937;
                    background-color: #f9fafb;
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #4f46e5, #7c3aed);
                    color: white;
                    padding: 30px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 28px;
                    font-weight: 700;
                }
                .header p {
                    margin: 10px 0 0;
                    opacity: 0.9;
                }
                .content {
                    padding: 30px;
                }
                .summary {
                    background: #f3f4f6;
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 30px;
                    display: flex;
                    justify-content: space-around;
                    text-align: center;
                }
                .summary-item {
                    flex: 1;
                }
                .summary-label {
                    font-size: 14px;
                    color: #6b7280;
                    margin-bottom: 5px;
                }
                .summary-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #4f46e5;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                th {
                    background-color: #f9fafb;
                    padding: 12px 8px;
                    text-align: left;
                    font-size: 12px;
                    font-weight: 600;
                    color: #6b7280;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 2px solid #e5e7eb;
                }
                td {
                    padding: 12px 8px;
                    vertical-align: top;
                }
                .footer {
                    background: #f9fafb;
                    padding: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #9ca3af;
                    border-top: 1px solid #e5e7eb;
                }
                .badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 9999px;
                    font-size: 12px;
                    font-weight: 500;
                }
                .badge-green {
                    background-color: #d1fae5;
                    color: #065f46;
                }
                .badge-yellow {
                    background-color: #fef3c7;
                    color: #92400e;
                }
                .badge-red {
                    background-color: #fee2e2;
                    color: #991b1b;
                }
                @media (max-width: 640px) {
                    .content { padding: 15px; }
                    th, td { font-size: 12px; padding: 8px 4px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🏢 Tenant CRM</h1>
                    <p>Reporte de Propiedades en Alquiler</p>
                </div>
                <div class="content">
                    <h2 style="font-size: 20px; margin-bottom: 10px;">${escapeHtml(ownerName)}</h2>
                    <p style="color: #6b7280; margin-bottom: 20px;">Fecha de generación: ${fecha}</p>
                    
                    <div class="summary">
                        <div class="summary-item">
                            <div class="summary-label">Propiedades Activas</div>
                            <div class="summary-value">${properties.length}</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Ingreso Mensual Total</div>
                            <div class="summary-value">$${totalIncome.toLocaleString()}</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Promedio por Propiedad</div>
                            <div class="summary-value">$${properties.length > 0 ? Math.round(totalIncome / properties.length).toLocaleString() : 0}</div>
                        </div>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th>Dirección</th>
                                <th>Inquilino</th>
                                <th>Contacto</th>
                                <th style="text-align: right">Renta Mensual</th>
                                <th style="text-align: center">Último Pago</th>
                                <th style="text-align: center">Próximo Aumento</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
                <div class="footer">
                    <p>Este reporte fue generado automáticamente por Mortola y Asociados.</p>
                    <p>© ${new Date().getFullYear()} Mortola y Asociados - Negocio Inmobiliario</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Funciones globales
window.viewProperties = viewProperties;
window.editOwner = editOwner;
window.deleteOwner = deleteOwner;
window.closePropertiesModal = closePropertiesModal;