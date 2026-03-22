/* ===================================================================
   ITC Area Clienti - Dashboard Upload
   =================================================================== */

// Stato della dashboard
const Dashboard = {
    selectedCategory: null,
    fileQueue: [],
    isUploading: false,
    uploadHistory: [],

    // Inizializzazione
    init() {
        const session = Auth.requireAuth();
        if (!session) return;

        // Popola UI con dati utente
        const displayName = session.nome ? `${session.nome} ${session.cognome}` : session.cognome;
        document.getElementById('userName').textContent = displayName;
        document.getElementById('userNameMobile').textContent = displayName;

        // Renderizza categorie
        this.renderCategories();

        // Inizializza dropzone
        this.initDropzone();

        // Carica storico
        this.loadHistory();

        // Animazioni entrata
        this.animateEntrance();

        // Inizializza icone
        lucide.createIcons();
    },

    // Renderizza le card delle categorie
    renderCategories() {
        const grid = document.getElementById('categoryGrid');
        grid.innerHTML = CONFIG.CATEGORIES.map(cat => `
            <div class="category-card" data-category="${cat.id}" onclick="Dashboard.selectCategory('${cat.id}')">
                <i data-lucide="${cat.icon}" class="category-icon" style="width:28px;height:28px;"></i>
                <span class="category-name">${cat.label}</span>
                <span class="category-count" id="count-${cat.id}">0 file</span>
            </div>
        `).join('');
    },

    // Seleziona categoria
    selectCategory(categoryId) {
        this.selectedCategory = categoryId;

        // Aggiorna UI
        document.querySelectorAll('.category-card').forEach(card => {
            card.classList.toggle('active', card.dataset.category === categoryId);
        });

        // Abilita dropzone
        const dropzone = document.getElementById('uploadZone');
        dropzone.classList.remove('disabled');

        // Aggiorna testo dropzone
        const cat = CONFIG.CATEGORIES.find(c => c.id === categoryId);
        document.getElementById('dropzoneCategory').textContent = cat ? cat.label : '';

        lucide.createIcons();
    },

    // Inizializza drag & drop
    initDropzone() {
        const dropzone = document.getElementById('uploadZone');
        const input = document.getElementById('fileInput');

        ['dragenter', 'dragover'].forEach(event => {
            dropzone.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.selectedCategory && !this.isUploading) {
                    dropzone.classList.add('dragover');
                }
            });
        });

        ['dragleave', 'drop'].forEach(event => {
            dropzone.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            if (!this.selectedCategory || this.isUploading) return;
            const files = e.dataTransfer.files;
            this.addFiles(files);
        });

        dropzone.addEventListener('click', () => {
            if (!this.selectedCategory || this.isUploading) return;
            input.click();
        });

        input.addEventListener('change', (e) => {
            this.addFiles(e.target.files);
            input.value = '';
        });
    },

    // Aggiungi file alla coda
    addFiles(fileList) {
        if (!this.selectedCategory) {
            Toast.warning('Seleziona prima una categoria');
            return;
        }

        const files = Array.from(fileList);
        let addedCount = 0;

        files.forEach(file => {
            const validation = this.validateFile(file);
            if (validation.valid) {
                // Evita duplicati
                const exists = this.fileQueue.some(f =>
                    f.file.name === file.name && f.file.size === file.size
                );
                if (!exists) {
                    this.fileQueue.push({
                        id: Date.now() + Math.random(),
                        file: file,
                        status: 'pending', // pending, uploading, success, error
                        progress: 0,
                        error: null
                    });
                    addedCount++;
                }
            } else {
                Toast.error(validation.error);
            }
        });

        if (addedCount > 0) {
            this.renderFileQueue();
        }
    },

    // Valida singolo file
    validateFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
            return { valid: false, error: `Formato .${ext} non supportato per "${file.name}"` };
        }
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            return { valid: false, error: `"${file.name}" supera il limite di 25MB` };
        }
        if (file.size === 0) {
            return { valid: false, error: `"${file.name}" e' un file vuoto` };
        }
        return { valid: true };
    },

    // Renderizza coda file
    renderFileQueue() {
        const container = document.getElementById('fileQueue');
        const list = document.getElementById('fileQueueList');
        const countEl = document.getElementById('queueCount');
        const uploadBtn = document.getElementById('uploadBtn');

        if (this.fileQueue.length === 0) {
            container.classList.remove('has-files');
            return;
        }

        container.classList.add('has-files');
        countEl.textContent = `${this.fileQueue.length} file`;

        list.innerHTML = this.fileQueue.map(item => `
            <div class="file-item ${item.status}" data-id="${item.id}">
                <i data-lucide="${getFileIcon(item.file.name)}" class="file-item-icon" style="width:20px;height:20px;"></i>
                <div class="file-item-info">
                    <div class="file-item-name">${item.file.name}</div>
                    <div class="file-item-size">${formatFileSize(item.file.size)}</div>
                </div>
                <div class="file-item-status">
                    ${item.status === 'pending' ? `
                        <button class="remove-btn" onclick="Dashboard.removeFile(${item.id})" title="Rimuovi">
                            <i data-lucide="x" style="width:16px;height:16px;"></i>
                        </button>
                    ` : ''}
                    ${item.status === 'uploading' ? `
                        <div class="file-item-progress">
                            <div class="file-item-progress-bar" style="width:${item.progress}%"></div>
                        </div>
                        <div class="spinner"></div>
                    ` : ''}
                    ${item.status === 'success' ? `
                        <i data-lucide="check-circle" class="file-item-status-icon" style="width:20px;height:20px;"></i>
                    ` : ''}
                    ${item.status === 'error' ? `
                        <i data-lucide="alert-circle" class="file-item-status-icon" style="width:20px;height:20px;"></i>
                    ` : ''}
                </div>
            </div>
        `).join('');

        // Aggiorna stato bottone upload
        const pendingFiles = this.fileQueue.filter(f => f.status === 'pending');
        uploadBtn.disabled = pendingFiles.length === 0 || this.isUploading;
        uploadBtn.querySelector('span').textContent =
            this.isUploading ? 'Caricamento in corso...' :
            `Carica ${pendingFiles.length} File`;

        lucide.createIcons({ nodes: [list] });
    },

    // Rimuovi file dalla coda
    removeFile(id) {
        this.fileQueue = this.fileQueue.filter(f => f.id !== id);
        this.renderFileQueue();
    },

    // Svuota coda
    clearQueue() {
        this.fileQueue = this.fileQueue.filter(f => f.status === 'uploading');
        this.renderFileQueue();
    },

    // Carica tutti i file
    async uploadAll() {
        if (this.isUploading || !this.selectedCategory) return;

        const session = Auth.getSession();
        if (!session) {
            Toast.error('Sessione scaduta. Effettua di nuovo il login.');
            setTimeout(() => Auth.logout(), 2000);
            return;
        }

        this.isUploading = true;
        const pendingFiles = this.fileQueue.filter(f => f.status === 'pending');
        const uploadedFiles = [];

        this.renderFileQueue();

        for (const item of pendingFiles) {
            item.status = 'uploading';
            item.progress = 10;
            this.renderFileQueue();

            try {
                // Leggi file come Base64
                const base64 = await this.readFileAsBase64(item.file);
                item.progress = 40;
                this.renderFileQueue();

                // Genera nome con prefisso data
                const datePrefix = getDatePrefix();
                const renamedFile = `${datePrefix}_${item.file.name}`;

                // Upload via API
                const result = await apiCall('uploadFile', {
                    token: session.token,
                    fileName: renamedFile,
                    originalName: item.file.name,
                    mimeType: item.file.type || 'application/octet-stream',
                    base64Data: base64,
                    category: this.selectedCategory,
                    clientEmail: session.email
                });

                item.progress = 100;

                if (result.success) {
                    item.status = 'success';
                    uploadedFiles.push({
                        fileName: renamedFile,
                        originalName: item.file.name,
                        category: this.selectedCategory
                    });
                } else {
                    item.status = 'error';
                    item.error = result.error;
                    Toast.error(`Errore upload "${item.file.name}": ${result.error}`);
                }
            } catch (err) {
                item.status = 'error';
                item.error = 'Errore di rete';
                Toast.error(`Errore upload "${item.file.name}"`);
            }

            this.renderFileQueue();
        }

        // Invia notifica email se ci sono file caricati
        if (uploadedFiles.length > 0) {
            try {
                await apiCall('sendNotification', {
                    token: session.token,
                    files: uploadedFiles
                });
            } catch (err) {
                console.error('Errore invio notifica:', err);
            }

            Toast.success(`${uploadedFiles.length} file caricati con successo!`);

            // Aggiorna storico
            this.loadHistory();

            // Aggiorna contatori categorie
            this.updateCategoryCounts();
        }

        this.isUploading = false;
        this.renderFileQueue();

        // Pulisci file completati dopo 3 secondi
        setTimeout(() => {
            this.fileQueue = this.fileQueue.filter(f => f.status !== 'success');
            this.renderFileQueue();
        }, 3000);
    },

    // Leggi file come Base64
    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Errore lettura file'));
            reader.readAsDataURL(file);
        });
    },

    // Carica storico caricamenti
    async loadHistory() {
        const session = Auth.getSession();
        if (!session) return;

        const result = await apiCall('getUploadHistory', {
            email: session.email,
            token: session.token
        }, 'GET');

        if (result.success) {
            this.uploadHistory = result.uploads || [];
            this.renderHistory();
            this.updateCategoryCounts();
        }
    },

    // Renderizza tabella storico
    renderHistory(filterCategory = null) {
        const tbody = document.getElementById('historyBody');
        const emptyState = document.getElementById('historyEmpty');
        const tableContainer = document.getElementById('historyTable');

        let filtered = this.uploadHistory;
        if (filterCategory && filterCategory !== 'all') {
            filtered = filtered.filter(u => u.category === filterCategory);
        }

        // Ordina per data decrescente
        filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (filtered.length === 0) {
            emptyState.classList.remove('hidden');
            tableContainer.classList.add('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        tableContainer.classList.remove('hidden');

        const categoryLabels = {};
        CONFIG.CATEGORIES.forEach(c => { categoryLabels[c.id] = c.label; });

        tbody.innerHTML = filtered.map(upload => `
            <tr>
                <td>${formatDate(upload.timestamp)}</td>
                <td>
                    <div class="flex gap-8" style="align-items:center;">
                        <i data-lucide="${getFileIcon(upload.originalName || upload.fileName)}" style="width:16px;height:16px;color:var(--color-accent);flex-shrink:0;"></i>
                        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px;" title="${upload.originalName || upload.fileName}">
                            ${upload.originalName || upload.fileName}
                        </span>
                    </div>
                </td>
                <td><span class="badge badge-neutral">${categoryLabels[upload.category] || upload.category}</span></td>
                <td>
                    <div class="flex gap-8" style="align-items:center;">
                        <span class="badge badge-success">Caricato</span>
                        <button class="btn-delete-file" onclick="Dashboard.deleteFile('${upload.fileId}', '${(upload.originalName || upload.fileName).replace(/'/g, "\\'")}')" title="Elimina file">
                            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        lucide.createIcons({ nodes: [tbody] });
    },

    // Aggiorna contatori per categoria
    updateCategoryCounts() {
        CONFIG.CATEGORIES.forEach(cat => {
            const count = this.uploadHistory.filter(u => u.category === cat.id).length;
            const el = document.getElementById(`count-${cat.id}`);
            if (el) el.textContent = `${count} file`;
        });
    },

    // Elimina file (sposta in cartella cancellati)
    async deleteFile(fileId, fileName) {
        if (!confirm(`Sei sicuro di voler eliminare "${fileName}"?\nIl file verrà spostato nella cartella "Cancellati dal cliente".`)) {
            return;
        }

        const session = Auth.getSession();
        if (!session) return;

        const result = await apiCall('clientDeleteFile', {
            token: session.token,
            fileId: fileId
        });

        if (result.success) {
            Toast.success('File eliminato');
            this.loadHistory();
        } else {
            Toast.error(result.error || 'Errore nell\'eliminazione');
        }
    },

    // Filtra storico per categoria
    filterHistory(category) {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === category);
        });
        this.renderHistory(category);
    },

    // Animazioni entrata
    animateEntrance() {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        tl.to('.dashboard-header', { opacity: 1, y: 0, duration: 0.8 })
          .to('.category-section', { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
          .to('.upload-section', { opacity: 1, y: 0, duration: 0.6 }, '-=0.3')
          .to('.history-section', { opacity: 1, y: 0, duration: 0.6 }, '-=0.3');
    }
};

// Mostra modale cambio password
function showPasswordModal() {
    document.getElementById('passwordModal').classList.add('active');
}

function hidePasswordModal() {
    document.getElementById('passwordModal').classList.remove('active');
    document.getElementById('passwordForm').reset();
    document.getElementById('passwordError').classList.add('hidden');
}

async function handlePasswordChange(e) {
    e.preventDefault();

    const currentPwd = document.getElementById('currentPassword').value;
    const newPwd = document.getElementById('newPassword').value;
    const confirmPwd = document.getElementById('confirmPassword').value;
    const errorEl = document.getElementById('passwordError');
    const errorText = document.getElementById('passwordErrorText');

    errorEl.classList.add('hidden');

    if (newPwd.length < 6) {
        errorText.textContent = 'La nuova password deve avere almeno 6 caratteri';
        errorEl.classList.remove('hidden');
        return;
    }

    if (newPwd !== confirmPwd) {
        errorText.textContent = 'Le password non corrispondono';
        errorEl.classList.remove('hidden');
        return;
    }

    const btn = document.getElementById('passwordBtn');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Salvataggio...';

    const result = await Auth.changePassword(currentPwd, newPwd);

    if (result.success) {
        Toast.success('Password aggiornata con successo');
        hidePasswordModal();
    } else {
        errorText.textContent = result.error || 'Errore nel cambio password';
        errorEl.classList.remove('hidden');
    }

    btn.disabled = false;
    btn.querySelector('span').textContent = 'Salva Password';
}

// Inizializza quando il DOM e' pronto
document.addEventListener('DOMContentLoaded', () => {
    Dashboard.init();
});
