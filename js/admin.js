/* ===================================================================
   ITC Area Clienti - Pannello Admin
   =================================================================== */

const Admin = {
    authenticated: false,
    clients: [],
    uploadLogs: [],
    currentView: 'clients',
    editingClient: null,
    clientType: 'persona',

    // Inizializzazione
    init() {
        // Controlla se admin gia' autenticato in questa sessione
        if (sessionStorage.getItem('itc_admin') === 'true') {
            this.authenticated = true;
            this.showPanel();
        }
        lucide.createIcons();
    },

    // Login admin
    async login(e) {
        e.preventDefault();
        const password = document.getElementById('adminPassword').value;
        const btn = document.getElementById('adminLoginBtn');
        const error = document.getElementById('adminError');

        error.classList.add('hidden');
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Verifica...';

        const result = await apiCall('adminLogin', { password });

        if (result.success) {
            this.authenticated = true;
            sessionStorage.setItem('itc_admin', 'true');
            this.showPanel();
        } else {
            error.classList.remove('hidden');
            document.getElementById('adminErrorText').textContent =
                result.error || 'Password non valida';
            gsap.fromTo('.login-card', { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
        }

        btn.disabled = false;
        btn.querySelector('span').textContent = 'Accedi';
    },

    // Mostra pannello admin
    showPanel() {
        document.getElementById('adminLoginOverlay').classList.add('hidden');
        document.getElementById('adminLayout').classList.add('active');
        this.loadClients();
        this.loadLogs();
        this.loadSettings();
    },

    // Logout admin
    logout() {
        sessionStorage.removeItem('itc_admin');
        window.location.reload();
    },

    // Naviga tra le viste
    navigate(view) {
        this.currentView = view;

        // Aggiorna menu
        document.querySelectorAll('.admin-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });

        // Aggiorna contenuto
        document.querySelectorAll('.admin-view').forEach(v => {
            v.classList.toggle('active', v.id === `view-${view}`);
        });

        // Ri-renderizza la vista corrente per sicurezza
        if (view === 'clients') this.renderClients();
        if (view === 'logs') this.renderLogs();

        // Chiudi sidebar mobile
        this.closeSidebar();
    },

    // ====== CLIENTI ======

    async loadClients() {
        const result = await apiCall('getClients', {}, 'GET');
        if (result.success) {
            this.clients = result.clients || [];
            this.renderClients();
            this.populateLogClientFilter();
            this.updateStats();
        }
    },

    populateLogClientFilter() {
        const select = document.getElementById('logClientFilter');
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">Tutti i clienti</option>';
        const sorted = [...this.clients].sort((a, b) => {
            const nameA = (a.cognome + ' ' + a.nome).toLowerCase();
            const nameB = (b.cognome + ' ' + b.nome).toLowerCase();
            return nameA.localeCompare(nameB);
        });
        sorted.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.email;
            opt.textContent = c.cognome + ' ' + c.nome;
            select.appendChild(opt);
        });
        if (currentVal) select.value = currentVal;
    },

    renderClients() {
        const tbody = document.getElementById('clientsBody');
        const empty = document.getElementById('clientsEmpty');
        const table = document.getElementById('clientsTable');

        if (this.clients.length === 0) {
            empty.classList.remove('hidden');
            table.classList.add('hidden');
            return;
        }

        empty.classList.add('hidden');
        table.classList.remove('hidden');

        tbody.innerHTML = this.clients.map(client => {
            const isActive = client.active === true || client.active === 'TRUE';
            const safeEmail = client.email.replace(/'/g, "\\'");
            return `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:36px;height:36px;border-radius:50%;background:var(--color-accent-glow);display:flex;align-items:center;justify-content:center;color:var(--color-accent);font-weight:600;font-size:0.8rem;flex-shrink:0;">
                            ${(client.nome || '?')[0]}${(client.cognome || '?')[0]}
                        </div>
                        <div>
                            <div style="color:var(--color-text);font-weight:500;">${client.cognome} ${client.nome}</div>
                            <div style="font-size:0.75rem;color:var(--color-text-tertiary);">${client.email}</div>
                        </div>
                    </div>
                </td>
                <td>${client.telefono || '-'}</td>
                <td>
                    <span class="badge ${isActive ? 'badge-success' : 'badge-error'}">
                        ${isActive ? 'Attivo' : 'Disattivo'}
                    </span>
                </td>
                <td style="font-size:0.75rem;color:var(--color-text-tertiary);">
                    ${client.createdDate ? formatDate(client.createdDate) : '-'}
                </td>
                <td>
                    <div class="actions">
                        <button class="btn btn-icon btn-ghost btn-sm" onclick="Admin.viewClientDocs('${safeEmail}')" title="Documenti" style="color:var(--color-accent);">
                            <i data-lucide="folder-open" style="width:16px;height:16px;"></i>
                        </button>
                        <button class="btn btn-icon btn-ghost btn-sm" onclick="Admin.requestPasswordReset('${safeEmail}')" title="Reset Password" style="color:var(--color-warning);">
                            <i data-lucide="mail" style="width:16px;height:16px;"></i>
                        </button>
                        <button class="btn btn-icon btn-ghost btn-sm" onclick="Admin.editClient('${safeEmail}')" title="Modifica">
                            <i data-lucide="pencil" style="width:16px;height:16px;"></i>
                        </button>
                        <button class="btn btn-icon btn-ghost btn-sm" onclick="Admin.toggleClientStatus('${safeEmail}', ${!isActive})" title="${isActive ? 'Disattiva' : 'Attiva'}">
                            <i data-lucide="${isActive ? 'user-x' : 'user-check'}" style="width:16px;height:16px;"></i>
                        </button>
                        <button class="btn btn-icon btn-ghost btn-sm" onclick="Admin.confirmDeleteClient('${safeEmail}')" title="Elimina" style="color:var(--color-error);">
                            <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        lucide.createIcons({ nodes: [tbody] });
    },

    // Toggle tipo cliente (persona / denominazione)
    setClientType(type) {
        this.clientType = type;
        const btnPersona = document.getElementById('btnTypePersona');
        const btnDenom = document.getElementById('btnTypeDenom');
        const fieldsPersona = document.getElementById('clientFieldsPersona');
        const fieldsDenom = document.getElementById('clientFieldsDenom');

        if (type === 'denominazione') {
            btnPersona.classList.remove('active');
            btnDenom.classList.add('active');
            fieldsPersona.classList.add('hidden');
            fieldsDenom.classList.remove('hidden');
        } else {
            btnPersona.classList.add('active');
            btnDenom.classList.remove('active');
            fieldsPersona.classList.remove('hidden');
            fieldsDenom.classList.add('hidden');
        }
    },

    // Mostra modale nuovo cliente
    showAddClientModal() {
        this.editingClient = null;
        document.getElementById('clientModalTitle').textContent = 'Nuovo Cliente';
        document.getElementById('clientForm').reset();
        document.getElementById('clientEmail').disabled = false;
        document.getElementById('clientPasswordGroup').classList.remove('hidden');
        document.getElementById('clientPassword').required = true;
        document.getElementById('clientError').classList.add('hidden');
        this.setClientType('persona');
        document.getElementById('clientDenominazione').value = '';
        document.getElementById('clientModal').classList.add('active');
    },

    // Mostra modale modifica cliente
    editClient(email) {
        const client = this.clients.find(c => c.email === email);
        if (!client) return;

        this.editingClient = email;
        document.getElementById('clientModalTitle').textContent = 'Modifica Cliente';

        // Determina se e' persona o denominazione
        if (client.nome && client.nome.trim()) {
            this.setClientType('persona');
            document.getElementById('clientNome').value = client.nome;
            document.getElementById('clientCognome').value = client.cognome;
            document.getElementById('clientDenominazione').value = '';
        } else {
            this.setClientType('denominazione');
            document.getElementById('clientDenominazione').value = client.cognome;
            document.getElementById('clientNome').value = '';
            document.getElementById('clientCognome').value = '';
        }

        document.getElementById('clientEmail').value = client.email;
        document.getElementById('clientEmail').disabled = false;
        document.getElementById('clientTelefono').value = client.telefono || '';
        document.getElementById('clientPassword').value = '';
        document.getElementById('clientPassword').required = false;
        document.getElementById('clientPasswordGroup').classList.remove('hidden');
        document.getElementById('clientError').classList.add('hidden');
        document.getElementById('clientModal').classList.add('active');
    },

    hideClientModal() {
        document.getElementById('clientModal').classList.remove('active');
        this.editingClient = null;
    },

    // Salva cliente (nuovo o modifica)
    async saveClient(e) {
        e.preventDefault();

        const data = {
            email: document.getElementById('clientEmail').value.trim(),
            telefono: document.getElementById('clientTelefono').value.trim(),
            password: document.getElementById('clientPassword').value
        };

        if (this.clientType === 'denominazione') {
            data.denominazione = document.getElementById('clientDenominazione').value.trim();
            data.nome = '';
            data.cognome = data.denominazione;
        } else {
            data.nome = document.getElementById('clientNome').value.trim();
            data.cognome = document.getElementById('clientCognome').value.trim();
        }

        const errorEl = document.getElementById('clientError');
        const errorText = document.getElementById('clientErrorText');
        const btn = document.getElementById('clientSaveBtn');

        errorEl.classList.add('hidden');
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Salvataggio...';

        let result;
        if (this.editingClient) {
            // Modifica - invia l'email originale per identificare il cliente
            if (!data.password) delete data.password;
            data.originalEmail = this.editingClient;
            result = await apiCall('updateClient', data);
        } else {
            // Nuovo
            if (!data.password) {
                errorText.textContent = 'La password e\' obbligatoria';
                errorEl.classList.remove('hidden');
                btn.disabled = false;
                btn.querySelector('span').textContent = 'Salva';
                return;
            }
            result = await apiCall('createClient', data);
        }

        if (result.success) {
            Toast.success(this.editingClient ? 'Cliente aggiornato' : 'Cliente creato con successo');
            this.hideClientModal();
            this.loadClients();
        } else {
            errorText.textContent = result.error || 'Errore nel salvataggio';
            errorEl.classList.remove('hidden');
        }

        btn.disabled = false;
        btn.querySelector('span').textContent = 'Salva';
    },

    // Toggle stato attivo/disattivo
    async toggleClientStatus(email, active) {
        const result = await apiCall('updateClient', { email, active });
        if (result.success) {
            Toast.success(`Cliente ${active ? 'attivato' : 'disattivato'}`);
            this.loadClients();
        } else {
            Toast.error(result.error || 'Errore');
        }
    },

    // Conferma eliminazione
    confirmDeleteClient(email) {
        const client = this.clients.find(c => c.email === email);
        if (!client) return;

        document.getElementById('deleteClientName').textContent =
            `${client.cognome} ${client.nome}`;
        document.getElementById('deleteClientEmail').textContent = email;
        document.getElementById('deleteConfirmBtn').onclick = () => this.deleteClient(email);
        document.getElementById('deleteModal').classList.add('active');
    },

    hideDeleteModal() {
        document.getElementById('deleteModal').classList.remove('active');
    },

    // Reset password via email
    async requestPasswordReset(email) {
        const client = this.clients.find(c => c.email === email);
        if (!client) return;

        const clientName = `${client.cognome} ${client.nome}`;

        if (!confirm(`Inviare email di reset password a ${clientName} (${email})?`)) {
            return;
        }

        try {
            const result = await apiCall('requestPasswordReset', { email });

            if (result.success) {
                Toast.success(`Email di reset inviata a ${email}`);
            } else {
                Toast.error(result.error || 'Errore nell\'invio email di reset');
            }
        } catch (err) {
            Toast.error('Errore di connessione');
        }
    },

    async deleteClient(email) {
        const result = await apiCall('deleteClient', { email });
        if (result.success) {
            Toast.success('Cliente eliminato');
            this.hideDeleteModal();
            this.loadClients();
        } else {
            Toast.error(result.error || 'Errore nell\'eliminazione');
        }
    },

    // ====== LOG CARICAMENTI ======

    async loadLogs() {
        const result = await apiCall('getUploadLogs', {}, 'GET');
        if (result.success) {
            this.uploadLogs = result.logs || [];
            this.renderLogs();
            this.updateStats();
        }
    },

    renderLogs(filter = null) {
        const tbody = document.getElementById('logsBody');
        const empty = document.getElementById('logsEmpty');
        const table = document.getElementById('logsTable');

        let logs = this.uploadLogs;
        if (filter) {
            logs = logs.filter(l => l.clientEmail === filter || l.category === filter);
        }

        // Ordina per data decrescente
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (logs.length === 0) {
            empty.classList.remove('hidden');
            table.classList.add('hidden');
            return;
        }

        empty.classList.add('hidden');
        table.classList.remove('hidden');

        const categoryLabels = {};
        CONFIG.CATEGORIES.forEach(c => { categoryLabels[c.id] = c.label; });

        tbody.innerHTML = logs.map(log => {
            let dateDisplay = '-';
            try { dateDisplay = formatDate(log.timestamp); } catch(e) { dateDisplay = String(log.timestamp || '-'); }
            return `
            <tr>
                <td style="font-size:0.8rem;white-space:nowrap;">${dateDisplay}</td>
                <td style="color:var(--color-text);font-weight:500;">${log.clientName || log.clientEmail || '-'}</td>
                <td style="max-width:250px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${log.originalName || log.fileName || ''}">
                    ${log.originalName || log.fileName || '-'}
                </td>
                <td><span class="badge badge-neutral">${categoryLabels[log.category] || log.category || '-'}</span></td>
                <td>
                    ${log.fileId ? `<a href="https://drive.google.com/file/d/${log.fileId}/view" target="_blank" class="btn btn-icon btn-ghost btn-sm" title="Apri su Drive" style="color:var(--color-accent);"><i data-lucide="external-link" style="width:14px;height:14px;"></i></a>` : '-'}
                </td>
            </tr>`;
        }).join('');

        lucide.createIcons({ nodes: [tbody] });
    },

    filterLogs() {
        const clientFilter = document.getElementById('logClientFilter').value;
        this.renderLogs(clientFilter || null);
    },

    // ====== IMPOSTAZIONI ======

    settings: {},

    async loadSettings() {
        const result = await apiCall('getSettings', {}, 'GET');
        if (result.success) {
            this.settings = result.settings || {};
            this.renderSettings();
        }
    },

    renderSettings() {
        // Email notifica
        document.getElementById('notificationEmail').value =
            this.settings.notification_email || 'abalsamo.ipad@gmail.com';

        // Estensioni
        const extensions = (this.settings.allowed_extensions || 'pdf,doc,docx,csv,xls,xlsx').split(',');
        this.renderExtensions(extensions);

        // Popola filtro clienti nei log
        const select = document.getElementById('logClientFilter');
        select.innerHTML = '<option value="">Tutti i clienti</option>';
        this.clients.forEach(c => {
            select.innerHTML += `<option value="${c.email}">${c.cognome} ${c.nome}</option>`;
        });
    },

    renderExtensions(extensions) {
        const container = document.getElementById('extensionTags');
        container.innerHTML = extensions.map(ext => `
            <span class="extension-tag">
                .${ext.trim()}
                <button class="remove-ext" onclick="Admin.removeExtension('${ext.trim()}')">&times;</button>
            </span>
        `).join('');
    },

    addExtension() {
        const input = document.getElementById('newExtension');
        const ext = input.value.trim().toLowerCase().replace(/^\./, '');
        if (!ext) return;

        const current = (this.settings.allowed_extensions || '').split(',').map(e => e.trim());
        if (current.includes(ext)) {
            Toast.warning(`Estensione .${ext} gia' presente`);
            return;
        }

        current.push(ext);
        this.settings.allowed_extensions = current.join(',');
        this.renderExtensions(current);
        input.value = '';
    },

    removeExtension(ext) {
        const current = (this.settings.allowed_extensions || '').split(',')
            .map(e => e.trim())
            .filter(e => e !== ext);
        this.settings.allowed_extensions = current.join(',');
        this.renderExtensions(current);
    },

    async saveSettings() {
        const email = document.getElementById('notificationEmail').value.trim();
        const btn = document.getElementById('saveSettingsBtn');

        btn.disabled = true;
        btn.querySelector('span').textContent = 'Salvataggio...';

        const result = await apiCall('updateSettings', {
            settings: {
                notification_email: email,
                allowed_extensions: this.settings.allowed_extensions
            }
        });

        if (result.success) {
            Toast.success('Impostazioni salvate');
        } else {
            Toast.error(result.error || 'Errore nel salvataggio');
        }

        btn.disabled = false;
        btn.querySelector('span').textContent = 'Salva Impostazioni';
    },

    // ====== DOCUMENTI CLIENTE ======

    docsClientEmail: null,

    viewClientDocs(email) {
        const client = this.clients.find(c => c.email === email);
        if (!client) return;

        this.docsClientEmail = email;
        document.getElementById('docsClientName').textContent = `${client.cognome} ${client.nome}`;
        document.getElementById('docsCategoryFilter').value = '';

        // Link alla cartella Drive del cliente
        const driveLink = document.getElementById('docsDriveLink');
        if (client.folderId) {
            driveLink.href = `https://drive.google.com/drive/folders/${client.folderId}`;
            driveLink.style.display = '';
        } else {
            driveLink.style.display = 'none';
        }

        this.renderClientDocs(email);
        document.getElementById('docsModal').classList.add('active');
        lucide.createIcons({ nodes: [document.getElementById('docsModal')] });
    },

    renderClientDocs(email, categoryFilter) {
        const tbody = document.getElementById('docsBody');
        const empty = document.getElementById('docsEmpty');
        const tableContainer = document.getElementById('docsTableContainer');
        const countEl = document.getElementById('docsCount');

        let docs = this.uploadLogs.filter(l => l.clientEmail === email);
        if (categoryFilter) {
            docs = docs.filter(l => l.category === categoryFilter);
        }

        // Ordina per data decrescente
        docs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (docs.length === 0) {
            empty.classList.remove('hidden');
            tableContainer.classList.add('hidden');
            countEl.textContent = '';
            return;
        }

        empty.classList.add('hidden');
        tableContainer.classList.remove('hidden');

        const categoryLabels = {};
        CONFIG.CATEGORIES.forEach(c => { categoryLabels[c.id] = c.label; });

        tbody.innerHTML = docs.map(doc => `
            <tr>
                <td style="font-size:0.8rem;white-space:nowrap;">${formatDate(doc.timestamp)}</td>
                <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--color-text);" title="${doc.originalName || doc.fileName}">
                    ${doc.originalName || doc.fileName}
                </td>
                <td><span class="badge badge-neutral">${categoryLabels[doc.category] || doc.category}</span></td>
                <td>
                    ${doc.fileId ? `<a href="https://drive.google.com/file/d/${doc.fileId}/view" target="_blank" class="btn btn-icon btn-ghost btn-sm" title="Apri su Drive" style="color:var(--color-accent);"><i data-lucide="external-link" style="width:14px;height:14px;"></i></a>` : '-'}
                </td>
            </tr>
        `).join('');

        countEl.textContent = `${docs.length} documento${docs.length !== 1 ? 'i' : ''}`;
        lucide.createIcons({ nodes: [tbody] });
    },

    filterClientDocs() {
        const category = document.getElementById('docsCategoryFilter').value;
        this.renderClientDocs(this.docsClientEmail, category || null);
    },

    hideDocsModal() {
        document.getElementById('docsModal').classList.remove('active');
        this.docsClientEmail = null;
    },

    // ====== STATS ======

    updateStats() {
        document.getElementById('statClients').textContent = this.clients.length;
        document.getElementById('statActive').textContent =
            this.clients.filter(c => c.active === true || c.active === 'TRUE').length;
        document.getElementById('statUploads').textContent = this.uploadLogs.length;

        // Breakdown documenti per categoria
        this.renderCategoryStats();
    },

    renderCategoryStats() {
        const container = document.getElementById('categoryBreakdown');
        const wrapper = document.getElementById('categoryStats');
        if (!container || !wrapper) return;

        if (this.uploadLogs.length === 0) {
            wrapper.style.display = 'none';
            return;
        }

        wrapper.style.display = '';

        const categoryLabels = {};
        CONFIG.CATEGORIES.forEach(c => { categoryLabels[c.id] = c.label; });

        // Conta per categoria
        const counts = {};
        this.uploadLogs.forEach(log => {
            const cat = log.category || 'altro';
            counts[cat] = (counts[cat] || 0) + 1;
        });

        const total = this.uploadLogs.length;

        container.innerHTML = Object.keys(counts).map(cat => {
            const label = categoryLabels[cat] || cat;
            const count = counts[cat];
            const pct = Math.round((count / total) * 100);
            return `
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                            <span style="font-size:0.8rem;color:var(--color-text-secondary);">${label}</span>
                            <span style="font-size:0.8rem;font-weight:600;color:var(--color-text);">${count}</span>
                        </div>
                        <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:var(--color-accent);border-radius:2px;transition:width 0.5s ease;"></div>
                        </div>
                    </div>
                </div>`;
        }).join('');
    },

    // ====== MOBILE ======

    toggleSidebar() {
        document.querySelector('.admin-sidebar').classList.toggle('open');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    },

    closeSidebar() {
        document.querySelector('.admin-sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('active');
    }
};

// Inizializza
document.addEventListener('DOMContentLoaded', () => {
    Admin.init();
});
