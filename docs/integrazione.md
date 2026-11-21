# Collaudo e pubblicazione

L’app invia identificativi, grammi e prezzi attesi. Il server rilegge prezzi, disponibilità e zona di consegna a ogni preventivo, alla creazione dell’ordine e prima di aprire Stripe. Registra il prezzo di ogni riga e i dati di ritiro al momento dell’ordine. Lo stato di pagamento cambia con gli eventi Stripe firmati e deduplicati nel database. La quantità effettiva non modifica l’addebito.

## Collaudo su database dedicato

1. Avvia l’API in `NODE_ENV=test` con `ALLOW_INTEGRATION_FIXTURES=1`. Usa un database preparato per il collaudo, con categorie iniziali e un amministratore di test.
2. Configura Stripe Test Mode. Fornisci `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` e `INTEGRATION_TEST_PICKUP_ADDRESS` al comando di test. La suite crea record di prova e modifica le impostazioni sul database dedicato.
3. Esegui `NODE_ENV=test RUN_STRIPE_TESTS=1 npm --prefix packages/api run test:integration`. Il test invia un PaymentIntent di prova a Stripe e riproduce localmente la consegna di un evento firmato per verificare firma e deduplicazione.
4. Ripeti il flusso da app e pannello con Stripe CLI. Collauda ritiro, consegna servita e non servita, aggiornamento del prezzo, offerta in scadenza, carta rifiutata e rimborso. Verifica l’accesso con un codice valido su un secondo dispositivo.
5. Accertati che l’ordine compaia soltanto dopo il webhook, che i cambiamenti di prezzo non alterino lo storico e che le notifiche non siano necessarie per consultare lo stato.

## Build e hosting

- Collega `eas.json` al progetto EAS del titolare. Usa `eas build --profile preview --platform all` per le build interne e `eas build --profile store --platform all` per i pacchetti store. Conferma bundle identifier e package name prima di creare le app negli store. Collauda iOS su TestFlight e Android su una traccia interna Google Play.
- Configura HTTPS per API e pannello. Imposta `ADMIN_ORIGIN` all’origine HTTPS esatta del pannello e `API_INTERNAL_URL` all’indirizzo dell’API raggiungibile dal server Next. Imposta `EXPO_PUBLIC_API_URL` all’API pubblica HTTPS. Configura `CORS_ORIGIN` per l’eventuale storefront web.
- Esegui le migrazioni su un database dedicato prima di avviare l’API. Configura backup cifrati, una prova periodica di ripristino, monitoraggio di `/health` e avvisi per errori del webhook o della coda push. In più repliche serve un rate limit condiviso a livello di infrastruttura.
- Prima di rendere disponibili pagamenti reali serve autorizzazione esplicita e un’attività separata per credenziali, webhook, wallet, modalità di rimborso e verifica finale. L’attuale configurazione rifiuta chiavi e webhook live.

## Privacy e conservazione

Il checkout registra nome e telefono. Per la consegna registra anche l’indirizzo e le note. Il codice di recupero dà accesso al riepilogo ospite e va trattato come una credenziale. Le immagini del catalogo sono pubbliche. Il titolare deve verificare che le foto non contengano dati personali e che possieda i diritti per pubblicarle.

Prima del lancio il titolare deve fornire e verificare informativa privacy, condizioni di vendita, soggetti che trattano i dati, contatti per esercitare i diritti, tempi di conservazione, resi e rimborsi, assieme agli obblighi per la vendita e la consegna di alimenti. Inserisci i link alle informative dalle impostazioni del pannello e configura le dichiarazioni richieste dagli store. Questo documento è una traccia tecnica per la revisione.

È disponibile un comando di manutenzione che individua gli ordini completati o annullati il cui recapito è scaduto secondo la soglia configurata. Con `RETENTION_CONTACT_DAYS=<giorni> npm --prefix packages/api run privacy:retention` mostra un conteggio. L’argomento `-- --apply` abilita la rimozione dei recapiti e token push degli ordini interessati. Concorda la soglia e la gestione di ordini abbandonati, audit, dati Stripe e backup prima di adottare il comando.
