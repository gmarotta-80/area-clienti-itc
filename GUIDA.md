# Area clienti Assetto Impresa — guida di installazione

L'area clienti è composta da due parti:

| Parte | Dove si trova | Cosa fa |
|---|---|---|
| **Servizio** (`apps-script/`) | Google Apps Script, account `gmarotta@assettoimpresa.com` | Controlla accessi e codici, salva i file su Drive, tiene il foglio dati, invia le e-mail |
| **Pagine** (`index.html`, `area.html`, `studio.html`, `css/`, `js/`) | GitHub Pages, indirizzo `area.assettoimpresa.com` | Accesso clienti, area del cliente, console dello studio |

Le pagine non contengono dati né segreti: tutto il controllo avviene nel servizio Google. Per questo il repository delle pagine può essere pubblico.

Tempo complessivo: circa 40 minuti, più l'attesa della propagazione del dominio.

---

## 1. Creare il servizio in Google Apps Script

1. Acceda a <https://script.google.com> con **gmarotta@assettoimpresa.com** (non con un account Gmail personale: l'archivio deve stare nel Workspace dello studio).
2. **Nuovo progetto**. Rinomini il progetto in `Area clienti Assetto Impresa`.
3. Nel file `Codice.gs` cancelli il contenuto e incolli tutto il file `apps-script/Codice.gs`.
   Sul Mac: **⌘ A** per selezionare tutto, **⌘ V** per incollare, **⌘ S** per salvare.
4. Ruota dentata **Impostazioni progetto** → spunti **Mostra il file manifest "appsscript.json" nell'editor**.
   Torni all'editor, apra `appsscript.json` e lo sostituisca con il file `apps-script/appsscript.json`.
5. In alto scelga la funzione **installa** e premi **Esegui**. Google chiede le autorizzazioni (Drive, Fogli, invio e-mail, attivatori): le conceda con l'account dello studio.
6. Apra **Log di esecuzione**. Trova:
   - il collegamento alla cartella **Area clienti — Assetto Impresa** su Drive;
   - il collegamento al foglio dati;
   - la **password iniziale della console studio**. La annoti: la cambierà al primo accesso.

`installa()` crea anche un invio automatico, ogni giorno alle 18, del riepilogo dei documenti caricati dai clienti.

## 2. Pubblicare il servizio

1. **Esegui il deployment** → **Nuovo deployment** → icona ingranaggio → **App web**.
2. Descrizione: `Versione 1`. **Esegui come**: *Me*. **Chi ha accesso**: *Chiunque*.
3. **Esegui il deployment** e copi l'**URL dell'app web** (termina con `/exec`).

> Se l'opzione *Chiunque* non compare, la console di amministrazione di Workspace limita le app web all'organizzazione. In admin.google.com va consentito l'accesso esterno alle app Apps Script dell'organizzazione.

Quando in futuro si aggiorna `Codice.gs`: **Esegui il deployment** → **Gestisci deployment** → matita → **Versione: nuova versione** → **Esegui il deployment**. L'URL resta lo stesso.

## 3. Collegare le pagine al servizio

Apra `js/config.js` e sostituisca `INCOLLARE_QUI_URL_APPLICAZIONE_WEB` con l'URL copiato al punto 2.

## 4. Pubblicare le pagine su GitHub Pages

1. Su GitHub crei un nuovo repository, per esempio `assettoimpresa-area-clienti`, e vi carichi il contenuto di questa cartella (esclusa `apps-script/` se preferisce tenerla solo in locale).
2. **Settings** → **Pages** → *Source*: **Deploy from a branch**, ramo `main`, cartella `/ (root)` → **Save**.
3. Dopo un minuto le pagine sono raggiungibili all'indirizzo `https://gmarotta-80.github.io/assettoimpresa-area-clienti/`.

## 5. Dominio area.assettoimpresa.com

1. Presso il gestore del dominio assettoimpresa.com aggiunga un record DNS:
   - tipo **CNAME**, nome **area**, valore **gmarotta-80.github.io**
2. Su GitHub, **Settings** → **Pages** → *Custom domain*: `area.assettoimpresa.com` → **Save**. Quando il controllo DNS è superato, spunti **Enforce HTTPS**.
3. Torni nell'editor Apps Script, esegua la funzione **impostaIndirizzoArea**: da quel momento le e-mail ai clienti contengono il pulsante "Apri l'area clienti".

## 6. Primo collaudo reale

1. Apra `https://area.assettoimpresa.com/studio.html`, inserisca la password iniziale e il codice ricevuto via e-mail.
2. **Impostazioni** → cambi subito la password della console (almeno 14 caratteri).
3. **Clienti** → **Nuovo cliente**: crei un cliente di prova con un suo indirizzo e-mail personale.
4. Con quell'indirizzo entri da `https://area.assettoimpresa.com/`, scelga la nuova password, carichi un PDF.
5. Verifichi su Drive che il file sia in `Area clienti — Assetto Impresa / <cliente> / Caricati dal cliente / <categoria>` con il nome `AAAA-MM_Categoria_Dettaglio.pdf`.
6. Dalla console pubblichi un documento per il cliente e controlli che compaia in **Dallo studio**.

## Come è organizzato l'archivio su Drive

```
Area clienti — Assetto Impresa/
├── Area clienti — Assetto Impresa (dati)        ← foglio: Clienti, Caricamenti, Richieste, Scadenze, Letture, Registro
└── <Ragione sociale>/
    ├── Caricati dal cliente/
    │   ├── Estratti conto e carte/
    │   ├── Fatture e documenti fuori SdI/
    │   ├── Corrispettivi, cassa e note spese/
    │   ├── Presenze e personale/
    │   ├── Avvisi e comunicazioni da enti/
    │   ├── Contratti, finanziamenti e investimenti/
    │   └── Altro/
    └── Dallo studio/                             ← ogni file messo qui compare al cliente
```

Per pubblicare un documento basta anche copiarlo nella cartella **Dallo studio** del cliente, direttamente da Drive o da Google Drive per desktop: compare da solo nell'area clienti, con l'etichetta "Nuovo" finché il cliente non lo scarica.

**Collegamento con ULTRASERVER.** Le cartelle `Caricati dal cliente/<categoria>` sono il punto di ingresso per gli agenti del server: con Google Drive per desktop la cartella radice è visibile anche dal server, e il foglio dati (scheda **Caricamenti**, colonna `stato`) indica quali file sono già stati registrati.

## Sicurezza

- Password dei clienti conservate solo come impronta (HMAC-SHA256 con sale e chiave segreta, 600 iterazioni); colonne `hash` e `salt` nascoste nel foglio.
- Codice di 6 cifre via e-mail a ogni accesso, valido 10 minuti e per 5 tentativi.
- Blocco di 15 minuti dopo 5 password errate; messaggi d'errore che non rivelano quali e-mail sono registrate.
- Sessioni di massimo 6 ore, salvate solo nella scheda del browser (si chiudono con la scheda); la disattivazione di un cliente chiude subito le sue sessioni.
- Ogni cliente vede solo la propria cartella; formati ammessi limitati, massimo 20 MB per file.
- Registro di accessi, caricamenti e scaricamenti nel foglio dati.
- Protezione dalle formule inserite nei campi di testo del foglio.

## Adempimenti privacy da completare prima dell'apertura ai clienti

- Aggiornare l'informativa ai clienti (art. 13 Reg. UE 2016/679) con l'uso dell'area riservata e i tempi di conservazione dei file.
- Verificare in admin.google.com che sia accettato l'emendamento sul trattamento dei dati di Google Workspace (Data Processing Amendment).
- Inserire il trattamento nel registro delle attività di trattamento dello studio.
- Collegare la pagina "Informativa privacy" nel piè di pagina delle tre pagine (oggi è solo testo).

## Limiti da conoscere

- Apps Script accetta richieste fino a circa 50 MB: con la codifica dei file il limite pratico è 20 MB per file caricato e 35 MB per documento scaricato.
- Gmail di Workspace consente circa 1.500 e-mail al giorno dall'account: ampiamente sufficienti per codici e avvisi.
- Il primo accesso del mattino può richiedere qualche secondo in più (avvio del servizio Google).
