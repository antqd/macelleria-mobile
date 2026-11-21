# Stato del progetto

## Scritto nella repository

- App Expo con home da database, ricerca, filtro disponibilità, categorie, offerte, dettaglio prodotto, pesi da 500 g, carrello persistente e aggiornamento del prezzo prima del pagamento.
- Checkout ospite, ritiro e zone di consegna, preventivo server, codice di recupero e ultime 12 schede ordine sul dispositivo. Il riepilogo legge lo stato dell’ordine dal server. Profilo cliente facoltativo con codice privato e storico sincronizzato.
- API Fastify, schema e migrazione PostgreSQL, seed di base e catalogo dimostrativo esplicito, sessioni amministratore, audit e immagini rielaborate al caricamento.
- Stripe Test Mode con PaymentIntent lato server, PaymentSheet nativo, Payment Element web, webhook firmato e deduplicato e rimborso da pannello. La configurazione accetta solo chiavi Stripe di test.
- Pannello Next.js con dashboard da database, aggiornamento periodico, ricerca ordini, stampa, gestione stati, preparati, prodotti, promozioni, categorie, zone e impostazioni.
- Notifiche cliente tramite coda Expo Push e avvisi sui nuovi ordini nel pannello. Icone, splash, configurazione EAS, ambienti di esempio, Docker Compose locale e traccia per il trattamento dei dati.
- Test sorgente per pesi, carrello, stati e flusso integrato con database e Stripe Test Mode.

## Verifiche

- Nella fase precedente il typecheck dell’app, quattro test unitari sul prezzo e la compilazione del bundle web erano passati con il codice di quella fase.
- In questa fase non sono stati installati pacchetti né eseguiti lint, typecheck, test, migrazioni, anteprime o build, come richiesto. Il precedente tentativo di installare il backend ha incontrato `ENOSPC`.
- Il lockfile della root precede le ultime aggiunte. Rigenerarlo con `npm install` e generare i lockfile di API e pannello al primo collaudo.

## Problemi aperti e configurazioni

- Avvio e collaudo con PostgreSQL, applicazione della migrazione, verifica del flusso Stripe Test Mode completo, controlli visivi e accessibilità, verifica dispositivi e build iOS/Android.
- Il profilo usa un codice privato al posto delle credenziali email. Gli orari di ritiro e consegna sono informativi e non prenotabili.
- Mancano dati commerciali, testi legali definitivi, foto approvate, credenziali Stripe Test, certificati wallet/push e configurazione hosting. Serve verificare retention e backup prima della distribuzione.
- Il progetto non è pubblicato. Nessuna transazione live è stata eseguita.

## Prossima attività

Installare le dipendenze quando il disco lo consentirà, migrare un database locale dedicato e seguire il collaudo descritto in [README.md](README.md) e [docs/integrazione.md](docs/integrazione.md).
