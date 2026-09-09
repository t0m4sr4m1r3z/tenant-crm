// js/owners.js - Gestión de Propietarios y Liquidación Privada al Propietario
const API = {
    baseUrl: '/.netlify/functions',

    async request(endpoint, options = {}) {
        const token = sessionStorage.getItem('authToken');
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': token }),
            ...options.headers
        };

        const response = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });
        if (response.status === 401) {
            sessionStorage.clear();
            window.location.href = '/login.html';
            throw new Error('Sesión expirada');
        }

        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        if (!response.ok) throw new Error(data.error || 'Error en la petición');
        return data;
    },

    getOwners() { return this.request('/owners'); },
    createOwner(owner) { return this.request('/owners', { method: 'POST', body: JSON.stringify(owner) }); },
    updateOwner(owner) { return this.request('/owners', { method: 'PUT', body: JSON.stringify(owner) }); },
    deleteOwner(id) { return this.request(`/owners?id=${id}`, { method: 'DELETE' }); },
    getContracts() { return this.request('/contracts'); },
    getProperties() { return this.request('/properties'); }
};

// Estado global
let currentOwners = [];
let allContracts = [];
let allProperties = [];
let currentOwnerSummary = null;

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    if (window.AppSidebar) AppSidebar.init();
    if (window.Breadcrumbs) Breadcrumbs.init();

    initEventListeners();
    await cargarDatosIniciales();
});

async function cargarDatosIniciales() {
    try {
        const [owners, contracts, properties] = await Promise.all([
            API.getOwners().catch(() => []),
            API.getContracts().catch(() => []),
            API.getProperties().catch(() => [])
        ]);

        currentOwners = Array.isArray(owners) ? owners : [];
        allContracts = Array.isArray(contracts) ? contracts : [];
        allProperties = Array.isArray(properties) ? properties : [];

        renderizarTablaPropietarios(currentOwners);
    } catch (err) {
        console.error('Error al inicializar propietarios:', err);
        if (window.UI) UI.toast('Error cargando propietarios', 'error');
    }
}

function initEventListeners() {
    const searchInput = document.getElementById('searchOwners');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filtrados = currentOwners.filter(o => 
                (o.name && o.name.toLowerCase().includes(query)) ||
                (o.dni && o.dni.toLowerCase().includes(query)) ||
                (o.email && o.email.toLowerCase().includes(query))
            );
            renderizarTablaPropietarios(filtrados);
        });
    }

    const addBtn = document.getElementById('addOwnerBtn');
    if (addBtn) {
        addBtn.addEventListener('click', abrirModalNuevoPropietario);
    }

    const closeBtn = document.getElementById('closeModalBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', cerrarModalPropietario);
    }

    const ownerForm = document.getElementById('ownerForm');
    if (ownerForm) {
        ownerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await guardarPropietario();
        });
    }
}

// ============================================
// TABLA PRINCIPAL DE PROPIETARIOS
// ============================================

function renderizarTablaPropietarios(owners) {
    const tbody = document.getElementById('ownersTableBody');
    if (!tbody) return;

    if (!owners || owners.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-500">No se encontraron propietarios registrados</td></tr>`;
        return;
    }

    tbody.innerHTML = owners.map(owner => {
        const contratosOwner = allContracts.filter(c => c.owner_id === owner.id);
        const contratosActivos = contratosOwner.filter(c => c.status === 'active');
        
        // Calcular ingresos netos totales que percibe el propietario (con el descuento ya hecho)
        const ingresosNetosTotales = contratosActivos.reduce((sum, c) => {
            const monto = parseFloat(c.base_amount) || 0;
            const comPct = parseFloat(c.agent_commission) || 0;
            return sum + (monto * (1 - (comPct / 100)));
        }, 0);

        return `
            <tr class="hover:bg-slate-50 transition border-b border-gray-100">
                <td class="px-6 py-4 font-medium text-slate-800">${AppUtils.escapeHtml(owner.name)}</td>
                <td class="px-6 py-4 text-slate-600">${AppUtils.escapeHtml(owner.email || '-')}</td>
                <td class="px-6 py-4 text-slate-600">${AppUtils.escapeHtml(owner.phone || '-')}</td>
                <td class="px-6 py-4">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        ${contratosActivos.length} activos / ${contratosOwner.length} total
                    </span>
                </td>
                <td class="px-6 py-4 font-semibold text-emerald-600">${AppUtils.formatCurrency(ingresosNetosTotales)}</td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <!-- Botón del edificio: ver resumen -->
                        <button onclick="verPropiedades(${owner.id})" 
                                class="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition" 
                                title="Ver Resumen y Liquidación de Propiedades">
                            <i class="fas fa-building"></i>
                        </button>
                        <button onclick="editarPropietario(${owner.id})" 
                                class="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg transition" 
                                title="Editar Propietario">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="eliminarPropietario(${owner.id})" 
                                class="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition" 
                                title="Eliminar">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// MODAL: ESTADO DE CUENTA PRIVADO
// ============================================

async function verPropiedades(ownerId) {
    const owner = currentOwners.find(o => o.id === ownerId);
    if (!owner) return;

    const contratos = allContracts.filter(c => c.owner_id === ownerId);
    const propiedades = allProperties.filter(p => p.owner_id === ownerId);

    // Calcular únicamente el neto acumulado (con descuento ya aplicado)
    let totalNeto = 0;
    contratos.forEach(c => {
        if (c.status === 'active') {
            const monto = parseFloat(c.base_amount) || 0;
            const comPct = parseFloat(c.agent_commission) || 0;
            totalNeto += monto * (1 - (comPct / 100));
        }
    });

    currentOwnerSummary = {
        owner,
        contratos,
        propiedades,
        totals: {
            totalNeto,
            activas: contratos.filter(c => c.status === 'active').length,
            totalPropiedades: propiedades.length
        }
    };

    document.getElementById('modalOwnerName').textContent = `Estado de Cuenta y Liquidación: ${owner.name}`;
    const container = document.getElementById('propertiesList');

    container.innerHTML = `
        <!-- ÚNICA TARJETA: NETO A LIQUIDAR (SIN MOSTRAR BRUTO NI COMISIÓN) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div class="bg-emerald-50 border-2 border-emerald-200 p-5 rounded-xl shadow-sm">
                <p class="text-xs font-bold uppercase tracking-wider text-emerald-700">Neto a Liquidar a Propietario</p>
                <p class="text-3xl font-extrabold text-emerald-800 mt-1">${AppUtils.formatCurrency(totalNeto)}</p>
                <p class="text-xs text-emerald-600 mt-1">Total a transferir / percibir correspondiente al período</p>
            </div>
            <div class="bg-slate-50 border border-slate-200 p-5 rounded-xl">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500">Inmuebles en Gestión</p>
                <p class="text-3xl font-extrabold text-slate-800 mt-1">${currentOwnerSummary.totals.activas} <span class="text-sm font-normal text-slate-500">alquiladas</span></p>
                <p class="text-xs text-slate-500 mt-1">De un total de ${propiedades.length} inmuebles registrados</p>
            </div>
        </div>

        <!-- Información de acreditación bancaria -->
        <div class="bg-slate-50 border border-slate-200 p-4 rounded-xl mb-6 text-sm grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><span class="text-slate-400 block text-xs">DNI / CUIT:</span><span class="font-medium text-slate-700">${AppUtils.escapeHtml(owner.dni || 'No registrado')}</span></div>
            <div><span class="text-slate-400 block text-xs">Cuenta de Acreditación (CBU / Alias):</span><span class="font-medium text-slate-700">${AppUtils.escapeHtml(owner.bank_account || 'Sin cuenta bancaria registrada')}</span></div>
            <div><span class="text-slate-400 block text-xs">Contacto:</span><span class="font-medium text-slate-700">${AppUtils.escapeHtml(owner.phone || '')} ${owner.email ? `(${AppUtils.escapeHtml(owner.email)})` : ''}</span></div>
        </div>

        <!-- Listado Detallado Contrato por Contrato -->
        <h4 class="font-bold text-slate-800 text-base mb-3 flex items-center gap-2">
            <i class="fas fa-file-contract text-blue-600"></i>
            Detalle por Inmueble
        </h4>

        ${contratos.length === 0 ? `
            <div class="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <i class="fas fa-home text-gray-400 text-3xl mb-2"></i>
                <p class="text-sm text-gray-500">Este propietario aún no posee contratos de alquiler activos.</p>
            </div>
        ` : `
            <div class="space-y-4">
                ${contratos.map((c, index) => {
                    const monto = parseFloat(c.base_amount) || 0;
                    const comPct = parseFloat(c.agent_commission) || 0;
                    const neto = monto * (1 - (comPct / 100));

                    return `
                        <div class="border border-slate-200 rounded-xl p-5 bg-white shadow-sm hover:border-blue-300 transition">
                            <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b pb-3 mb-3">
                                <div>
                                    <span class="text-xs font-bold text-blue-600 uppercase tracking-wider">Inmueble #${index + 1}</span>
                                    <h5 class="text-base font-bold text-slate-800">${AppUtils.escapeHtml(c.property_address || 'Dirección no especificada')}</h5>
                                </div>
                                <span class="px-2.5 py-1 text-xs rounded-full font-semibold ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}">
                                    ${c.status === 'active' ? 'Activo' : c.status}
                                </span>
                            </div>

                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <span class="text-xs text-slate-400 block">Inquilino</span>
                                    <span class="font-semibold text-slate-800">${AppUtils.escapeHtml(c.tenant_name || 'Sin inquilino')}</span>
                                    <span class="text-xs text-slate-500 block">${AppUtils.escapeHtml(c.tenant_phone || '')}</span>
                                </div>
                                <div>
                                    <span class="text-xs text-slate-400 block">Vigencia</span>
                                    <span class="text-slate-700">${AppUtils.formatDate(c.start_date)} al ${AppUtils.formatDate(c.end_date)}</span>
                                    <span class="text-xs text-slate-400 block">${c.duration || 0} meses</span>
                                </div>
                                <div>
                                    <span class="text-xs text-slate-400 block">Próximo Aumento</span>
                                    <span class="font-medium text-amber-600">${c.next_increase_date ? AppUtils.formatDate(c.next_increase_date) : 'No programado'}</span>
                                    <span class="text-xs text-slate-500 block">${(c.increase_type || 'fijo').toUpperCase()}</span>
                                </div>
                                <div class="bg-emerald-50/60 border border-emerald-100 p-3 rounded-lg text-right">
                                    <span class="text-xs text-emerald-700 block uppercase font-semibold">Neto a Liquidar</span>
                                    <span class="text-base font-black text-emerald-700 block mt-1">${AppUtils.formatCurrency(neto)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `}
    `;

    document.getElementById('propertiesModal').classList.remove('hidden');
}

function closePropertiesModal() {
    const modal = document.getElementById('propertiesModal');
    if (modal) modal.classList.add('hidden');
}

// ============================================
// IMPRESIÓN (SIN DATOS DE COMISIÓN)
// ============================================

function imprimirPropiedades() {
    if (!currentOwnerSummary) return;

    const { owner, contratos, totals } = currentOwnerSummary;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Por favor habilita las ventanas emergentes en tu navegador.');
        return;
    }

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Liquidación a Propietario - ${AppUtils.escapeHtml(owner.name)}</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 25px; margin: 0; }
                .header { border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; }
                .title { font-size: 20px; font-weight: 800; color: #0f172a; }
                .subtitle { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
                .kpi-card { padding: 15px; border: 2px solid #059669; border-radius: 8px; background: #ecfdf5; margin-bottom: 20px; display: inline-block; min-width: 250px; }
                .kpi-title { font-size: 11px; color: #047857; text-transform: uppercase; font-weight: 700; margin: 0; }
                .kpi-val { font-size: 24px; font-weight: 800; color: #065f46; margin-top: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
                th { background: #0f172a; color: white; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; }
                td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; }
                .text-right { text-align: right; }
                .footer { margin-top: 40px; border-top: 1px dashed #cbd5e1; padding-top: 25px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <div class="title">MÓRTOLA & ASOCIADOS</div>
                    <div class="subtitle">Estado de Cuenta y Liquidación a Propietario</div>
                </div>
                <div style="text-align: right; font-size: 12px;">
                    <strong>Fecha:</strong> ${new Date().toLocaleDateString('es-AR')}<br>
                    <strong>Propietario:</strong> ${AppUtils.escapeHtml(owner.name)}<br>
                    <strong>DNI/CUIT:</strong> ${AppUtils.escapeHtml(owner.dni || '-')}
                </div>
            </div>

            <div class="kpi-card">
                <div class="kpi-title">Neto a Liquidar a Propietario</div>
                <div class="kpi-val">${AppUtils.formatCurrency(totals.totalNeto)}</div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Inmueble</th>
                        <th>Inquilino</th>
                        <th>Vigencia</th>
                        <th class="text-right">Neto a Liquidar</th>
                    </tr>
                </thead>
                <tbody>
                    ${contratos.map(c => {
                        const b = parseFloat(c.base_amount) || 0;
                        const com = b * ((parseFloat(c.agent_commission) || 0) / 100);
                        const net = b - com;
                        return `
                            <tr>
                                <td><strong>${AppUtils.escapeHtml(c.property_address || '-')}</strong></td>
                                <td>${AppUtils.escapeHtml(c.tenant_name || '-')}</td>
                                <td>${AppUtils.formatDate(c.start_date)} al ${AppUtils.formatDate(c.end_date)}</td>
                                <td class="text-right"><strong>${AppUtils.formatCurrency(net)}</strong></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            <div class="footer">
                <div>Cuenta de Acreditación: ${AppUtils.escapeHtml(owner.bank_account || 'A coordinar')}</div>
                <div style="text-align: right;">Mórtola & Asociados - Gestión Inmobiliaria</div>
            </div>

            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                };
            <\/script>
        </body>
        </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

// ============================================
// PDF MULTIPÁGINA (SIN DATOS DE COMISIÓN)
// ============================================

async function exportarPropiedadesPDF() {
    if (!currentOwnerSummary) return;

    const { owner, contratos, totals } = currentOwnerSummary;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('MÓRTOLA & ASOCIADOS', 14, 18);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('INFORME DE LIQUIDACIÓN Y ESTADO DE CUENTA', 14, 23);
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-AR')}`, 14, 28);

    doc.setDrawColor(200);
    doc.line(14, 31, 196, 31);

    doc.setFontSize(10);
    doc.setTextColor(40);
    doc.setFont('helvetica', 'bold');
    doc.text(`Propietario: ${owner.name}`, 14, 38);
    doc.setFont('helvetica', 'normal');
    doc.text(`DNI/CUIT: ${owner.dni || 'No registrado'}  |  Tel: ${owner.phone || '-'}  |  Email: ${owner.email || '-'}`, 14, 43);
    doc.text(`Cuenta Bancaria: ${owner.bank_account || 'Sin datos de cuenta'}`, 14, 48);

    // Tabla sin bruto ni comisión
    const bodyRows = contratos.map((c, i) => {
        const monto = parseFloat(c.base_amount) || 0;
        const comPct = parseFloat(c.agent_commission) || 0;
        const neto = monto * (1 - (comPct / 100));

        return [
            `${i + 1}. ${c.property_address || 'Inmueble'}`,
            c.tenant_name || 'Inquilino',
            `${c.duration || 0} meses\n(${AppUtils.formatDate(c.start_date)} - ${AppUtils.formatDate(c.end_date)})`,
            c.status === 'active' ? 'Activo' : c.status,
            AppUtils.formatCurrency(neto)
        ];
    });

    doc.autoTable({
        startY: 54,
        head: [['Inmueble', 'Inquilino', 'Período / Vigencia', 'Estado', 'Neto a Liquidar']],
        body: bodyRows,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 9 },
        bodyStyles: { fontSize: 8.5 },
        columnStyles: {
            4: { halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
    });

    let finalY = doc.lastAutoTable.finalY + 12;
    if (finalY > 240) {
        doc.addPage();
        finalY = 20;
    }

    // Cuadro de Resumen Neto Final
    doc.setDrawColor(5, 150, 105);
    doc.setFillColor(236, 253, 245);
    doc.roundedRect(14, finalY, 182, 22, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(6, 95, 70);
    doc.text(`TOTAL NETO A LIQUIDAR: ${AppUtils.formatCurrency(totals.totalNeto)}`, 20, finalY + 14);

    // Firma
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.line(130, finalY + 45, 185, finalY + 45);
    doc.text('Administración Mórtola & Asoc.', 135, finalY + 49);

    const safeName = owner.name.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Liquidacion_${safeName}.pdf`);
    if (window.UI) UI.toast('PDF de liquidación generado', 'success');
}

// ============================================
// EXCEL (SIN COLUMNAS DE COMISIÓN NI BRUTO)
// ============================================

function exportarPropiedadesExcel() {
    if (!currentOwnerSummary) return;

    const { owner, contratos, totals } = currentOwnerSummary;
    if (typeof XLSX === 'undefined') {
        alert('Librería de Excel no cargada.');
        return;
    }

    const rows = contratos.map((c, i) => {
        const monto = parseFloat(c.base_amount) || 0;
        const comPct = parseFloat(c.agent_commission) || 0;
        const neto = monto * (1 - (comPct / 100));

        return {
            'N°': i + 1,
            'Inmueble': c.property_address || '',
            'Inquilino': c.tenant_name || '',
            'Teléfono': c.tenant_phone || '',
            'Inicio': c.start_date ? c.start_date.slice(0, 10) : '',
            'Fin': c.end_date ? c.end_date.slice(0, 10) : '',
            'Estado': c.status || '',
            'Neto a Liquidar ($)': neto,
            'Próximo Aumento': c.next_increase_date ? c.next_increase_date.slice(0, 10) : ''
        };
    });

    rows.push({
        'N°': '',
        'Inmueble': 'TOTAL NETO A LIQUIDAR',
        'Inquilino': '',
        'Teléfono': '',
        'Inicio': '',
        'Fin': '',
        'Estado': '',
        'Neto a Liquidar ($)': totals.totalNeto,
        'Próximo Aumento': ''
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Liquidación Propietario');

    const safeName = owner.name.replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.writeFile(workbook, `Liquidacion_${safeName}.xlsx`);
    if (window.UI) UI.toast('Planilla Excel exportada', 'success');
}

// ============================================
// EMAIL PRIVADO AL PROPIETARIO
// ============================================

function enviarEmailPropietario() {
    if (!currentOwnerSummary) return;

    const { owner, contratos, totals } = currentOwnerSummary;
    const email = owner.email || '';
    const subject = encodeURIComponent(`Liquidación Mensual - ${owner.name}`);

    let detalle = contratos.map((c, i) => {
        const b = parseFloat(c.base_amount) || 0;
        const com = b * ((parseFloat(c.agent_commission) || 0) / 100);
        const net = b - com;
        return `${i + 1}) Inmueble: ${c.property_address || 'Propiedad'}
   Inquilino: ${c.tenant_name || '-'}
   Neto a Liquidar: ${AppUtils.formatCurrency(net)}`;
    }).join('\n\n');

    const cuerpo = encodeURIComponent(
`Estimado/a ${owner.name},

Le enviamos el resumen de liquidación correspondiente a sus inmuebles administrados:

${detalle}

---------------------------------------------
TOTAL NETO A LIQUIDAR: ${AppUtils.formatCurrency(totals.totalNeto)}
---------------------------------------------
Cuenta bancaria de depósito: ${owner.bank_account || 'A coordinar'}

Quedamos a su entera disposición ante cualquier consulta.

Atentamente,
Mórtola & Asociados - Gestión Inmobiliaria`
    );

    window.location.href = `mailto:${email}?subject=${subject}&body=${cuerpo}`;
}

// ============================================
// CRUD BÁSICO DE PROPIETARIOS
// ============================================

function abrirModalNuevoPropietario() {
    const form = document.getElementById('ownerForm');
    if (form) form.reset();
    document.getElementById('ownerId').value = '';
    document.getElementById('modalTitle').textContent = 'Nuevo Propietario';
    document.getElementById('ownerModal').classList.remove('hidden');
}

function cerrarModalPropietario() {
    document.getElementById('ownerModal').classList.add('hidden');
}

function editarPropietario(id) {
    const owner = currentOwners.find(o => o.id === id);
    if (!owner) return;

    document.getElementById('ownerId').value = owner.id;
    document.getElementById('ownerDni').value = owner.dni || '';
    document.getElementById('ownerName').value = owner.name || '';
    document.getElementById('ownerEmail').value = owner.email || '';
    document.getElementById('ownerPhone').value = owner.phone || '';
    document.getElementById('ownerAddress').value = owner.address || '';
    document.getElementById('ownerBankAccount').value = owner.bank_account || '';
    document.getElementById('ownerNotes').value = owner.notes || '';

    document.getElementById('modalTitle').textContent = 'Editar Propietario';
    document.getElementById('ownerModal').classList.remove('hidden');
}

async function guardarPropietario() {
    const id = document.getElementById('ownerId').value;
    const name = document.getElementById('ownerName').value.trim();
    if (!name) return;

    const payload = {
        dni: document.getElementById('ownerDni').value.trim(),
        name,
        email: document.getElementById('ownerEmail').value.trim(),
        phone: document.getElementById('ownerPhone').value.trim(),
        address: document.getElementById('ownerAddress').value.trim(),
        bank_account: document.getElementById('ownerBankAccount').value.trim(),
        notes: document.getElementById('ownerNotes').value.trim()
    };

    try {
        if (id) {
            payload.id = parseInt(id, 10);
            await API.updateOwner(payload);
            if (window.UI) UI.toast('Propietario actualizado con éxito', 'success');
        } else {
            await API.createOwner(payload);
            if (window.UI) UI.toast('Propietario registrado con éxito', 'success');
        }

        cerrarModalPropietario();
        await cargarDatosIniciales();
    } catch (err) {
        if (window.UI) UI.toast(err.message || 'Error al guardar', 'error');
    }
}

async function eliminarPropietario(id) {
    if (!confirm('¿Estás seguro de eliminar este propietario? Esta acción podría desvincular sus propiedades.')) return;
    try {
        await API.deleteOwner(id);
        if (window.UI) UI.toast('Propietario eliminado', 'success');
        await cargarDatosIniciales();
    } catch (err) {
        if (window.UI) UI.toast(err.message || 'Error al eliminar', 'error');
    }
}

// Exposición global
window.verPropiedades = verPropiedades;
window.closePropertiesModal = closePropertiesModal;
window.imprimirPropiedades = imprimirPropiedades;
window.exportarPropiedadesPDF = exportarPropiedadesPDF;
window.exportarPropiedadesExcel = exportarPropiedadesExcel;
window.enviarEmailPropietario = enviarEmailPropietario;
window.editarPropietario = editarPropietario;
window.eliminarPropietario = eliminarPropietario;