// Main dashboard functionality
document.addEventListener('DOMContentLoaded', async () => {
    console.log('í³Š Dashboard cargado');
    
    // Verificar autenticaciÃ³n
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    // Mostrar nombre del usuario
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userNameSpan = document.getElementById('userName');
    if (userNameSpan) {
        userNameSpan.textContent = user.name || 'Administrador';
    }
    
    initSidebar();
    await loadDashboardData();
});

function initSidebar() {
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const closeBtn = document.getElementById('closeSidebarBtn');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.remove('hidden');
        });
    }
    
    if (closeBtn && sidebar) {
        closeBtn.addEventListener('click', () => {
            sidebar.classList.add('hidden');
        });
    }
    
    if (overlay && sidebar) {
        overlay.addEventListener('click', () => {
            sidebar.classList.add('hidden');
        });
    }
}

async function loadDashboardData() {
    try {
        const token = localStorage.getItem('authToken');
        
        // Cargar inquilinos
        const tenantsResponse = await fetch('/.netlify/functions/tenants', {
            headers: { 'Authorization': token }
        });
        const tenants = await tenantsResponse.json();
        
        // Cargar contratos
        const contractsResponse = await fetch('/.netlify/functions/contracts', {
            headers: { 'Authorization': token }
        });
        const contracts = await contractsResponse.json();
        
        // Actualizar estadÃ­sticas
        document.getElementById('totalTenants').textContent = tenants.length || 0;
        document.getElementById('activeContracts').textContent = contracts.filter(c => c.status === 'active').length || 0;
        
        // Calcular prÃ³ximos aumentos
        const today = new Date();
        const upcomingIncreases = contracts.filter(c => {
            if (!c.next_increase) return false;
            const nextDate = new Date(c.next_increase);
            const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
            return diffDays > 0 && diffDays <= 30;
        }).length;
        document.getElementById('upcomingIncreases').textContent = upcomingIncreases;
        
        // Calcular ingresos mensuales
        const monthlyIncome = contracts
            .filter(c => c.status === 'active')
            .reduce((sum, c) => sum + (parseFloat(c.base_amount) || 0), 0);
        document.getElementById('monthlyIncome').textContent = `$${monthlyIncome.toLocaleString()}`;
        
        // Mostrar actividad reciente
        const recentActivity = document.getElementById('recentActivityTable');
        if (recentActivity) {
            const activities = [];
            
            // Agregar inquilinos recientes
            tenants.slice(0, 3).forEach(t => {
                activities.push({
                    name: t.name,
                    action: 'Inquilino agregado',
                    date: new Date(t.created_at).toLocaleDateString(),
                    status: 'Completado'
                });
            });
            
            // Agregar contratos recientes
            contracts.slice(0, 3).forEach(c => {
                activities.push({
                    name: c.tenant_name,
                    action: 'Contrato creado',
                    date: new Date(c.created_at).toLocaleDateString(),
                    status: c.status === 'active' ? 'Activo' : 'Pendiente'
                });
            });
            
            // Ordenar por fecha (mÃ¡s reciente primero)
            activities.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            if (activities.length === 0) {
                recentActivity.innerHTML = `
                    <tr>
                        <td colspan="4" class="py-8 text-center text-gray-500">
                            No hay actividad reciente
                        </td>
                    </tr>
                `;
            } else {
                recentActivity.innerHTML = activities.slice(0, 5).map(a => `
                    <tr class="border-b">
                        <td class="py-3">${a.name}</td>
                        <td class="py-3">${a.action}</td>
                        <td class="py-3">${a.date}</td>
                        <td class="py-3">
                            <span class="px-2 py-1 text-xs rounded-full ${a.status === 'Activo' || a.status === 'Completado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                                ${a.status}
                            </span>
                        </td>
                    </tr>
                `).join('');
            }
        }
        
    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}
