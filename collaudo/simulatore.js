// Simulatore dei servizi Google Apps Script per collaudare Codice.gs in locale.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), http = require('http');

const RADICE = process.argv[2];               // cartella del progetto
const PORTA = Number(process.argv[3] || 8765);
const posta = [], log = [];

let idn = 0; const nuovoId = p => p + (++idn).toString(36).padStart(6, '0');
const toBytes = b => Array.from(b);

// ---------- Drive ----------
const files = {}, cartelle = {};
function Cartella(nome, padre) { this.id = nuovoId('D'); this.nome = nome; this.padre = padre; cartelle[this.id] = this; }
const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
Cartella.prototype = {
  getId() { return this.id; }, getName() { return this.nome; },
  createFolder(n) { return new Cartella(n, this.id); },
  getFoldersByName(n) { return iter(Object.values(cartelle).filter(c => c.padre === this.id && c.nome === n)); },
  getFolders() { return iter(Object.values(cartelle).filter(c => c.padre === this.id)); },
  getFilesByName(n) { return iter(Object.values(files).filter(f => f.padre === this.id && f.nome === n && !f.cestino)); },
  getFiles() { return iter(Object.values(files).filter(f => f.padre === this.id)); },
  createFile(blob) { const f = new File(blob, this.id); return f; }
};
function Blob(bytes, mime, nome) { this.bytes = Buffer.from(bytes); this.mime = mime; this.nome = nome; }
Blob.prototype = { getBytes() { return toBytes(this.bytes); }, getContentType() { return this.mime; } };
function File(blob, padre) { this.id = nuovoId('F'); this.blob = blob; this.nome = blob.nome; this.padre = padre; this.desc = ''; this.cestino = false; this.creato = new Date(); files[this.id] = this; }
File.prototype = {
  getId() { return this.id; }, getName() { return this.nome; }, setDescription(d) { this.desc = d; return this; }, getDescription() { return this.desc; },
  setTrashed(t) { this.cestino = t; }, isTrashed() { return this.cestino; }, getSize() { return this.blob.bytes.length; },
  getBlob() { return this.blob; }, getDateCreated() { return this.creato; }, moveTo(c) { this.padre = c.id; }
};
const DriveApp = {
  createFolder: n => new Cartella(n, 'root'),
  getFolderById: id => cartelle[id] || (() => { throw new Error('cartella inesistente ' + id); })(),
  getFileById: id => files[id] || (() => { throw new Error('file inesistente ' + id); })()
};

// ---------- Fogli ----------
const libri = {};
function Foglio(nome) { this.nome = nome; this.dati = []; }
Foglio.prototype = {
  getDataRange() { const d = this.dati; return { getValues: () => d.map(r => r.slice()) }; },
  appendRow(r) { this.dati.push(r.slice()); },
  getRange(r, c, nr, nc) { const self = this; return { setValue(v) { while (self.dati.length < r) self.dati.push([]); self.dati[r - 1][c - 1] = v; }, setFontWeight() {} }; },
  setFrozenRows() {}, getLastRow() { return this.dati.length; }, hideColumns() {}, deleteRow(r) { this.dati.splice(r - 1, 1); }
};
function Libro(nome) { this.id = nuovoId('S'); this.fogli = [new Foglio('Foglio1')]; libri[this.id] = this; files[this.id] = { padre: 'root', moveTo() {} }; }
Libro.prototype = {
  getId() { return this.id; }, getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; },
  getSheetByName(n) { return this.fogli.find(f => f.nome === n) || null; },
  insertSheet(n) { const f = new Foglio(n); this.fogli.push(f); return f; },
  deleteSheet(f) { this.fogli = this.fogli.filter(x => x !== f); }, getSheets() { return this.fogli; }
};
const SpreadsheetApp = { create: n => new Libro(n), openById: id => libri[id] };

// ---------- altri servizi ----------
const cache = {};
const CacheService = { getScriptCache: () => ({
  get: k => (cache[k] && cache[k].scade > Date.now()) ? cache[k].v : null,
  put: (k, v, s) => { cache[k] = { v, scade: Date.now() + s * 1000 }; },
  remove: k => { delete cache[k]; }
}) };
const props = {};
const PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) };
const Utilities = {
  getUuid: () => crypto.randomUUID(),
  base64Encode: x => Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map ? x.map(b => b & 255) : x)).toString('base64'),
  base64Decode: s => toBytes(Buffer.from(s, 'base64')),
  computeHmacSha256Signature: (v, k) => toBytes(crypto.createHmac('sha256', k).update(v).digest()).map(b => b > 127 ? b - 256 : b),
  newBlob: (bytes, mime, nome) => new Blob(bytes.map(b => b & 255), mime, nome),
  formatDate: (d, tz, f) => {
    const p = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const g = t => p.find(x => x.type === t).value;
    return f === 'yyyy-MM-dd' ? g('year') + '-' + g('month') + '-' + g('day') : g('day') + '/' + g('month') + '/' + g('year');
  }
};
const MailApp = { sendEmail: o => posta.push(o) };
const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
const ContentService = { MimeType: { JSON: 'json' }, createTextOutput: s => ({ testo: s, setMimeType() { return this; } }) };
const Session = { getEffectiveUser: () => ({ getEmail: () => 'gmarotta@assettoimpresa.com' }) };
const catena = { timeBased() { return catena; }, atHour() { return catena; }, everyDays() { return catena; }, inTimezone() { return catena; }, create() { return {}; } };
const ScriptApp = { getProjectTriggers: () => [], newTrigger: () => catena, deleteTrigger() {} };
const Logger = { log: m => { log.push(String(m)); console.log('[Logger]', m); } };

const contesto = vm.createContext({ DriveApp, SpreadsheetApp, CacheService, PropertiesService, Utilities, MailApp, LockService, ContentService,
  Session, ScriptApp, Logger, console, Date, JSON, Math, String, Number, Array, Object, Error, parseInt, isNaN });
vm.runInContext(fs.readFileSync(path.join(RADICE, 'apps-script/Codice.gs'), 'utf8') + '\n;this.__esporta={doPost,doGet,installa,riepilogoGiornaliero};', contesto);
const G = contesto.__esporta;
G.installa();
const pwConsole = (log.find(l => l.includes('PASSWORD INIZIALE')) || '').split(': ').pop();

// ---------- server ----------
const tipi = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let corpo = ''; req.on('data', c => corpo += c); req.on('end', () => {
      const out = G.doPost({ postData: { contents: corpo } });
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(out.testo);
    }); return;
  }
  if (req.url === '/__posta') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(posta)); return; }
  if (req.url === '/__stato') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ pwConsole, files: Object.values(files).filter(f => f.nome).map(f => ({ nome: f.nome, cartella: cartelle[f.padre] && cartelle[f.padre].nome, cestino: f.cestino, dim: f.blob.bytes.length })),
      fogli: Object.fromEntries(Object.values(libri)[0].fogli.map(f => [f.nome, f.dati])) }));
    return;
  }
  if (req.url === '/__riepilogo') { G.riepilogoGiornaliero(); res.end('ok'); return; }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/js/config.js') {
    res.writeHead(200, { 'Content-Type': tipi['.js'] });
    res.end(fs.readFileSync(path.join(RADICE, p), 'utf8').replace('INCOLLARE_QUI_URL_APPLICAZIONE_WEB', '/api')); return;
  }
  const f = path.join(RADICE, p);
  if (!f.startsWith(RADICE) || !fs.existsSync(f)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': tipi[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(PORTA, () => console.log('pronto su ' + PORTA));
