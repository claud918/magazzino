# Gestione magazzino e ordini — Stack tecnologico

Decisioni concordate il 2026-10-28.

## Requisiti di partenza

- **Costo zero**: nessuna licenza, hosting o database a pagamento; solo componenti open source.
- **Un solo utente** (uso personale, non commerciale).
- **Ordini cliente** (merce in uscita) e **ordini fornitore** (merce in entrata).
- **Un solo magazzino**, articoli semplici: niente ubicazioni, lotti, scadenze, numeri di serie o varianti.
- **Accessibile da internet**, usabile anche da smartphone.
- **Solo online**: nessun uso offline con sincronizzazione.
- **Nessun documento fiscale** (DDT, fatture, SdI): fuori perimetro.

## Stack

| Strato | Scelta |
|---|---|
| Repository | Monorepo **npm workspaces**: `apps/web` (frontend), `apps/api` (backend), `packages/shared` (schemi e tipi condivisi) |
| Frontend | **Angular** come **PWA** (installabile sul telefono) |
| Lettura barcode | Dalla fotocamera del browser con `@zxing/browser` |
| API | **Hono** |
| Pubblicazione | **Un unico Cloudflare Worker** che serve sia i file statici di Angular sia l'API sotto `/api`: un solo deploy, stesso dominio, niente CORS |
| Database | **Cloudflare D1** (SQLite) + **Drizzle ORM** per schema tipizzato e migration |
| Validazione input | **Zod**, schemi condivisi tra frontend e API in `packages/shared` |
| Login | **Better Auth** (vedi sotto) |
| Backup | Cron Trigger notturno che esporta il database su **Cloudflare R2**, più un pulsante di download manuale nella app |
| Costo | **0 €**; facoltativo solo un dominio personalizzato (~10 €/anno), altrimenti sottodominio Cloudflare gratuito |

## Autenticazione

- Email e password, gestite con **Better Auth**; sessione via cookie salvata su D1.
- **Nessuna registrazione pubblica**: l'account si crea una volta con uno script da riga di comando.
- **Cambio password** dall'interno della app.
- **Password dimenticata**: si reimposta con lo stesso script, nessun reset via email.
- **Limite ai tentativi** integrato di Better Auth: circa 5 tentativi al minuto per IP, poi un'attesa breve che si azzera da sola. **L'account non viene mai bloccato.** Contatori salvati su D1, IP del client letto dall'header `cf-connecting-ip`.
- Niente 2FA. Usare una password lunga, generata da un password manager.
- Hash delle password: PBKDF2 di WebCrypto se lo scrypt predefinito supera il limite di CPU dei Worker gratuiti.

## Alternative scartate

- **Cloudflare Access** come login: scartato a favore di email e password gestite dalla app.
- **Java/Spring**: troppo pesante per le piattaforme gratuite senza un server proprio.
- **Vercel Hobby**: il piano gratuito vieta l'uso commerciale.
- **Render gratuito**: il database Postgres viene cancellato dopo 30 giorni.
- **Supabase gratuito**: il progetto va in pausa dopo circa 7 giorni senza uso.
- **Server a casa + Cloudflare Tunnel** e **VM Oracle Always Free**: richiedono di gestire una macchina.

## Da verificare in fase di configurazione

- Limite di CPU per richiesta dei Worker gratuiti (circa 10 ms) e compatibilità con l'hash delle password.
- Finestra di ripristino Time Travel di D1.
- Soglie gratuite attuali di Workers, D1 e R2.

## Prossimi passi

Creato il repository, si definisce il modello del dominio (`GLOSSARY.md` e ADR):

- termini: Articolo, Giacenza, Movimento (carico/scarico), Ordine cliente, Ordine fornitore;
- regole da decidere: giacenza negativa, evasione parziale, annullamento di un ordine già evaso;
- primo ADR: Cloudflare Workers + D1 al posto di un server tradizionale, una scelta difficile da cambiare dopo perché lega database e runtime.
