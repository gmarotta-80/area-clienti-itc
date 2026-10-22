/* =====================================================================
   Assetto Impresa — Area clienti
   Backend Google Apps Script (Web App)

   Archivio:   Google Drive dell'account dello studio (Workspace assettoimpresa.com)
   Database:   Foglio Google "Area clienti — Assetto Impresa"
   Sessioni:   CacheService (scadenza automatica)

   Prima installazione: eseguire una volta la funzione installa() dall'editor,
   poi pubblicare come applicazione web (vedi GUIDA.md).
   ===================================================================== */

const CFG = {
  NOME_STUDIO: 'Assetto Impresa · Studio Marotta',
  SESSIONE_SEC: 6 * 60 * 60,          // durata massima di una sessione (limite CacheService: 6 ore)
  OTP_SEC: 10 * 60,                   // validità del codice di verifica
  OTP_TENTATIVI: 5,                   // tentativi per ciascun codice
  MAX_TENTATIVI: 5,                   // password errate prima del blocco
  BLOCCO_MIN: 15,                     // durata del blocco
  MAX_MB: 20,                         // dimensione massima di un file caricato
  PW_MIN: 10,                         // lunghezza minima della password
  ITERAZIONI_HASH: 600,
  ESTENSIONI: ['pdf', 'p7m', 'xml', 'xlsx', 'xls', 'csv', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'zip'],
  CATEGORIE: {
    EstrattoConto: 'Estratti conto e carte',
    Fatture: 'Fatture e documenti fuori SdI',
    Cassa: 'Corrispettivi, cassa e note spese',
    Personale: 'Presenze e personale',
    Avvisi: 'Avvisi e comunicazioni da enti',
    Contratti: 'Contratti, finanziamenti e investimenti',
    Altro: 'Altro'
  }
};

const SCHEMA = {
  Clienti: ['id', 'ragione_sociale', 'email', 'codice_fiscale', 'referente', 'hash', 'salt', 'attivo', 'cambio_password',
            'cartella_id', 'cartella_caricati_id', 'cartella_studio_id', 'tentativi', 'bloccato_fino', 'creato', 'ultimo_accesso'],
  Caricamenti: ['id', 'data', 'cliente_id', 'categoria', 'periodo', 'dettaglio', 'nome_originale', 'nome_file', 'file_id',
                'dimensione', 'nota', 'stato', 'richiesta_id', 'notificato'],
  Richieste: ['id', 'cliente_id', 'titolo', 'descrizione', 'categoria', 'periodo', 'scadenza', 'stato', 'creata'],
  Scadenze: ['id', 'cliente_id', 'data', 'titolo', 'dettaglio'],
  Letture: ['cliente_id', 'file_id', 'data'],
  Registro: ['data', 'attore', 'azione', 'dettaglio', 'esito']
};

/* ---------------------------------------------------------------------
   Punto d'ingresso HTTP
   --------------------------------------------------------------------- */

function doGet() {
  return risposta({ ok: true, servizio: 'area-clienti', versione: 1 });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return risposta({ ok: false, errore: 'Richiesta non valida.' });
  }
  const azione = AZIONI[req.azione];
  if (!azione) return risposta({ ok: false, errore: 'Operazione non riconosciuta.' });

  const lock = LockService.getScriptLock();
  try {
    if (SCRITTURE.indexOf(req.azione) >= 0) lock.waitLock(20000);
    return risposta(azione(req));
  } catch (err) {
    if (err && err.utente) return risposta({ ok: false, errore: err.message, codice: err.codice || null });
    registra('sistema', req.azione, String(err && err.stack || err).slice(0, 500), 'errore');
    return risposta({ ok: false, errore: 'Errore del servizio. Riprovi tra qualche minuto.' });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function risposta(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function errore(msg, codice) {
  const e = new Error(msg);
  e.utente = true;
  e.codice = codice;
  throw e;
}

const AZIONI = {
  // accesso cliente
  accedi: accedi,
  verificaCodice: verificaCodice,
  recuperaPassword: recuperaPassword,
  reimpostaPassword: reimpostaPassword,
  cambiaPassword: cambiaPassword,
  esci: esci,
  // area cliente
  bacheca: bacheca,
  carica: carica,
  annullaCaricamento: annullaCaricamento,
  documentiStudio: documentiStudio,
  scaricaDocumento: scaricaDocumento,
  // studio
  studioAccedi: studioAccedi,
  studioVerifica: studioVerifica,
  studioCambiaPassword: studioCambiaPassword,
  studioPanoramica: studioPanoramica,
  studioCreaCliente: studioCreaCliente,
  studioAggiornaCliente: studioAggiornaCliente,
  studioNuovaPassword: studioNuovaPassword,
  studioCreaRichiesta: studioCreaRichiesta,
  studioChiudiRichiesta: studioChiudiRichiesta,
  studioSegnaRegistrato: studioSegnaRegistrato,
  studioAggiungiScadenza: studioAggiungiScadenza,
  studioEliminaScadenza: studioEliminaScadenza,
  studioPubblica: studioPubblica,
  studioRegistro: studioRegistro
};

const SCRITTURE = ['accedi', 'verificaCodice', 'reimpostaPassword', 'cambiaPassword', 'carica', 'annullaCaricamento',
  'scaricaDocumento', 'studioAccedi', 'studioCambiaPassword', 'studioCreaCliente', 'studioAggiornaCliente', 'studioNuovaPassword',
  'studioCreaRichiesta', 'studioChiudiRichiesta', 'studioSegnaRegistrato', 'studioAggiungiScadenza', 'studioEliminaScadenza',
  'studioPubblica'];

/* ---------------------------------------------------------------------
   Accesso dei clienti
   --------------------------------------------------------------------- */

function accedi(req) {
  const email = normEmail(req.email);
  const pw = String(req.password || '');
  const c = trovaCliente('email', email);
  const ora = Date.now();

  if (!c || !vero(c.attivo)) {
    hashPassword(pw, 'x'); // tempo di risposta uniforme
    registra(email || '-', 'accesso', 'utente inesistente o disattivato', 'negato');
    errore('E-mail o password non corrette.');
  }
  if (c.bloccato_fino && Number(c.bloccato_fino) > ora) {
    const min = Math.ceil((Number(c.bloccato_fino) - ora) / 60000);
    errore('Troppi tentativi errati. Riprovi tra ' + min + ' minuti.');
  }
  if (!confrontaCostante(hashPassword(pw, c.salt), c.hash)) {
    const t = Number(c.tentativi || 0) + 1;
    const agg = { tentativi: t };
    if (t >= CFG.MAX_TENTATIVI) { agg.tentativi = 0; agg.bloccato_fino = ora + CFG.BLOCCO_MIN * 60000; }
    aggiorna('Clienti', c._riga, agg);
    registra(c.id, 'accesso', 'password errata (' + t + ')', 'negato');
    errore('E-mail o password non corrette.');
  }
  aggiorna('Clienti', c._riga, { tentativi: 0, bloccato_fino: '' });
  const sfida = creaSfida({ tipo: 'cliente', id: c.id, scopo: 'accesso' }, c.email, 'il suo accesso all\'area clienti');
  return { ok: true, sfida: sfida, email: mascheraEmail(c.email) };
}

function verificaCodice(req) {
  const dati = verificaSfida(req.sfida, req.codice, 'accesso');
  const c = trovaCliente('id', dati.id);
  if (!c || !vero(c.attivo)) errore('Accesso non consentito.');
  aggiorna('Clienti', c._riga, { ultimo_accesso: new Date() });
  registra(c.id, 'accesso', 'codice verificato', 'ok');
  const token = creaSessione({ tipo: 'cliente', id: c.id });
  return { ok: true, token: token, cambioPassword: vero(c.cambio_password), profilo: profiloCliente(c) };
}

function recuperaPassword(req) {
  const email = normEmail(req.email);
  const c = trovaCliente('email', email);
  let sfida = Utilities.getUuid();
  if (c && vero(c.attivo)) {
    sfida = creaSfida({ tipo: 'cliente', id: c.id, scopo: 'recupero' }, c.email, 'la reimpostazione della password');
    registra(c.id, 'recupero password', 'codice inviato', 'ok');
  }
  // stessa risposta in ogni caso, per non rivelare quali indirizzi sono registrati
  return { ok: true, sfida: sfida, messaggio: 'Se l\'indirizzo è registrato, riceverà un codice entro pochi minuti.' };
}

function reimpostaPassword(req) {
  const dati = verificaSfida(req.sfida, req.codice, 'recupero');
  controllaPassword(req.nuova);
  const c = trovaCliente('id', dati.id);
  if (!c) errore('Codice non valido.');
  const salt = Utilities.getUuid();
  aggiorna('Clienti', c._riga, { salt: salt, hash: hashPassword(req.nuova, salt), cambio_password: false, tentativi: 0, bloccato_fino: '' });
  chiudiSessioniDi('cliente', c.id);
  registra(c.id, 'password reimpostata', '', 'ok');
  return { ok: true };
}

function cambiaPassword(req) {
  const s = sessione(req.token, 'cliente');
  const c = trovaCliente('id', s.id);
  if (!confrontaCostante(hashPassword(String(req.attuale || ''), c.salt), c.hash)) errore('La password attuale non è corretta.');
  controllaPassword(req.nuova);
  if (req.nuova === req.attuale) errore('La nuova password deve essere diversa da quella attuale.');
  const salt = Utilities.getUuid();
  aggiorna('Clienti', c._riga, { salt: salt, hash: hashPassword(req.nuova, salt), cambio_password: false });
  registra(c.id, 'password cambiata', '', 'ok');
  return { ok: true };
}

function esci(req) {
  if (req.token) CacheService.getScriptCache().remove('s:' + req.token);
  return { ok: true };
}

/* ---------------------------------------------------------------------
   Area cliente
   --------------------------------------------------------------------- */

function bacheca(req) {
  const s = sessione(req.token, 'cliente');
  const c = trovaCliente('id', s.id);
  const oggi = inizioGiorno(new Date());
  const limite = new Date(oggi.getTime() + 120 * 86400000);

  const richieste = righe('Richieste')
    .filter(r => r.cliente_id === c.id && r.stato !== 'chiusa')
    .map(r => ({ id: r.id, titolo: r.titolo, descrizione: r.descrizione, categoria: r.categoria, periodo: r.periodo,
                 scadenza: dataIso(r.scadenza), stato: r.stato }))
    .sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)));

  const scadenze = righe('Scadenze')
    .filter(r => (r.cliente_id === c.id || r.cliente_id === '*') && r.data && new Date(r.data) >= oggi && new Date(r.data) <= limite)
    .map(r => ({ data: dataIso(r.data), titolo: r.titolo, dettaglio: r.dettaglio, generale: r.cliente_id === '*' }))
    .sort((a, b) => a.data.localeCompare(b.data));

  const caricamenti = righe('Caricamenti')
    .filter(r => r.cliente_id === c.id && r.stato !== 'annullato')
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .slice(0, 40)
    .map(r => ({ id: r.id, data: new Date(r.data).toISOString(), categoria: r.categoria, periodo: r.periodo,
                 nome: r.nome_file, originale: r.nome_originale, stato: r.stato, dimensione: Number(r.dimensione) }));

  const nuovi = elencaDocumentiStudio(c).filter(d => !d.letto).length;

  return { ok: true, profilo: profiloCliente(c), richieste: richieste, scadenze: scadenze, caricamenti: caricamenti,
           nuoviDocumenti: nuovi, categorie: CFG.CATEGORIE };
}

function carica(req) {
  const s = sessione(req.token, 'cliente');
  const c = trovaCliente('id', s.id);

  const categoria = String(req.categoria || '');
  if (!CFG.CATEGORIE[categoria]) errore('Scelga una categoria valida.');
  const periodo = String(req.periodo || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) errore('Indichi il periodo di riferimento (mese e anno).');

  const originale = String(req.nomeFile || 'documento').slice(0, 180);
  const est = (originale.split('.').pop() || '').toLowerCase();
  if (CFG.ESTENSIONI.indexOf(est) < 0) errore('Formato non ammesso: .' + est + '. Formati accettati: ' + CFG.ESTENSIONI.join(', ') + '.');

  const bytes = Utilities.base64Decode(String(req.base64 || ''));
  if (!bytes.length) errore('Il file è vuoto.');
  if (bytes.length > CFG.MAX_MB * 1024 * 1024) errore('Il file supera ' + CFG.MAX_MB + ' MB.');

  const dettaglio = pulisciNome(req.dettaglio);
  const base = [periodo, categoria, dettaglio].filter(Boolean).join('_');
  const cartella = sottocartella(DriveApp.getFolderById(c.cartella_caricati_id), CFG.CATEGORIE[categoria]);
  const nome = nomeLibero(cartella, base, est);

  const blob = Utilities.newBlob(bytes, mimeDa(est), nome);
  const file = cartella.createFile(blob);
  file.setDescription('Caricato da ' + c.ragione_sociale + ' il ' + formatoData(new Date()) +
                      (req.nota ? '\nNota: ' + String(req.nota).slice(0, 500) : '') + '\nNome originale: ' + originale);

  let richiestaId = '';
  if (req.richiestaId) {
    const r = righe('Richieste').find(x => x.id === req.richiestaId && x.cliente_id === c.id);
    if (r) { aggiorna('Richieste', r._riga, { stato: 'ricevuta' }); richiestaId = r.id; }
  }

  const id = Utilities.getUuid();
  aggiungi('Caricamenti', {
    id: id, data: new Date(), cliente_id: c.id, categoria: categoria, periodo: periodo, dettaglio: dettaglio,
    nome_originale: originale, nome_file: nome, file_id: file.getId(), dimensione: bytes.length,
    nota: String(req.nota || '').slice(0, 500), stato: 'ricevuto', richiesta_id: richiestaId, notificato: false
  });
  registra(c.id, 'caricamento', nome + ' (' + bytes.length + ' byte)', 'ok');
  return { ok: true, id: id, nome: nome };
}

function annullaCaricamento(req) {
  const s = sessione(req.token, 'cliente');
  const r = righe('Caricamenti').find(x => x.id === req.id && x.cliente_id === s.id);
  if (!r) errore('Caricamento non trovato.');
  if (r.stato !== 'ricevuto') errore('Il documento è già stato registrato dallo studio: per correggerlo scriva allo studio.');
  if (Date.now() - new Date(r.data).getTime() > 24 * 3600000) errore('Si può annullare un caricamento solo entro 24 ore.');
  try { DriveApp.getFileById(r.file_id).setTrashed(true); } catch (e) {}
  aggiorna('Caricamenti', r._riga, { stato: 'annullato' });
  if (r.richiesta_id) {
    const q = righe('Richieste').find(x => x.id === r.richiesta_id);
    if (q && q.stato === 'ricevuta') aggiorna('Richieste', q._riga, { stato: 'aperta' });
  }
  registra(s.id, 'caricamento annullato', r.nome_file, 'ok');
  return { ok: true };
}

function documentiStudio(req) {
  const s = sessione(req.token, 'cliente');
  const c = trovaCliente('id', s.id);
  return { ok: true, documenti: elencaDocumentiStudio(c) };
}

function scaricaDocumento(req) {
  const s = sessione(req.token, 'cliente');
  const c = trovaCliente('id', s.id);
  const doc = elencaDocumentiStudio(c).find(d => d.id === req.id);
  if (!doc) errore('Documento non disponibile.');
  const file = DriveApp.getFileById(doc.id);
  if (file.getSize() > 35 * 1024 * 1024) errore('Il documento è troppo grande per lo scaricamento diretto: chieda allo studio un invio alternativo.');
  const blob = file.getBlob();
  if (!doc.letto) aggiungi('Letture', { cliente_id: c.id, file_id: doc.id, data: new Date() });
  registra(c.id, 'scaricamento', file.getName(), 'ok');
  return { ok: true, nome: file.getName(), mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

function elencaDocumentiStudio(c) {
  const letti = {};
  righe('Letture').filter(l => l.cliente_id === c.id).forEach(l => { letti[l.file_id] = true; });
  const out = [];
  const visita = (cartella, sezione) => {
    const files = cartella.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (f.isTrashed()) continue;
      out.push({ id: f.getId(), nome: f.getName(), sezione: sezione, data: f.getDateCreated().toISOString(),
                 dimensione: f.getSize(), descrizione: f.getDescription() || '', letto: !!letti[f.getId()] });
    }
    const sub = cartella.getFolders();
    while (sub.hasNext()) { const d = sub.next(); visita(d, d.getName()); }
  };
  visita(DriveApp.getFolderById(c.cartella_studio_id), '');
  return out.sort((a, b) => b.data.localeCompare(a.data));
}

/* ---------------------------------------------------------------------
   Studio (console riservata)
   --------------------------------------------------------------------- */

function studioAccedi(req) {
  const p = PropertiesService.getScriptProperties();
  const ora = Date.now();
  const blocco = Number(p.getProperty('STUDIO_BLOCCATO_FINO') || 0);
  if (blocco > ora) errore('Troppi tentativi errati. Riprovi tra ' + Math.ceil((blocco - ora) / 60000) + ' minuti.');
  if (!confrontaCostante(hashPassword(String(req.password || ''), p.getProperty('STUDIO_SALT')), p.getProperty('STUDIO_HASH'))) {
    const t = Number(p.getProperty('STUDIO_TENTATIVI') || 0) + 1;
    if (t >= CFG.MAX_TENTATIVI) { p.setProperty('STUDIO_TENTATIVI', '0'); p.setProperty('STUDIO_BLOCCATO_FINO', String(ora + CFG.BLOCCO_MIN * 60000)); }
    else p.setProperty('STUDIO_TENTATIVI', String(t));
    registra('studio', 'accesso console', 'password errata', 'negato');
    errore('Password non corretta.');
  }
  p.setProperty('STUDIO_TENTATIVI', '0');
  const email = p.getProperty('EMAIL_STUDIO');
  const sfida = creaSfida({ tipo: 'studio', id: 'studio', scopo: 'studio' }, email, 'l\'accesso alla console dello studio');
  return { ok: true, sfida: sfida, email: mascheraEmail(email) };
}

function studioVerifica(req) {
  verificaSfida(req.sfida, req.codice, 'studio');
  registra('studio', 'accesso console', '', 'ok');
  return { ok: true, token: creaSessione({ tipo: 'studio', id: 'studio' }) };
}

function studioCambiaPassword(req) {
  sessione(req.token, 'studio');
  const p = PropertiesService.getScriptProperties();
  if (!confrontaCostante(hashPassword(String(req.attuale || ''), p.getProperty('STUDIO_SALT')), p.getProperty('STUDIO_HASH'))) errore('La password attuale non è corretta.');
  controllaPassword(req.nuova, 14);
  const salt = Utilities.getUuid();
  p.setProperty('STUDIO_SALT', salt);
  p.setProperty('STUDIO_HASH', hashPassword(req.nuova, salt));
  registra('studio', 'password console cambiata', '', 'ok');
  return { ok: true };
}

function studioPanoramica(req) {
  sessione(req.token, 'studio');
  const caricamenti = righe('Caricamenti').filter(r => r.stato !== 'annullato');
  const richieste = righe('Richieste');
  const clienti = righe('Clienti').map(c => {
    const miei = caricamenti.filter(r => r.cliente_id === c.id);
    const ultimo = miei.reduce((m, r) => (!m || new Date(r.data) > new Date(m)) ? r.data : m, null);
    return {
      id: c.id, ragione_sociale: c.ragione_sociale, email: c.email, codice_fiscale: c.codice_fiscale, referente: c.referente,
      attivo: vero(c.attivo), cambio_password: vero(c.cambio_password), cartella_id: c.cartella_id,
      ultimo_accesso: c.ultimo_accesso ? new Date(c.ultimo_accesso).toISOString() : null,
      ultimo_caricamento: ultimo ? new Date(ultimo).toISOString() : null,
      da_registrare: miei.filter(r => r.stato === 'ricevuto').length,
      richieste_aperte: richieste.filter(r => r.cliente_id === c.id && r.stato === 'aperta').length
    };
  }).sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale));

  const nomi = {}; clienti.forEach(c => nomi[c.id] = c.ragione_sociale);
  const ultimi = caricamenti.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 150).map(r => ({
    id: r.id, data: new Date(r.data).toISOString(), cliente_id: r.cliente_id, cliente: nomi[r.cliente_id] || '?',
    categoria: r.categoria, periodo: r.periodo, nome: r.nome_file, originale: r.nome_originale, nota: r.nota,
    stato: r.stato, file_id: r.file_id, dimensione: Number(r.dimensione)
  }));
  const elencoRichieste = richieste.filter(r => r.stato !== 'chiusa').map(r => ({
    id: r.id, cliente_id: r.cliente_id, cliente: nomi[r.cliente_id] || '?', titolo: r.titolo, descrizione: r.descrizione,
    categoria: r.categoria, periodo: r.periodo, scadenza: dataIso(r.scadenza), stato: r.stato
  })).sort((a, b) => String(a.scadenza).localeCompare(String(b.scadenza)));
  const scadenze = righe('Scadenze').filter(r => r.data && new Date(r.data) >= inizioGiorno(new Date())).map(r => ({
    id: r.id, cliente_id: r.cliente_id, cliente: r.cliente_id === '*' ? 'Tutti i clienti' : (nomi[r.cliente_id] || '?'),
    data: dataIso(r.data), titolo: r.titolo, dettaglio: r.dettaglio
  })).sort((a, b) => a.data.localeCompare(b.data));

  return { ok: true, clienti: clienti, caricamenti: ultimi, richieste: elencoRichieste, scadenze: scadenze, categorie: CFG.CATEGORIE };
}

function studioCreaCliente(req) {
  sessione(req.token, 'studio');
  const ragione = String(req.ragione_sociale || '').trim();
  const email = normEmail(req.email);
  if (ragione.length < 2) errore('Indichi la ragione sociale.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errore('Indirizzo e-mail non valido.');
  if (trovaCliente('email', email)) errore('Esiste già un cliente con questo indirizzo e-mail.');

  const radice = DriveApp.getFolderById(prop('CARTELLA_RADICE_ID'));
  const cartella = radice.createFolder(pulisciCartella(ragione));
  const caricati = cartella.createFolder('Caricati dal cliente');
  Object.keys(CFG.CATEGORIE).forEach(k => caricati.createFolder(CFG.CATEGORIE[k]));
  const studio = cartella.createFolder('Dallo studio');

  const temp = passwordTemporanea();
  const salt = Utilities.getUuid();
  const id = 'C' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
  aggiungi('Clienti', {
    id: id, ragione_sociale: ragione, email: email, codice_fiscale: String(req.codice_fiscale || '').toUpperCase().trim(),
    referente: String(req.referente || '').trim(), hash: hashPassword(temp, salt), salt: salt, attivo: true, cambio_password: true,
    cartella_id: cartella.getId(), cartella_caricati_id: caricati.getId(), cartella_studio_id: studio.getId(),
    tentativi: 0, bloccato_fino: '', creato: new Date(), ultimo_accesso: ''
  });
  if (req.invia) inviaCredenziali(email, ragione, temp);
  registra('studio', 'cliente creato', ragione + ' <' + email + '>', 'ok');
  return { ok: true, id: id, passwordTemporanea: temp, inviata: !!req.invia };
}

function studioAggiornaCliente(req) {
  sessione(req.token, 'studio');
  const c = trovaCliente('id', req.id);
  if (!c) errore('Cliente non trovato.');
  const agg = {};
  if (req.attivo !== undefined) agg.attivo = !!req.attivo;
  if (req.referente !== undefined) agg.referente = String(req.referente).trim();
  if (req.ragione_sociale) agg.ragione_sociale = String(req.ragione_sociale).trim();
  if (req.email) {
    const email = normEmail(req.email);
    const altro = trovaCliente('email', email);
    if (altro && altro.id !== c.id) errore('Indirizzo e-mail già usato da un altro cliente.');
    agg.email = email;
  }
  aggiorna('Clienti', c._riga, agg);
  if (agg.attivo === false) chiudiSessioniDi('cliente', c.id);
  registra('studio', 'cliente aggiornato', c.ragione_sociale + ' ' + JSON.stringify(agg), 'ok');
  return { ok: true };
}

function studioNuovaPassword(req) {
  sessione(req.token, 'studio');
  const c = trovaCliente('id', req.id);
  if (!c) errore('Cliente non trovato.');
  const temp = passwordTemporanea();
  const salt = Utilities.getUuid();
  aggiorna('Clienti', c._riga, { salt: salt, hash: hashPassword(temp, salt), cambio_password: true, tentativi: 0, bloccato_fino: '' });
  chiudiSessioniDi('cliente', c.id);
  if (req.invia) inviaCredenziali(c.email, c.ragione_sociale, temp);
  registra('studio', 'password cliente rigenerata', c.ragione_sociale, 'ok');
  return { ok: true, passwordTemporanea: temp, inviata: !!req.invia };
}

function studioCreaRichiesta(req) {
  sessione(req.token, 'studio');
  const c = trovaCliente('id', req.cliente_id);
  if (!c) errore('Cliente non trovato.');
  if (!String(req.titolo || '').trim()) errore('Indichi il documento richiesto.');
  if (req.categoria && !CFG.CATEGORIE[req.categoria]) errore('Categoria non valida.');
  const id = 'R' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
  aggiungi('Richieste', {
    id: id, cliente_id: c.id, titolo: String(req.titolo).trim(), descrizione: String(req.descrizione || '').trim(),
    categoria: req.categoria || 'Altro', periodo: req.periodo || '', scadenza: req.scadenza ? new Date(req.scadenza) : '',
    stato: 'aperta', creata: new Date()
  });
  if (req.avvisa) {
    inviaEmail(c.email, 'Documento richiesto dallo studio',
      '<p>Gentile cliente,</p><p>lo studio le chiede di caricare nell\'area clienti:</p><p><b>' + esc(req.titolo) + '</b>' +
      (req.descrizione ? '<br>' + esc(req.descrizione) : '') +
      (req.scadenza ? '<br>Entro il ' + formatoData(new Date(req.scadenza)) : '') + '</p>' + pulsanteArea());
  }
  registra('studio', 'richiesta creata', c.ragione_sociale + ': ' + req.titolo, 'ok');
  return { ok: true, id: id };
}

function studioChiudiRichiesta(req) {
  sessione(req.token, 'studio');
  const r = righe('Richieste').find(x => x.id === req.id);
  if (!r) errore('Richiesta non trovata.');
  aggiorna('Richieste', r._riga, { stato: 'chiusa' });
  return { ok: true };
}

function studioSegnaRegistrato(req) {
  sessione(req.token, 'studio');
  const ids = [].concat(req.ids || req.id || []);
  const tutti = righe('Caricamenti');
  ids.forEach(id => {
    const r = tutti.find(x => x.id === id);
    if (r && r.stato === 'ricevuto') aggiorna('Caricamenti', r._riga, { stato: 'registrato' });
  });
  return { ok: true };
}

function studioAggiungiScadenza(req) {
  sessione(req.token, 'studio');
  if (!req.data || !String(req.titolo || '').trim()) errore('Indichi data e descrizione della scadenza.');
  const cliente = req.cliente_id === '*' ? '*' : (trovaCliente('id', req.cliente_id) || errore('Cliente non trovato.')).id;
  const id = 'S' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
  aggiungi('Scadenze', { id: id, cliente_id: cliente, data: new Date(req.data), titolo: String(req.titolo).trim(), dettaglio: String(req.dettaglio || '').trim() });
  return { ok: true, id: id };
}

function studioEliminaScadenza(req) {
  sessione(req.token, 'studio');
  const r = righe('Scadenze').find(x => x.id === req.id);
  if (!r) errore('Scadenza non trovata.');
  foglio('Scadenze').deleteRow(r._riga);
  return { ok: true };
}

function studioPubblica(req) {
  sessione(req.token, 'studio');
  const c = trovaCliente('id', req.cliente_id);
  if (!c) errore('Cliente non trovato.');
  const bytes = Utilities.base64Decode(String(req.base64 || ''));
  if (!bytes.length) errore('Il file è vuoto.');
  if (bytes.length > 35 * 1024 * 1024) errore('Il file supera 35 MB.');
  const nomeRichiesto = String(req.nomeFile || 'documento.pdf').replace(/[\\/:*?"<>|]/g, '-').slice(0, 180);
  const est = (nomeRichiesto.split('.').pop() || 'pdf').toLowerCase();
  const base = nomeRichiesto.replace(/\.[^.]+$/, '');
  const cartella = DriveApp.getFolderById(c.cartella_studio_id);
  const nome = nomeLibero(cartella, base, est);
  const file = cartella.createFile(Utilities.newBlob(bytes, mimeDa(est), nome));
  if (req.descrizione) file.setDescription(String(req.descrizione).slice(0, 500));
  if (req.avvisa) {
    inviaEmail(c.email, 'Nuovo documento dallo studio',
      '<p>Gentile cliente,</p><p>nell\'area clienti è disponibile un nuovo documento:</p><p><b>' + esc(nome) + '</b>' +
      (req.descrizione ? '<br>' + esc(req.descrizione) : '') + '</p>' + pulsanteArea());
  }
  registra('studio', 'documento pubblicato', c.ragione_sociale + ': ' + nome, 'ok');
  return { ok: true, nome: nome };
}

function studioRegistro(req) {
  sessione(req.token, 'studio');
  const r = righe('Registro').slice(-300).reverse().map(x => ({
    data: new Date(x.data).toISOString(), attore: x.attore, azione: x.azione, dettaglio: x.dettaglio, esito: x.esito
  }));
  return { ok: true, registro: r };
}

/* ---------------------------------------------------------------------
   Riepilogo giornaliero allo studio (attivatore orario creato da installa)
   --------------------------------------------------------------------- */

function riepilogoGiornaliero() {
  const nuovi = righe('Caricamenti').filter(r => !vero(r.notificato) && r.stato !== 'annullato');
  if (!nuovi.length) return;
  const nomi = {}; righe('Clienti').forEach(c => nomi[c.id] = c.ragione_sociale);
  const perCliente = {};
  nuovi.forEach(r => { (perCliente[r.cliente_id] = perCliente[r.cliente_id] || []).push(r); });
  let html = '<p>Documenti caricati dai clienti dall\'ultimo riepilogo:</p>';
  Object.keys(perCliente).forEach(id => {
    html += '<p><b>' + esc(nomi[id] || id) + '</b></p><ul>' +
      perCliente[id].map(r => '<li>' + esc(r.nome_file) + (r.nota ? ' — <i>' + esc(r.nota) + '</i>' : '') + '</li>').join('') + '</ul>';
  });
  inviaEmail(prop('EMAIL_STUDIO'), 'Area clienti: ' + nuovi.length + ' nuovi documenti', html);
  nuovi.forEach(r => aggiorna('Caricamenti', r._riga, { notificato: true }));
}

/* ---------------------------------------------------------------------
   Sessioni e codici di verifica
   --------------------------------------------------------------------- */

function creaSessione(dati) {
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  dati.creata = Date.now();
  CacheService.getScriptCache().put('s:' + token, JSON.stringify(dati), CFG.SESSIONE_SEC);
  // indice delle sessioni per poterle chiudere (es. cliente disattivato)
  const cache = CacheService.getScriptCache();
  const chiave = 'idx:' + dati.tipo + ':' + dati.id;
  const elenco = JSON.parse(cache.get(chiave) || '[]').slice(-9);
  elenco.push(token);
  cache.put(chiave, JSON.stringify(elenco), CFG.SESSIONE_SEC);
  return token;
}

function sessione(token, tipo) {
  if (!token) errore('Sessione scaduta: acceda di nuovo.', 'SESSIONE');
  const raw = CacheService.getScriptCache().get('s:' + token);
  if (!raw) errore('Sessione scaduta: acceda di nuovo.', 'SESSIONE');
  const s = JSON.parse(raw);
  if (s.tipo !== tipo) errore('Operazione non consentita.', 'SESSIONE');
  if (tipo === 'cliente') {
    const c = trovaCliente('id', s.id);
    if (!c || !vero(c.attivo)) errore('Accesso non più attivo. Contatti lo studio.', 'SESSIONE');
  }
  return s;
}

function chiudiSessioniDi(tipo, id) {
  const cache = CacheService.getScriptCache();
  const chiave = 'idx:' + tipo + ':' + id;
  JSON.parse(cache.get(chiave) || '[]').forEach(t => cache.remove('s:' + t));
  cache.remove(chiave);
}

function creaSfida(dati, email, motivo) {
  const codice = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 10), 16) % 1000000).padStart(6, '0');
  const sfida = Utilities.getUuid();
  dati.codice = codice;
  dati.tentativi = 0;
  CacheService.getScriptCache().put('otp:' + sfida, JSON.stringify(dati), CFG.OTP_SEC);
  inviaEmail(email, 'Codice di verifica: ' + codice,
    '<p>Il codice per ' + motivo + ' è:</p><p style="font-size:28px;letter-spacing:6px;font-family:monospace"><b>' + codice + '</b></p>' +
    '<p>Vale 10 minuti. Se non ha richiesto lei l\'accesso, ignori questo messaggio e avvisi lo studio.</p>');
  return sfida;
}

function verificaSfida(sfida, codice, scopo) {
  const cache = CacheService.getScriptCache();
  const raw = sfida ? cache.get('otp:' + sfida) : null;
  if (!raw) errore('Codice scaduto: ripeta l\'accesso per riceverne uno nuovo.', 'CODICE_SCADUTO');
  const d = JSON.parse(raw);
  if (d.scopo !== scopo) errore('Codice non valido.');
  if (!confrontaCostante(String(codice || '').replace(/\D/g, ''), d.codice)) {
    d.tentativi++;
    if (d.tentativi >= CFG.OTP_TENTATIVI) { cache.remove('otp:' + sfida); errore('Troppi codici errati: ripeta l\'accesso.', 'CODICE_SCADUTO'); }
    cache.put('otp:' + sfida, JSON.stringify(d), CFG.OTP_SEC);
    errore('Codice non corretto.');
  }
  cache.remove('otp:' + sfida);
  return d;
}

/* ---------------------------------------------------------------------
   Password
   --------------------------------------------------------------------- */

function hashPassword(pw, salt) {
  const pepper = prop('PEPPER');
  let h = String(pw) + '|' + salt;
  for (let i = 0; i < CFG.ITERAZIONI_HASH; i++) {
    h = Utilities.base64Encode(Utilities.computeHmacSha256Signature(h + salt, pepper));
  }
  return h;
}

function confrontaCostante(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function controllaPassword(pw, minimo) {
  pw = String(pw || '');
  const min = minimo || CFG.PW_MIN;
  if (pw.length < min) errore('La password deve avere almeno ' + min + ' caratteri.');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) errore('La password deve contenere lettere e numeri.');
}

function passwordTemporanea() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const u = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  let out = '';
  for (let i = 0; i < 12; i++) out += alfabeto[parseInt(u.substr(i * 2, 2), 16) % alfabeto.length];
  return out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8, 12) + '7';
}

/* ---------------------------------------------------------------------
   E-mail
   --------------------------------------------------------------------- */

function inviaEmail(a, oggetto, corpo) {
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#16201C;max-width:560px">' +
    '<p style="font-family:Georgia,serif;font-size:20px;margin:0 0 18px">Assetto <i style="color:#1F4A3F">Impresa</i></p>' + corpo +
    '<hr style="border:0;border-top:1px solid #D3D7CE;margin:24px 0 12px"><p style="font-size:12px;color:#5B645F">' +
    'Dott. Giuseppe Antonio Marotta · Dottore Commercialista e Revisore Legale<br>Via San Vito 2, 92100 Agrigento · ' +
    'Messaggio automatico dell\'area clienti: non risponda a questa e-mail, scriva allo studio.</p></div>';
  MailApp.sendEmail({ to: a, subject: oggetto, htmlBody: html, name: CFG.NOME_STUDIO });
}

function inviaCredenziali(email, ragione, temp) {
  inviaEmail(email, 'Accesso all\'area clienti dello studio',
    '<p>Gentile ' + esc(ragione) + ',</p><p>è attivo il suo accesso all\'area clienti, dove potrà caricare i documenti contabili ' +
    'e ricevere quelli predisposti dallo studio.</p><p>Utente: <b>' + esc(email) + '</b><br>Password temporanea: <b style="font-family:monospace">' +
    esc(temp) + '</b></p><p>Al primo accesso le chiederemo di sceglierne una nuova. A ogni accesso riceverà anche un codice di verifica via e-mail.</p>' +
    pulsanteArea());
}

function pulsanteArea() {
  const url = prop('AREA_URL', true) || '';
  return url ? '<p><a href="' + esc(url) + '" style="display:inline-block;background:#1F4A3F;color:#F6F6F2;padding:12px 18px;text-decoration:none">Apri l\'area clienti</a></p>' : '';
}

/* ---------------------------------------------------------------------
   Foglio e Drive
   --------------------------------------------------------------------- */

let _ss = null;
function ss() { return _ss || (_ss = SpreadsheetApp.openById(prop('SPREADSHEET_ID'))); }
function foglio(n) { return ss().getSheetByName(n); }
const _cacheRighe = {};
function righe(n) {
  if (_cacheRighe[n]) return _cacheRighe[n];
  const v = foglio(n).getDataRange().getValues();
  const h = v.shift();
  _cacheRighe[n] = v.map((r, i) => { const o = { _riga: i + 2 }; h.forEach((k, j) => o[k] = r[j]); return o; });
  return _cacheRighe[n];
}
function aggiungi(n, o) {
  const sh = foglio(n);
  sh.appendRow(SCHEMA[n].map(k => cella(o[k])));
  delete _cacheRighe[n];
}
function aggiorna(n, riga, o) {
  const sh = foglio(n);
  Object.keys(o).forEach(k => { const j = SCHEMA[n].indexOf(k); if (j >= 0) sh.getRange(riga, j + 1).setValue(cella(o[k])); });
  delete _cacheRighe[n];
}
function cella(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v; // impedisce formule inserite dall'esterno
  return v;
}
function trovaCliente(campo, valore) {
  if (!valore) return null;
  return righe('Clienti').find(c => String(c[campo]).toLowerCase() === String(valore).toLowerCase()) || null;
}
function profiloCliente(c) {
  return { id: c.id, ragione_sociale: c.ragione_sociale, email: c.email, referente: c.referente || 'Dott. Giuseppe Antonio Marotta' };
}
function registra(attore, azione, dettaglio, esito) {
  try { aggiungi('Registro', { data: new Date(), attore: attore, azione: azione, dettaglio: dettaglio, esito: esito }); } catch (e) {}
}
function sottocartella(padre, nome) {
  const it = padre.getFoldersByName(nome);
  return it.hasNext() ? it.next() : padre.createFolder(nome);
}
function nomeLibero(cartella, base, est) {
  let nome = base + '.' + est, n = 2;
  while (cartella.getFilesByName(nome).hasNext()) nome = base + '_' + (n++) + '.' + est;
  return nome;
}
function pulisciNome(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim()
    .split(' ').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('').slice(0, 60);
}
function pulisciCartella(s) { return String(s).replace(/[\\/:*?"<>|]/g, '-').slice(0, 120); }
function mimeDa(est) {
  return ({ pdf: 'application/pdf', p7m: 'application/pkcs7-mime', xml: 'application/xml', csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', zip: 'application/zip' })[est] || 'application/octet-stream';
}

/* ---------------------------------------------------------------------
   Utilità
   --------------------------------------------------------------------- */

function prop(k, facoltativa) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v && !facoltativa) throw new Error('Proprietà mancante: ' + k + '. Eseguire installa().');
  return v;
}
function vero(v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 1; }
function normEmail(e) { return String(e || '').trim().toLowerCase(); }
function mascheraEmail(e) { const p = String(e).split('@'); return p[0].slice(0, 2) + '•••@' + (p[1] || ''); }
function esc(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
function inizioGiorno(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function dataIso(d) { if (!d) return ''; const x = new Date(d); return isNaN(x) ? '' : Utilities.formatDate(x, 'Europe/Rome', 'yyyy-MM-dd'); }
function formatoData(d) { return Utilities.formatDate(d, 'Europe/Rome', 'dd/MM/yyyy'); }

/* ---------------------------------------------------------------------
   Installazione (eseguire una volta dall'editor)
   --------------------------------------------------------------------- */

function installa() {
  const p = PropertiesService.getScriptProperties();
  const email = Session.getEffectiveUser().getEmail();

  if (!p.getProperty('PEPPER')) p.setProperty('PEPPER', Utilities.getUuid() + Utilities.getUuid());
  if (!p.getProperty('EMAIL_STUDIO')) p.setProperty('EMAIL_STUDIO', email);

  if (!p.getProperty('CARTELLA_RADICE_ID')) {
    const radice = DriveApp.createFolder('Area clienti — Assetto Impresa');
    p.setProperty('CARTELLA_RADICE_ID', radice.getId());
  }
  if (!p.getProperty('SPREADSHEET_ID')) {
    const foglioDati = SpreadsheetApp.create('Area clienti — Assetto Impresa (dati)');
    DriveApp.getFileById(foglioDati.getId()).moveTo(DriveApp.getFolderById(p.getProperty('CARTELLA_RADICE_ID')));
    p.setProperty('SPREADSHEET_ID', foglioDati.getId());
  }
  const libro = SpreadsheetApp.openById(p.getProperty('SPREADSHEET_ID'));
  Object.keys(SCHEMA).forEach(nome => {
    let sh = libro.getSheetByName(nome) || libro.insertSheet(nome);
    if (sh.getLastRow() === 0) {
      sh.appendRow(SCHEMA[nome]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, SCHEMA[nome].length).setFontWeight('bold');
    }
  });
  const primo = libro.getSheetByName('Foglio1') || libro.getSheetByName('Sheet1');
  if (primo && libro.getSheets().length > 1) libro.deleteSheet(primo);
  libro.getSheetByName('Clienti').hideColumns(6, 2); // hash e salt

  let passwordConsole = null;
  if (!p.getProperty('STUDIO_HASH')) {
    passwordConsole = passwordTemporanea() + 'x9';
    const salt = Utilities.getUuid();
    p.setProperty('STUDIO_SALT', salt);
    p.setProperty('STUDIO_HASH', hashPassword(passwordConsole, salt));
  }

  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'riepilogoGiornaliero').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('riepilogoGiornaliero').timeBased().atHour(18).everyDays(1).inTimezone('Europe/Rome').create();

  Logger.log('Installazione completata.');
  Logger.log('Cartella radice: https://drive.google.com/drive/folders/' + p.getProperty('CARTELLA_RADICE_ID'));
  Logger.log('Foglio dati: ' + libro.getUrl());
  Logger.log('E-mail dello studio per codici e riepiloghi: ' + p.getProperty('EMAIL_STUDIO'));
  if (passwordConsole) Logger.log('PASSWORD INIZIALE DELLA CONSOLE STUDIO (la cambi al primo accesso): ' + passwordConsole);
}

/** Imposta l'indirizzo pubblico dell'area clienti, usato nei pulsanti delle e-mail. */
function impostaIndirizzoArea() {
  PropertiesService.getScriptProperties().setProperty('AREA_URL', 'https://area.assettoimpresa.com/');
  Logger.log('AREA_URL impostato.');
}
