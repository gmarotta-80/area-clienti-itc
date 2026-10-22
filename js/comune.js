/* Funzioni condivise: chiamate al servizio, sessione, avvisi, formattazione. */
(function () {
  const C = window.CONFIG;

  async function api(azione, dati) {
    let r;
    try {
      r = await fetch(C.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita la richiesta preliminare CORS
        body: JSON.stringify(Object.assign({ azione: azione }, dati || {}))
      });
    } catch (e) {
      return { ok: false, errore: 'Connessione non riuscita. Controlli la rete e riprovi.' };
    }
    try { return await r.json(); }
    catch (e) { return { ok: false, errore: 'Risposta non valida dal servizio. Riprovi tra qualche minuto.' }; }
  }

  const sessione = {
    leggi(chiave) { try { return JSON.parse(sessionStorage.getItem(chiave) || 'null'); } catch (e) { return null; } },
    scrivi(chiave, v) { try { sessionStorage.setItem(chiave, JSON.stringify(v)); } catch (e) {} },
    cancella(chiave) { try { sessionStorage.removeItem(chiave); } catch (e) {} }
  };

  let timer;
  function avviso(testo, tipo) {
    let el = document.getElementById('avviso');
    if (!el) { el = document.createElement('div'); el.id = 'avviso'; el.className = 'avviso'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = testo;
    el.classList.toggle('errore', tipo === 'errore');
    el.classList.add('vis');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('vis'), tipo === 'errore' ? 6000 : 3500);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  function dataBreve(iso) { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return d.getDate() + ' ' + MESI_BREVI[d.getMonth()]; }
  function dataLunga(iso) { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear(); }
  function dataOra(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
           d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  function periodo(p) { if (!p) return ''; const [a, m] = p.split('-'); return MESI[Number(m) - 1] + ' ' + a; }
  function dimensione(b) { if (!b) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return Math.round(b / 1024) + ' KB'; return (b / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
  function giorniA(iso) { const d = new Date(iso + 'T12:00:00'); const o = new Date(); o.setHours(12, 0, 0, 0); return Math.round((d - o) / 86400000); }
  function sigla(nome) { return String(nome || '').replace(/\b(s\.?r\.?l\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|s\.?p\.?a\.?)\b/gi, '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '·'; }

  function leggiBase64(file) {
    return new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result).split(',')[1] || '');
      fr.onerror = () => ko(new Error('Lettura del file non riuscita.'));
      fr.readAsDataURL(file);
    });
  }

  function salvaFile(base64, nome, mime) {
    const bin = atob(base64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: mime || 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function attesa(btn, attivo, testo) {
    if (!btn) return;
    if (attivo) { btn.dataset.testo = btn.innerHTML; btn.disabled = true; btn.textContent = testo || 'Attendere…'; }
    else { btn.disabled = false; if (btn.dataset.testo) btn.innerHTML = btn.dataset.testo; }
  }

  function dialogo(html, alApertura) {
    const velo = document.createElement('div'); velo.className = 'velo';
    velo.innerHTML = '<div class="dialogo" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(velo);
    const chiudi = () => velo.remove();
    velo.addEventListener('click', e => { if (e.target === velo) chiudi(); });
    velo.querySelectorAll('[data-chiudi]').forEach(b => b.addEventListener('click', chiudi));
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { chiudi(); document.removeEventListener('keydown', esc); } });
    if (alApertura) alApertura(velo.querySelector('.dialogo'), chiudi);
    const primo = velo.querySelector('input,select,textarea,button'); if (primo) primo.focus();
    return chiudi;
  }

  window.AI = { api, sessione, avviso, esc, dataBreve, dataLunga, dataOra, periodo, dimensione, giorniA, sigla, leggiBase64, salvaFile, attesa, dialogo };
})();
