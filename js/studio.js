/* Console dello studio */
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const CHIAVE = 'ai_studio';
  let sfida = null, dati = null, registroCaricato = false;

  /* ---------- accesso ---------- */
  function errore(id, t) { const el = $(id); el.textContent = t || ''; el.hidden = !t; }
  function entra() { $('#accesso').hidden = true; $('#console').hidden = false; $('#barra-utente').hidden = false; aggiorna(); }
  if (AI.sessione.leggi(CHIAVE)) entra(); else $('#pw').focus();

  $('#f-pw').addEventListener('submit', async e => {
    e.preventDefault(); errore('#e-pw');
    const btn = e.target.querySelector('[type=submit]'); AI.attesa(btn, true, 'Verifica…');
    const r = await AI.api('studioAccedi', { password: $('#pw').value });
    AI.attesa(btn, false);
    if (!r.ok) return errore('#e-pw', r.errore);
    sfida = r.sfida; $('#otp-email').textContent = r.email; $('#f-pw').hidden = true; $('#f-otp').hidden = false; $('#otp').focus();
  });
  $('#f-otp').addEventListener('submit', async e => {
    e.preventDefault(); errore('#e-otp');
    const btn = e.target.querySelector('[type=submit]'); AI.attesa(btn, true, 'Verifica…');
    const r = await AI.api('studioVerifica', { sfida, codice: $('#otp').value });
    AI.attesa(btn, false);
    if (!r.ok) { if (r.codice === 'CODICE_SCADUTO') { $('#f-otp').hidden = true; $('#f-pw').hidden = false; return errore('#e-pw', r.errore); } return errore('#e-otp', r.errore); }
    AI.sessione.scrivi(CHIAVE, { token: r.token }); $('#pw').value = ''; entra();
  });
  $('#esci').addEventListener('click', async () => {
    const s = AI.sessione.leggi(CHIAVE); if (s) await AI.api('esci', { token: s.token });
    AI.sessione.cancella(CHIAVE); location.reload();
  });

  async function chiama(azione, extra) {
    const s = AI.sessione.leggi(CHIAVE);
    const r = await AI.api(azione, Object.assign({ token: s && s.token }, extra || {}));
    if (!r.ok && r.codice === 'SESSIONE') { AI.sessione.cancella(CHIAVE); location.reload(); }
    return r;
  }

  /* ---------- schede ---------- */
  function apri(nome) {
    $$('.schede button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.scheda === nome)));
    $$('[data-pannello]').forEach(p => p.hidden = p.dataset.pannello !== nome);
    if (nome === 'registro' && !registroCaricato) caricaRegistro();
  }
  $$('.schede button').forEach(b => b.addEventListener('click', () => apri(b.dataset.scheda)));
  $('#aggiorna').addEventListener('click', () => { aggiorna(); registroCaricato = false; if (!$('[data-pannello=registro]').hidden) caricaRegistro(); });

  /* ---------- dati ---------- */
  async function aggiorna() {
    const r = await chiama('studioPanoramica');
    if (!r.ok) return AI.avviso(r.errore, 'errore');
    dati = r;
    const attivi = r.clienti.filter(c => c.attivo);
    const daReg = r.caricamenti.filter(x => x.stato === 'ricevuto').length;
    $('#k-clienti').textContent = attivi.length;
    $('#k-arrivi').textContent = daReg;
    $('#k-richieste').textContent = r.richieste.filter(x => x.stato === 'aperta').length;
    $('#k-mai').textContent = attivi.filter(c => !c.ultimo_accesso).length;
    const c = $('#c-arrivi'); c.textContent = daReg; c.hidden = !daReg;
    const f = $('#filtro-cliente'); const scelta = f.value;
    f.innerHTML = '<option value="">Tutti</option>' + r.clienti.map(x => '<option value="' + AI.esc(x.id) + '">' + AI.esc(x.ragione_sociale) + '</option>').join('');
    f.value = scelta;
    disegnaArrivi(); disegnaClienti(); disegnaRichieste(); disegnaScadenze();
  }
  const cat = k => (dati && dati.categorie[k]) || k;
  const urlFile = id => 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view';
  const urlCartella = id => 'https://drive.google.com/drive/folders/' + encodeURIComponent(id);

  function visibili() {
    const cl = $('#filtro-cliente').value, st = $('#filtro-stato').value;
    return dati.caricamenti.filter(x => (!cl || x.cliente_id === cl) && (!st || x.stato === st));
  }
  function disegnaArrivi() {
    const righe = visibili();
    $('#arrivi-titolo').textContent = righe.length === 1 ? '1 documento' : righe.length + ' documenti';
    $('#segna-tutti').hidden = !righe.some(x => x.stato === 'ricevuto');
    $('#t-arrivi').innerHTML = righe.length ? righe.map(x => '<tr><td>' + AI.dataOra(x.data) + '</td><td>' + AI.esc(x.cliente) + '</td><td><b>' +
      AI.esc(x.nome) + '</b><small>' + AI.esc(cat(x.categoria) + ' · ' + AI.periodo(x.periodo) + ' · ' + AI.dimensione(x.dimensione) + (x.originale ? ' · originale: ' + x.originale : '')) + '</small>' +
      (x.nota ? '<small>Nota: ' + AI.esc(x.nota) + '</small>' : '') + '</td><td>' +
      (x.stato === 'ricevuto' ? '<span class="stato attesa">Da registrare</span>' : '<span class="stato ok">Registrato</span>') + '</td><td style="white-space:nowrap">' +
      '<a class="btn-piccolo tenue" href="' + urlFile(x.file_id) + '" target="_blank" rel="noopener">Apri</a> ' +
      (x.stato === 'ricevuto' ? '<button class="btn-piccolo" type="button" data-registra="' + AI.esc(x.id) + '">Registrato</button>' : '') + '</td></tr>').join('')
      : '<tr><td colspan="5" class="vuoto">Nessun documento con questi filtri.</td></tr>';
    $$('[data-registra]').forEach(b => b.addEventListener('click', () => segna([b.dataset.registra])));
  }
  ['#filtro-cliente', '#filtro-stato'].forEach(id => $(id).addEventListener('change', disegnaArrivi));
  $('#segna-tutti').addEventListener('click', () => segna(visibili().filter(x => x.stato === 'ricevuto').map(x => x.id)));
  async function segna(ids) {
    if (!ids.length) return;
    const r = await chiama('studioSegnaRegistrato', { ids });
    if (!r.ok) return AI.avviso(r.errore, 'errore');
    AI.avviso(ids.length === 1 ? 'Segnato come registrato' : ids.length + ' documenti segnati come registrati'); aggiorna();
  }

  function disegnaClienti() {
    $('#t-clienti').innerHTML = dati.clienti.length ? dati.clienti.map(c => '<tr><td><b>' + AI.esc(c.ragione_sociale) + '</b><small>' + AI.esc(c.email) +
      (c.codice_fiscale ? ' · ' + AI.esc(c.codice_fiscale) : '') + '</small>' + (c.attivo ? '' : '<span class="stato neutro">Disattivato</span>') +
      (c.attivo && c.cambio_password ? ' <span class="stato attesa">Password temporanea</span>' : '') + '</td><td>' + (c.ultimo_accesso ? AI.dataOra(c.ultimo_accesso) : '<small>mai</small>') +
      '</td><td>' + (c.ultimo_caricamento ? AI.dataOra(c.ultimo_caricamento) : '<small>nessuno</small>') + '</td><td class="num">' + c.da_registrare +
      '</td><td class="num">' + c.richieste_aperte + '</td><td><button class="btn-piccolo" type="button" data-cliente="' + AI.esc(c.id) + '">Gestisci</button></td></tr>').join('')
      : '<tr><td colspan="6" class="vuoto">Nessun cliente. Crei il primo accesso con «Nuovo cliente».</td></tr>';
    $$('[data-cliente]').forEach(b => b.addEventListener('click', () => gestisci(dati.clienti.find(c => c.id === b.dataset.cliente))));
  }

  function disegnaRichieste() {
    $('#t-richieste').innerHTML = dati.richieste.length ? dati.richieste.map(q => '<tr><td>' + (q.scadenza ? AI.dataBreve(q.scadenza) : '—') + '</td><td>' +
      AI.esc(q.cliente) + '</td><td><b>' + AI.esc(q.titolo) + '</b><small>' + AI.esc([cat(q.categoria), q.periodo ? AI.periodo(q.periodo) : '', q.descrizione].filter(Boolean).join(' · ')) +
      '</small></td><td>' + (q.stato === 'ricevuta' ? '<span class="stato ok">Ricevuta</span>' : '<span class="stato attesa">Aperta</span>') +
      '</td><td><button class="btn-piccolo tenue" type="button" data-chiudi-r="' + AI.esc(q.id) + '">Chiudi</button></td></tr>').join('')
      : '<tr><td colspan="5" class="vuoto">Nessuna richiesta aperta.</td></tr>';
    $$('[data-chiudi-r]').forEach(b => b.addEventListener('click', async () => {
      const r = await chiama('studioChiudiRichiesta', { id: b.dataset.chiudiR }); if (!r.ok) return AI.avviso(r.errore, 'errore'); aggiorna();
    }));
  }

  function disegnaScadenze() {
    $('#t-scadenze').innerHTML = dati.scadenze.length ? dati.scadenze.map(x => '<tr><td>' + AI.dataLunga(x.data) + '</td><td>' + AI.esc(x.cliente) +
      '</td><td><b>' + AI.esc(x.titolo) + '</b><small>' + AI.esc(x.dettaglio || '') + '</small></td><td><button class="btn-piccolo tenue" type="button" data-elimina-s="' +
      AI.esc(x.id) + '">Elimina</button></td></tr>').join('') : '<tr><td colspan="4" class="vuoto">Nessuna scadenza futura.</td></tr>';
    $$('[data-elimina-s]').forEach(b => b.addEventListener('click', async () => {
      const r = await chiama('studioEliminaScadenza', { id: b.dataset.eliminaS }); if (!r.ok) return AI.avviso(r.errore, 'errore'); aggiorna();
    }));
  }

  async function caricaRegistro() {
    const r = await chiama('studioRegistro'); if (!r.ok) return AI.avviso(r.errore, 'errore');
    registroCaricato = true;
    $('#t-registro').innerHTML = r.registro.map(x => '<tr><td>' + AI.dataOra(x.data) + '</td><td>' + AI.esc(x.attore) + '</td><td>' + AI.esc(x.azione) +
      '<small>' + AI.esc(x.dettaglio) + '</small></td><td>' + '<span class="stato ' + (x.esito === 'ok' ? 'ok' : x.esito === 'negato' ? 'attesa' : 'urgente') + '">' + AI.esc(x.esito) + '</span></td></tr>').join('');
  }

  /* ---------- dialoghi ---------- */
  const opzioniClienti = sel => dati.clienti.filter(c => c.attivo).map(c => '<option value="' + AI.esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + AI.esc(c.ragione_sociale) + '</option>').join('');
  const opzioniCategorie = () => Object.keys(dati.categorie).map(k => '<option value="' + AI.esc(k) + '">' + AI.esc(dati.categorie[k]) + '</option>').join('');

  function mostraPassword(titolo, temp, inviata) {
    AI.dialogo('<h2>' + AI.esc(titolo) + '</h2><p>Password temporanea (al primo accesso il cliente la sostituisce):</p><div class="segreto">' + AI.esc(temp) + '</div><p>' +
      (inviata ? 'Le credenziali sono state inviate per e-mail al cliente.' : 'Non è stata inviata alcuna e-mail: comunichi la password al cliente di persona o per telefono.') +
      ' La password non sarà più visibile dopo la chiusura di questa finestra.</p><div class="azioni"><button class="btn pieno" type="button" data-chiudi>Chiudi</button></div>');
  }

  $('#nuovo-cliente').addEventListener('click', () => AI.dialogo(
    '<h2>Nuovo cliente</h2><form id="d-cliente" class="dentro" style="padding:0" novalidate>' +
    '<label class="campo" for="d-ragione">Ragione sociale o nome<input id="d-ragione" required></label>' +
    '<label class="campo" for="d-email">E-mail di accesso<input id="d-email" type="email" required></label>' +
    '<div class="campi"><label class="campo" for="d-cf">Codice fiscale o P.IVA<input id="d-cf"></label>' +
    '<label class="campo" for="d-ref">Referente nello studio<input id="d-ref" placeholder="Dott. Giuseppe Antonio Marotta"></label></div>' +
    '<label class="spunta" for="d-invia"><input type="checkbox" id="d-invia" checked> Invia subito le credenziali per e-mail</label>' +
    '<div class="azioni"><button class="btn" type="button" data-chiudi>Annulla</button><button class="btn pieno" type="submit">Crea accesso e cartelle</button></div></form>',
    (d, chiudi) => d.querySelector('#d-cliente').addEventListener('submit', async e => {
      e.preventDefault(); const btn = e.target.querySelector('[type=submit]'); AI.attesa(btn, true, 'Creazione…');
      const r = await chiama('studioCreaCliente', { ragione_sociale: $('#d-ragione').value, email: $('#d-email').value, codice_fiscale: $('#d-cf').value,
        referente: $('#d-ref').value, invia: $('#d-invia').checked });
      AI.attesa(btn, false); if (!r.ok) return AI.avviso(r.errore, 'errore');
      chiudi(); mostraPassword('Accesso creato', r.passwordTemporanea, r.inviata); aggiorna();
    })));

  function gestisci(c) {
    AI.dialogo('<h2>' + AI.esc(c.ragione_sociale) + '</h2><p>' + AI.esc(c.email) + '</p>' +
      '<div style="display:grid;gap:10px">' +
      '<button class="btn" type="button" id="g-richiesta">Richiedi un documento</button>' +
      '<button class="btn" type="button" id="g-pubblica">Pubblica un documento per il cliente</button>' +
      '<button class="btn" type="button" id="g-scadenza">Aggiungi una scadenza</button>' +
      '<a class="btn" href="' + urlCartella(c.cartella_id) + '" target="_blank" rel="noopener">Apri la cartella su Drive</a>' +
      '<button class="btn" type="button" id="g-password">Genera una nuova password temporanea</button>' +
      '<button class="btn" type="button" id="g-attivo">' + (c.attivo ? 'Disattiva l\'accesso' : 'Riattiva l\'accesso') + '</button>' +
      '</div><div class="azioni"><button class="btn-piccolo tenue" type="button" data-chiudi>Chiudi</button></div>',
      (d, chiudi) => {
        d.querySelector('#g-richiesta').addEventListener('click', () => { chiudi(); nuovaRichiesta(c.id); });
        d.querySelector('#g-pubblica').addEventListener('click', () => { chiudi(); pubblica(c); });
        d.querySelector('#g-scadenza').addEventListener('click', () => { chiudi(); nuovaScadenza(c.id); });
        d.querySelector('#g-password').addEventListener('click', async e => {
          AI.attesa(e.target, true, 'Generazione…');
          const r = await chiama('studioNuovaPassword', { id: c.id, invia: true }); AI.attesa(e.target, false);
          if (!r.ok) return AI.avviso(r.errore, 'errore'); chiudi(); mostraPassword('Nuova password', r.passwordTemporanea, r.inviata); aggiorna();
        });
        d.querySelector('#g-attivo').addEventListener('click', async () => {
          const r = await chiama('studioAggiornaCliente', { id: c.id, attivo: !c.attivo });
          if (!r.ok) return AI.avviso(r.errore, 'errore'); chiudi(); AI.avviso(c.attivo ? 'Accesso disattivato' : 'Accesso riattivato'); aggiorna();
        });
      });
  }

  function nuovaRichiesta(clienteId) {
    const oggi = new Date(); const prec = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1);
    const per = prec.getFullYear() + '-' + String(prec.getMonth() + 1).padStart(2, '0');
    AI.dialogo('<h2>Richiedi un documento</h2><form id="d-rich" novalidate style="display:grid;gap:16px">' +
      '<label class="campo" for="r-cliente">Cliente<select id="r-cliente">' + opzioniClienti(clienteId) + '</select></label>' +
      '<label class="campo" for="r-titolo">Documento richiesto<input id="r-titolo" placeholder="Es. Estratto conto di ottobre" required></label>' +
      '<label class="campo" for="r-desc">Indicazioni<input id="r-desc" placeholder="Es. conto Intesa e carta aziendale"></label>' +
      '<div class="campi"><label class="campo" for="r-cat">Categoria<select id="r-cat">' + opzioniCategorie() + '</select></label>' +
      '<label class="campo" for="r-per">Periodo<input id="r-per" type="month" value="' + per + '"></label></div>' +
      '<label class="campo" for="r-scad">Entro il<input id="r-scad" type="date"></label>' +
      '<label class="spunta" for="r-avvisa"><input type="checkbox" id="r-avvisa" checked> Avvisa il cliente per e-mail</label>' +
      '<div class="azioni"><button class="btn" type="button" data-chiudi>Annulla</button><button class="btn pieno" type="submit">Invia la richiesta</button></div></form>',
      (d, chiudi) => d.querySelector('#d-rich').addEventListener('submit', async e => {
        e.preventDefault(); const btn = e.target.querySelector('[type=submit]'); AI.attesa(btn, true, 'Invio…');
        const r = await chiama('studioCreaRichiesta', { cliente_id: $('#r-cliente').value, titolo: $('#r-titolo').value, descrizione: $('#r-desc').value,
          categoria: $('#r-cat').value, periodo: $('#r-per').value, scadenza: $('#r-scad').value, avvisa: $('#r-avvisa').checked });
        AI.attesa(btn, false); if (!r.ok) return AI.avviso(r.errore, 'errore');
        chiudi(); AI.avviso('Richiesta inviata'); aggiorna();
      }));
  }
  $('#nuova-richiesta').addEventListener('click', () => nuovaRichiesta(''));

  function nuovaScadenza(clienteId) {
    AI.dialogo('<h2>Nuova scadenza</h2><form id="d-scad" novalidate style="display:grid;gap:16px">' +
      '<label class="campo" for="s-cliente">Per<select id="s-cliente"><option value="*">Tutti i clienti</option>' + opzioniClienti(clienteId) + '</select></label>' +
      '<label class="campo" for="s-data">Data<input id="s-data" type="date" required></label>' +
      '<label class="campo" for="s-titolo">Scadenza<input id="s-titolo" placeholder="Es. Saldo IMU 2026" required></label>' +
      '<label class="campo" for="s-dett">Dettaglio<input id="s-dett" placeholder="Es. F24 predisposto dallo studio"></label>' +
      '<div class="azioni"><button class="btn" type="button" data-chiudi>Annulla</button><button class="btn pieno" type="submit">Aggiungi</button></div></form>',
      (d, chiudi) => d.querySelector('#d-scad').addEventListener('submit', async e => {
        e.preventDefault();
        const r = await chiama('studioAggiungiScadenza', { cliente_id: $('#s-cliente').value, data: $('#s-data').value, titolo: $('#s-titolo').value, dettaglio: $('#s-dett').value });
        if (!r.ok) return AI.avviso(r.errore, 'errore'); chiudi(); AI.avviso('Scadenza aggiunta'); aggiorna();
      }));
  }
  $('#nuova-scadenza').addEventListener('click', () => nuovaScadenza(''));

  function pubblica(c) {
    let file = null;
    AI.dialogo('<h2>Pubblica per ' + AI.esc(c.ragione_sociale) + '</h2><form id="d-pub" novalidate style="display:grid;gap:16px">' +
      '<label class="campo" for="p-file">File<input id="p-file" type="file"></label>' +
      '<label class="campo" for="p-nome">Nome con cui il cliente lo vede<input id="p-nome" placeholder="Es. F24 scadenza 16-11-2026.pdf"></label>' +
      '<label class="campo" for="p-desc">Descrizione<input id="p-desc" placeholder="Es. IVA ottobre, ritenute e contributi"></label>' +
      '<label class="spunta" for="p-avvisa"><input type="checkbox" id="p-avvisa" checked> Avvisa il cliente per e-mail</label>' +
      '<p style="font-size:13px">In alternativa può copiare il file direttamente nella cartella «Dallo studio» del cliente su Drive: compare da solo nell\'area clienti.</p>' +
      '<div class="azioni"><button class="btn" type="button" data-chiudi>Annulla</button><button class="btn pieno" type="submit">Pubblica</button></div></form>',
      (d, chiudi) => {
        d.querySelector('#p-file').addEventListener('change', e => { file = e.target.files[0] || null; if (file && !$('#p-nome').value) $('#p-nome').value = file.name; });
        d.querySelector('#d-pub').addEventListener('submit', async e => {
          e.preventDefault(); if (!file) return AI.avviso('Scelga il file da pubblicare.', 'errore');
          const btn = e.target.querySelector('[type=submit]'); AI.attesa(btn, true, 'Pubblicazione…');
          let nome = $('#p-nome').value.trim() || file.name;
          const est = file.name.split('.').pop(); if (!/\.[a-z0-9]{2,5}$/i.test(nome)) nome += '.' + est;
          const r = await chiama('studioPubblica', { cliente_id: c.id, nomeFile: nome, descrizione: $('#p-desc').value, avvisa: $('#p-avvisa').checked, base64: await AI.leggiBase64(file) });
          AI.attesa(btn, false); if (!r.ok) return AI.avviso(r.errore, 'errore');
          chiudi(); AI.avviso('Pubblicato: ' + r.nome);
        });
      });
  }

  /* ---------- impostazioni ---------- */
  $('#f-cambio').addEventListener('submit', async e => {
    e.preventDefault();
    if ($('#c-nuova').value !== $('#c-conferma').value) return AI.avviso('Le due password non coincidono.', 'errore');
    const r = await chiama('studioCambiaPassword', { attuale: $('#c-attuale').value, nuova: $('#c-nuova').value });
    if (!r.ok) return AI.avviso(r.errore, 'errore'); e.target.reset(); AI.avviso('Password della console aggiornata');
  });
})();
