/* ===================================================================
   ITC Area Clienti - Configurazione
   =================================================================== */

const CONFIG = {
    // URL del Google Apps Script Web App (da aggiornare dopo il deploy)
    API_URL: 'https://script.google.com/macros/s/AKfycbw0q-uXOUOsydAndKL4k7IdaboOXCsW9SBZd2byGEcwcaHx4u7yyEsIbBDICeK5UutjXA/exec',

    // Dimensione massima file (25MB)
    MAX_FILE_SIZE: 25 * 1024 * 1024,

    // Estensioni file consentite (gestite anche lato server)
    ALLOWED_EXTENSIONS: ['pdf', 'doc', 'docx', 'csv', 'xls', 'xlsx'],

    // Categorie documenti
    CATEGORIES: [
        { id: 'fatture_acquisto', label: 'Fatture Acquisto', icon: 'shopping-cart', folder: 'Fatture acquisto' },
        { id: 'fatture_vendita', label: 'Fatture Vendita', icon: 'receipt', folder: 'Fatture vendita' },
        { id: 'ddt', label: 'DDT', icon: 'truck', folder: 'DDT' },
        { id: 'estratti_conto', label: 'Estratti Conto', icon: 'landmark', folder: 'Estratti conto' },
        { id: 'prima_nota', label: 'Prima Nota', icon: 'notebook-pen', folder: 'Prima nota' }
    ],

    // Durata sessione (8 ore)
    SESSION_DURATION: 8 * 60 * 60 * 1000,

    // Chiave localStorage per la sessione
    SESSION_KEY: 'itc_session',

    // URL del sito principale (per il link "Torna al sito")
    SITE_URL: '#',

    // Formati data
    DATE_LOCALE: 'it-IT',

    // Mappa icone per estensioni file
    FILE_ICONS: {
        'pdf': 'file-text',
        'doc': 'file-type',
        'docx': 'file-type',
        'csv': 'file-spreadsheet',
        'xls': 'file-spreadsheet',
        'xlsx': 'file-spreadsheet'
    }
};

// Utility per formattare la dimensione file
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Utility per generare il prefisso data YYYYMMDD
function getDatePrefix() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

// Utility per formattare data in italiano
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString(CONFIG.DATE_LOCALE, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Utility per ottenere l'icona del file in base all'estensione
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    return CONFIG.FILE_ICONS[ext] || 'file';
}

// Toast notification system
const Toast = {
    container: null,

    init() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    },

    show(message, type = 'success', duration = 4000) {
        this.init();

        const icons = {
            success: 'check-circle',
            error: 'alert-circle',
            warning: 'alert-triangle',
            info: 'info'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i data-lucide="${icons[type] || 'info'}" class="toast-icon" style="width:20px;height:20px;"></i>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i data-lucide="x" style="width:16px;height:16px;"></i>
            </button>
        `;

        this.container.appendChild(toast);
        lucide.createIcons({ nodes: [toast] });

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error', 6000); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); }
};

// API helper
async function apiCall(action, data = {}, method = 'POST') {
    try {
        if (method === 'GET') {
            const params = new URLSearchParams({ action, ...data });
            const response = await fetch(`${CONFIG.API_URL}?${params}`);
            return await response.json();
        } else {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action, ...data })
            });
            return await response.json();
        }
    } catch (err) {
        console.error('API Error:', err);
        return { success: false, error: 'Errore di connessione al server' };
    }
}
