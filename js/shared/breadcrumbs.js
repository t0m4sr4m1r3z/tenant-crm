// breadcrumbs.js - Componente de migas de pan (breadcrumbs)
(function(global) {
    'use strict';

    // Mapa de rutas: asociar nombre de archivo con etiqueta y jerarquía
    const ROUTES = {
        'dashboard.html': { label: 'Inicio', parent: null, icon: 'fa-home' },
        'tenants.html': { label: 'Inquilinos', parent: 'dashboard.html', icon: 'fa-users' },
        'owners.html': { label: 'Propietarios', parent: 'dashboard.html', icon: 'fa-user-tie' },
        'properties.html': { label: 'Propiedades', parent: 'dashboard.html', icon: 'fa-building' },
        'contracts.html': { label: 'Contratos', parent: 'dashboard.html', icon: 'fa-file-contract' },
        'payments.html': { label: 'Pagos', parent: 'dashboard.html', icon: 'fa-dollar-sign' },
        'calendar.html': { label: 'Calendario', parent: 'dashboard.html', icon: 'fa-calendar-alt' },
        'reports.html': { label: 'Reportes', parent: 'dashboard.html', icon: 'fa-chart-bar' },
        'settings.html': { label: 'Configuración', parent: 'dashboard.html', icon: 'fa-cog' }
    };
    // Obtener el nombre del archivo actual
    function getCurrentPage() {
        const path = window.location.pathname;
        const fileName = path.substring(path.lastIndexOf('/') + 1);
        return fileName || 'dashboard.html';
    }

    // Construir la ruta completa (array de objetos {label, url, icon})
    function buildBreadcrumbTrail(currentPage) {
        const trail = [];
        let current = currentPage;

        // Recorrer la jerarquía desde la página actual hasta la raíz
        while (current && ROUTES[current]) {
            const route = ROUTES[current];
            trail.unshift({
                label: route.label,
                url: current,
                icon: route.icon || null,
                isCurrent: (current === currentPage)
            });
            current = route.parent;
        }

        // Si la raíz no es dashboard, añadir Inicio como primer elemento
        if (trail.length > 0 && trail[0].url !== 'dashboard.html') {
            trail.unshift({
                label: 'Inicio',
                url: 'dashboard.html',
                icon: 'fa-home',
                isCurrent: false
            });
        }

        return trail;
    }

    // Renderizar el breadcrumb en el contenedor
    function renderBreadcrumbs(containerId = 'breadcrumbContainer') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('⚠️ Contenedor de breadcrumbs no encontrado:', containerId);
            return;
        }

        // No mostrar breadcrumbs en la página de login
        if (window.location.pathname.includes('login.html')) {
            container.style.display = 'none';
            return;
        }

        const currentPage = getCurrentPage();
        const trail = buildBreadcrumbTrail(currentPage);

        if (trail.length === 0) {
            container.style.display = 'none';
            return;
        }

        // Construir HTML
        let html = `<nav aria-label="Migas de pan" class="breadcrumb-nav">`;
        html += `<ol class="breadcrumb-list">`;

        trail.forEach((item, index) => {
            const isLast = index === trail.length - 1;
            const isFirst = index === 0;

            html += `<li class="breadcrumb-item ${isLast ? 'active' : ''}">`;

            if (isLast) {
                // Elemento actual (sin enlace)
                html += `<span class="breadcrumb-current" aria-current="page">`;
                if (item.icon) {
                    html += `<i class="fas ${item.icon} breadcrumb-icon" aria-hidden="true"></i> `;
                }
                html += `${item.label}`;
                html += `</span>`;
            } else {
                // Elemento con enlace
                html += `<a href="/${item.url}" class="breadcrumb-link">`;
                if (item.icon) {
                    html += `<i class="fas ${item.icon} breadcrumb-icon" aria-hidden="true"></i> `;
                }
                html += `${item.label}`;
                html += `</a>`;
                // Separador
                html += `<span class="breadcrumb-separator" aria-hidden="true">/</span>`;
            }

            html += `</li>`;
        });

        html += `</ol>`;
        html += `</nav>`;

        container.innerHTML = html;
        container.style.display = 'block';
    }

    // Inicializar breadcrumbs cuando el DOM esté listo
    function initBreadcrumbs() {
        // Esperar a que el DOM esté completamente cargado
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                renderBreadcrumbs();
            });
        } else {
            renderBreadcrumbs();
        }
    }

    // Exponer al ámbito global
    global.Breadcrumbs = {
        init: initBreadcrumbs,
        render: renderBreadcrumbs
    };

    console.log('✅ Breadcrumbs module loaded');

})(window);