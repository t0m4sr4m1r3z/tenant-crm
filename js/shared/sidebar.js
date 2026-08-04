// sidebar.js - Lógica centralizada del menú lateral
(function(global) {
    'use strict';

    function initSidebar() {
        const menuBtn = document.getElementById('menuBtn');
        const sidebar = document.getElementById('sidebar');
        const closeBtn = document.getElementById('closeSidebarBtn');
        const overlay = document.getElementById('sidebarOverlay');
        
        if (menuBtn && sidebar) {
            menuBtn.addEventListener('click', function() {
                sidebar.classList.remove('hidden');
            });
        }
        
        if (closeBtn && sidebar) {
            closeBtn.addEventListener('click', function() {
                sidebar.classList.add('hidden');
            });
        }
        
        if (overlay && sidebar) {
            overlay.addEventListener('click', function() {
                sidebar.classList.add('hidden');
            });
        }
        
        // Cerrar sidebar al presionar ESC
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && sidebar && !sidebar.classList.contains('hidden')) {
                sidebar.classList.add('hidden');
            }
        });
    }

    // Exponer al ámbito global
    global.AppSidebar = {
        init: initSidebar
    };

    console.log('✅ Sidebar centralizado cargado');

})(window);