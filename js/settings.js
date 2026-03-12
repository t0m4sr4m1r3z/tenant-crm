// Settings management
document.addEventListener('DOMContentLoaded', () => {
    if (!window.AUTH) {
        console.error('Auth module not loaded');
        return;
    }
    
    const user = window.AUTH.getCurrentUser();
    if (!user) return;
    
    initSidebar();
    loadSettings();
    initSettingsForm();
});

function initSidebar() {
    // Same sidebar initialization
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

function loadSettings() {
    // Load saved settings from localStorage
    const settings = JSON.parse(localStorage.getItem('appSettings')) || {
        emailFrom: 'notificaciones@tenantcrm.com',
        emailSignature: 'Atentamente,\nEquipo de Gestión',
        defaultCommission: 5,
        defaultIncreaseFrequency: 12
    };
    
    // Populate form
    document.getElementById('emailFrom').value = settings.emailFrom;
    document.getElementById('emailSignature').value = settings.emailSignature;
    document.getElementById('defaultCommission').value = settings.defaultCommission;
    document.getElementById('defaultIncreaseFrequency').value = settings.defaultIncreaseFrequency;
    
    // Update last sync
    document.getElementById('lastSync').textContent = new Date().toLocaleString();
}

function initSettingsForm() {
    const inputs = ['emailFrom', 'emailSignature', 'defaultCommission', 'defaultIncreaseFrequency'];
    
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', saveSettings);
            element.addEventListener('keyup', debounce(saveSettings, 500));
        }
    });
}

function saveSettings() {
    const settings = {
        emailFrom: document.getElementById('emailFrom').value,
        emailSignature: document.getElementById('emailSignature').value,
        defaultCommission: parseFloat(document.getElementById('defaultCommission').value) || 5,
        defaultIncreaseFrequency: parseInt(document.getElementById('defaultIncreaseFrequency').value) || 12
    };
    
    localStorage.setItem('appSettings', JSON.stringify(settings));
    console.log('Settings saved:', settings);
}

// Debounce function to prevent too many saves
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}