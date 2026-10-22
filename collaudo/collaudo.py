# Collaudo end-to-end: console studio -> nuovo cliente -> richiesta -> accesso cliente -> caricamento -> pubblicazione -> scaricamento
import asyncio, json, re, sys, os, urllib.request
from playwright.async_api import async_playwright

B = 'http://localhost:8766'
OUT = sys.argv[1]
def get(p): return json.loads(urllib.request.urlopen(B + p).read())
def ultimo_codice(dest):
    m = [x for x in get('/__posta') if x['to'] == dest and 'Codice di verifica' in x['subject']]
    return re.search(r'(\d{6})', m[-1]['subject']).group(1)
esiti = []
def ok(cond, testo):
    esiti.append(('OK ' if cond else 'KO ') + testo); print(esiti[-1])

async def main():
    stato = get('/__stato'); pw_console = stato['pwConsole']
    ok(bool(pw_console), 'installa(): password console generata e fogli creati ' + str(list(stato['fogli'].keys())))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
        errori = []
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errori.append(str(e)))

        # --- console: password errata, poi corretta + codice
        await pg.goto(B + '/studio.html')
        await pg.fill('#pw', 'sbagliata123'); await pg.click('#f-pw [type=submit]')
        await pg.wait_for_selector('#e-pw:not([hidden])'); ok('non corretta' in await pg.inner_text('#e-pw'), 'console: password errata respinta')
        await pg.fill('#pw', pw_console); await pg.click('#f-pw [type=submit]')
        await pg.wait_for_selector('#f-otp:not([hidden])')
        await pg.fill('#otp', '000000'); await pg.click('#f-otp [type=submit]')
        await pg.wait_for_selector('#e-otp:not([hidden])'); ok(True, 'console: codice errato respinto')
        await pg.fill('#otp', ultimo_codice('gmarotta@assettoimpresa.com')); await pg.click('#f-otp [type=submit]')
        await pg.wait_for_selector('#console:not([hidden])'); ok(True, 'console: accesso con codice via e-mail')

        # --- nuovo cliente
        await pg.click('[data-scheda=clienti]'); await pg.click('#nuovo-cliente')
        await pg.fill('#d-ragione', 'Farmacia Esempio S.n.c.'); await pg.fill('#d-email', 'cliente@esempio.it'); await pg.fill('#d-cf', '01234567890')
        await pg.click('#d-cliente [type=submit]')
        await pg.wait_for_selector('.segreto'); temp = (await pg.inner_text('.segreto')).strip()
        ok(len(temp) >= 14, 'cliente creato, password temporanea ' + temp)
        ok(any(x['to'] == 'cliente@esempio.it' and temp in x['htmlBody'] for x in get('/__posta')), 'credenziali inviate per e-mail al cliente')
        await pg.click('[data-chiudi]')
        cart = [f for f in get('/__stato')['files']]
        await pg.wait_for_timeout(300)

        # --- richiesta + scadenza
        await pg.click('[data-scheda=richieste]'); await pg.click('#nuova-richiesta')
        await pg.fill('#r-titolo', 'Estratto conto di ottobre'); await pg.fill('#r-desc', 'Banca Esempio, conto ordinario')
        await pg.select_option('#r-cat', 'EstrattoConto'); await pg.fill('#r-per', '2026-10'); await pg.fill('#r-scad', '2026-11-05')
        await pg.click('#d-rich [type=submit]'); await pg.wait_for_timeout(400)
        ok('Estratto conto di ottobre' in await pg.inner_text('#t-richieste'), 'richiesta creata e visibile in console')
        await pg.click('[data-scheda=scadenze]'); await pg.click('#nuova-scadenza')
        await pg.fill('#s-data', '2026-11-16'); await pg.fill('#s-titolo', 'F24 di novembre'); await pg.fill('#s-dett', 'IVA ottobre e ritenute')
        await pg.click('#d-scad [type=submit]'); await pg.wait_for_timeout(400)
        ok('F24 di novembre' in await pg.inner_text('#t-scadenze'), 'scadenza generale aggiunta')

        # --- cliente: accesso, codice, cambio password
        cl = await ctx.new_page(); cl.on('pageerror', lambda e: errori.append(str(e)))
        await cl.goto(B + '/index.html')
        for i in range(2):
            await cl.fill('#email', 'cliente@esempio.it'); await cl.fill('#password', 'errata' + str(i)); await cl.click('#f-credenziali [type=submit]')
            await cl.wait_for_selector('#e-credenziali:not([hidden])')
        ok('non corrette' in await cl.inner_text('#e-credenziali'), 'cliente: password errata respinta con messaggio generico')
        await cl.fill('#password', temp); await cl.click('#f-credenziali [type=submit]')
        await cl.wait_for_selector('#f-codice:not([hidden])')
        await cl.fill('#codice', ultimo_codice('cliente@esempio.it')); await cl.click('#f-codice [type=submit]')
        await cl.wait_for_selector('#f-nuova:not([hidden])'); ok(True, 'cliente: primo accesso chiede la nuova password')
        await cl.fill('#n-nuova', 'corta1'); await cl.fill('#n-conferma', 'corta1'); await cl.click('#f-nuova [type=submit]')
        await cl.wait_for_selector('#e-nuova:not([hidden])'); ok('10 caratteri' in await cl.inner_text('#e-nuova'), 'password debole respinta')
        await cl.fill('#n-nuova', 'Farmacia2026bis'); await cl.fill('#n-conferma', 'Farmacia2026bis'); await cl.click('#f-nuova [type=submit]')
        await cl.wait_for_url('**/area.html'); await cl.wait_for_selector('#richieste li b')
        ok('Estratto conto di ottobre' in await cl.inner_text('#richieste'), 'bacheca: richiesta dello studio visibile')
        ok('F24 di novembre' in await cl.inner_text('#scadenze'), 'bacheca: scadenza visibile')

        # --- caricamento legato alla richiesta
        await cl.click('[data-richiesta]'); await cl.wait_for_selector('[data-pannello=carica]:not([hidden])')
        await cl.fill('#dett', 'Banca Esempio 1234')
        pdf = os.path.join(OUT, 'estratto.pdf'); open(pdf, 'wb').write(b'%PDF-1.4\n% estratto di prova\n' + b'0' * 2000)
        exe = os.path.join(OUT, 'virus.exe'); open(exe, 'wb').write(b'MZ')
        await cl.set_input_files('#file', [pdf, exe])
        ok('formato non ammesso' in await cl.inner_text('#coda'), 'coda: file .exe segnalato come non ammesso')
        ok('2026-10_EstrattoConto_BancaEsempio1234.pdf' in await cl.inner_text('#coda'), 'coda: anteprima del nome rinominato')
        await cl.click('#invia'); await cl.wait_for_selector('#caricati li b'); await cl.wait_for_timeout(500)
        st = get('/__stato')
        ok(any(f['nome'] == '2026-10_EstrattoConto_BancaEsempio1234.pdf' and f['cartella'] == 'Estratti conto e carte' for f in st['files']), 'Drive: file salvato nella cartella di categoria con il nome previsto')
        ok(not any(f['nome'].endswith('.exe') for f in st['files']), 'Drive: il file .exe non è stato caricato')
        rich = st['fogli']['Richieste'][1]; ok(rich[7] == 'ricevuta', 'richiesta passata a «ricevuta»')
        await cl.click('[data-scheda=bacheca]'); await cl.wait_for_timeout(200)
        await cl.screenshot(path=os.path.join(OUT, 'cliente_bacheca.png'), full_page=True)

        # --- console: arrivo, registrazione, pubblicazione
        await pg.click('#aggiorna'); await pg.wait_for_timeout(500); await pg.click('[data-scheda=arrivi]')
        ok('2026-10_EstrattoConto_BancaEsempio1234.pdf' in await pg.inner_text('#t-arrivi'), 'console: documento tra quelli da registrare')
        await pg.screenshot(path=os.path.join(OUT, 'console_arrivi.png'))
        await pg.click('[data-registra]'); await pg.wait_for_timeout(500)
        ok(get('/__stato')['fogli']['Caricamenti'][1][11] == 'registrato', 'console: documento segnato come registrato')
        await pg.click('[data-scheda=clienti]'); await pg.click('[data-cliente]'); await pg.click('#g-pubblica')
        f24 = os.path.join(OUT, 'f24.pdf'); open(f24, 'wb').write(b'%PDF-1.4\n% F24 di prova\n')
        await pg.set_input_files('#p-file', f24); await pg.fill('#p-nome', 'F24 scadenza 16-11-2026'); await pg.fill('#p-desc', 'IVA ottobre e ritenute')
        await pg.click('#d-pub [type=submit]'); await pg.wait_for_timeout(500)
        ok(any(f['nome'] == 'F24 scadenza 16-11-2026.pdf' and f['cartella'] == 'Dallo studio' for f in get('/__stato')['files']), 'console: documento pubblicato nella cartella «Dallo studio»')

        # --- cliente: scarica
        await cl.reload(); await cl.wait_for_timeout(500)
        ok(await cl.inner_text('#n-nuovi') == '1', 'cliente: 1 nuovo documento segnalato')
        await cl.click('[data-scheda=studio]'); await cl.wait_for_selector('[data-scarica]')
        async with cl.expect_download() as dl: await cl.click('[data-scarica]')
        d = await dl.value; ok(d.suggested_filename == 'F24 scadenza 16-11-2026.pdf', 'cliente: documento scaricato (' + d.suggested_filename + ')')

        # --- isolamento: secondo cliente non vede i file del primo
        await pg.click('[data-scheda=clienti]'); await pg.click('#nuovo-cliente')
        await pg.fill('#d-ragione', 'Edilizia Prova S.r.l.'); await pg.fill('#d-email', 'altro@esempio.it'); await pg.uncheck('#d-invia')
        await pg.click('#d-cliente [type=submit]'); await pg.wait_for_selector('.segreto'); temp2 = (await pg.inner_text('.segreto')).strip(); await pg.click('[data-chiudi]')
        c2 = await (await b.new_context()).new_page()
        await c2.goto(B + '/index.html'); await c2.fill('#email', 'altro@esempio.it'); await c2.fill('#password', temp2); await c2.click('#f-credenziali [type=submit]')
        await c2.wait_for_selector('#f-codice:not([hidden])'); await c2.fill('#codice', ultimo_codice('altro@esempio.it')); await c2.click('#f-codice [type=submit]')
        await c2.wait_for_selector('#f-nuova:not([hidden])'); await c2.fill('#n-nuova', 'EdiliziaProva99'); await c2.fill('#n-conferma', 'EdiliziaProva99'); await c2.click('#f-nuova [type=submit]')
        await c2.wait_for_url('**/area.html'); await c2.wait_for_timeout(500)
        tok2 = await c2.evaluate("JSON.parse(sessionStorage.getItem('ai_cliente')).token")
        id_f24 = await cl.get_attribute('[data-scarica]', 'data-scarica')
        r = await c2.evaluate("(a)=>fetch('/api',{method:'POST',body:JSON.stringify({azione:'scaricaDocumento',token:a[0],id:a[1]})}).then(r=>r.json())", [tok2, id_f24])
        ok(not r['ok'], 'isolamento: il secondo cliente non può scaricare il documento del primo (' + r.get('errore', '') + ')')
        r = await c2.evaluate("(t)=>fetch('/api',{method:'POST',body:JSON.stringify({azione:'studioPanoramica',token:t})}).then(r=>r.json())", tok2)
        ok(not r['ok'], 'isolamento: un token cliente non apre la console studio')

        # --- disattivazione chiude la sessione
        await pg.click('#aggiorna'); await pg.wait_for_timeout(400); await pg.click('[data-scheda=clienti]')
        await pg.click('#t-clienti tr:has-text("Farmacia Esempio") [data-cliente]'); await pg.click('#g-attivo'); await pg.wait_for_timeout(400)
        r = await cl.evaluate("()=>fetch('/api',{method:'POST',body:JSON.stringify({azione:'bacheca',token:JSON.parse(sessionStorage.getItem('ai_cliente')).token})}).then(r=>r.json())")
        ok(not r['ok'], 'cliente disattivato: la sessione aperta non funziona più')

        # --- riepilogo giornaliero
        urllib.request.urlopen(B + '/__riepilogo')
        ok(any('nuovi documenti' in x['subject'] for x in get('/__posta')), 'riepilogo giornaliero inviato allo studio')

        # --- telefono, tema scuro
        m = await b.new_page(viewport={'width': 390, 'height': 844}, color_scheme='dark')
        await m.goto(B + '/index.html'); await m.screenshot(path=os.path.join(OUT, 'mobile_accesso.png'))
        ok(await m.evaluate('document.documentElement.scrollWidth') <= 390, 'telefono: nessuno scorrimento orizzontale')
        ok(not errori, 'nessun errore JavaScript nelle pagine' + (': ' + '; '.join(errori) if errori else ''))
        await b.close()
    print('\n%d/%d controlli superati' % (sum(e.startswith('OK') for e in esiti), len(esiti)))

asyncio.run(main())
