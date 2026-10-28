import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import type {
  Clone,
  ConferimentoLotto,
  DisponibilitaCombinazione,
  OrdineCliente,
  Portainnesto,
  RuoloUtente,
  SegnalazioneSocio,
  Socio,
  UtenteProfilo,
  Varieta,
} from '@magazzino/shared';

type TabVista = 'commerciali' | 'produttori' | 'conferimenti' | 'ordini' | 'catalogo';

interface NuovaRigaForm {
  varietaId: number | null;
  cloneId: number | null;
  portainnestoId: number | null;
  quantitaOrdinata: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);

  // Mostra i pulsanti di accesso rapido durante la fase di test (locale, tunnel mobile o *.workers.dev)
  protected readonly isAmbienteLocale = true;

  // Stato autenticazione
  protected readonly caricamentoIniziale = signal(true);
  protected readonly utente = signal<UtenteProfilo | null>(null);
  protected readonly loginEmail = signal('');
  protected readonly loginPassword = signal('');
  protected readonly loginErrore = signal<string | null>(null);
  protected readonly inInvio = signal(false);

  // Navigazione viste
  protected readonly vistaAttiva = signal<TabVista>('commerciali');
  protected readonly messaggioOk = signal<string | null>(null);
  protected readonly messaggioAvviso = signal<string | null>(null);
  protected readonly messaggioErrore = signal<string | null>(null);

  // Dati catalogo e dominio
  protected readonly listaVarieta = signal<Varieta[]>([]);
  protected readonly listaCloni = signal<Clone[]>([]);
  protected readonly listaPortainnesti = signal<Portainnesto[]>([]);
  protected readonly listaSoci = signal<Socio[]>([]);
  protected readonly disponibilita = signal<DisponibilitaCombinazione[]>([]);
  protected readonly conferimenti = signal<ConferimentoLotto[]>([]);
  protected readonly segnalazioni = signal<SegnalazioneSocio[]>([]);
  protected readonly ordini = signal<OrdineCliente[]>([]);
  protected readonly listaUtenti = signal<UtenteProfilo[]>([]);

  // Filtri Vista 1 (Commerciali) e Vista 2 (Produttori)
  protected readonly filtroVarietaId = signal<number | null>(null);
  protected readonly ricercaTesto = signal('');
  protected readonly soloDisponibiliComm = signal(false);
  protected readonly mostraFormPrenotazioneComm = signal(false);
  protected readonly mostraTuttiProduttori = signal(false);

  // Segnalazione disponibilità da parte del Socio Produttore (Vista 2)
  protected readonly combinazioneInSegnalazione = signal<DisponibilitaCombinazione | null>(null);
  protected readonly segSocioId = signal<number | null>(null);
  protected readonly segQuantita = signal<number>(500);
  protected readonly segNote = signal('');

  // Form Vista 3 — Nuovo Conferimento Socio
  protected readonly confSocioId = signal<number | null>(null);
  protected readonly confVarietaId = signal<number | null>(null);
  protected readonly confCloneId = signal<number | null>(null);
  protected readonly confPortainnestoId = signal<number | null>(null);
  protected readonly confCodiceLotto = signal('');
  protected readonly confQuantita = signal<number>(1000);
  protected readonly confData = signal(new Date().toISOString().slice(0, 10));
  protected readonly confNote = signal('');

  // Form Vista 4 (e Prenotazione Commerciali in Vista 1) — Nuovo Ordine Cliente
  protected readonly ordClienteNome = signal('');
  protected readonly ordData = signal(new Date().toISOString().slice(0, 10));
  protected readonly ordNote = signal('');
  protected readonly ordRighe = signal<NuovaRigaForm[]>([
    { varietaId: null, cloneId: null, portainnestoId: null, quantitaOrdinata: 500 },
  ]);
  protected readonly ordineInModificaSpedizione = signal<number | null>(null);
  protected readonly spedizioneRigheMap = signal<Record<number, number>>({});

  // Form Vista 5 — Catalogo Anagrafiche & Utenti
  protected readonly nuovaVarietaNome = signal('');
  protected readonly nuovoCloneVarietaId = signal<number | null>(null);
  protected readonly nuovoCloneCodice = signal('');
  protected readonly nuovoPortainnestoCodice = signal('');
  protected readonly nuovoPortainnestoDesc = signal('');
  protected readonly nuovoSocioNome = signal('');
  protected readonly nuovoSocioNote = signal('');
  protected readonly nuovoUtenteNome = signal('');
  protected readonly nuovoUtenteEmail = signal('');
  protected readonly nuovoUtentePassword = signal('');
  protected readonly nuovoUtenteRuolo = signal<RuoloUtente>('commerciale');
  protected readonly nuovoUtenteSocioId = signal<number | null>(null);

  // Cambio password personale + Importazione massiva catalogo
  protected readonly mostraCambioPassword = signal(false);
  protected readonly passAttuale = signal('');
  protected readonly passNuova = signal('');
  protected readonly importRigheVarietaCloni = signal('');
  protected readonly importRighePortainnesti = signal('');

  // Cloni filtrati a cascata sulla varietà scelta nel form Conferimento
  protected readonly cloniPerConferimento = computed(() => {
    const vId = this.confVarietaId();
    if (!vId) return [];
    return this.listaCloni().filter((c) => c.varietaId === vId && c.attivo);
  });

  // Lista filtrata per Vista 1 (Pannello Commerciali)
  protected readonly disponibilitaCommerciali = computed(() => {
    const vId = this.filtroVarietaId();
    const q = this.ricercaTesto().trim().toLowerCase();
    const soloDisp = this.soloDisponibiliComm();
    return this.disponibilita().filter((d) => {
      if (vId && d.varietaId !== vId) return false;
      if (soloDisp && d.disponibileVirtuale <= 0) return false;
      if (q) {
        const testo = `${d.varietaNome} ${d.cloneCodice} ${d.portainnestoCodice}`.toLowerCase();
        if (!testo.includes(q)) return false;
      }
      return true;
    });
  });

  // Lista filtrata per Vista 2 (Pannello Soci Produttori — Fabbisogno e Scoperti)
  protected readonly disponibilitaProduttori = computed(() => {
    const vId = this.filtroVarietaId();
    const tutti = this.mostraTuttiProduttori();
    return this.disponibilita()
      .filter((d) => {
        if (vId && d.varietaId !== vId) return false;
        if (!tutti && d.fabbisognoScoperto <= 0) return false;
        return true;
      })
      .sort((a, b) => b.fabbisognoScoperto - a.fabbisognoScoperto);
  });

  protected readonly totaleCombinazioniScoperte = computed(
    () => this.disponibilita().filter((d) => d.fabbisognoScoperto > 0).length,
  );

  protected readonly segnalazioniAperte = computed(() =>
    this.segnalazioni().filter((s) => s.stato === 'aperta'),
  );

  protected readonly prenotazioniDaConfermare = computed(
    () => this.ordini().filter((o) => o.stato === 'bozza').length,
  );

  // KPI sintetici per Vista 1 (Commerciali) e Vista 2 (Produttori)
  protected readonly kpiCommerciali = computed(() => {
    const lista = this.disponibilitaCommerciali();
    let disponibile = 0;
    let prodotto = 0;
    let ordinato = 0;
    for (const item of lista) {
      if (item.disponibileVirtuale > 0) {
        disponibile += item.disponibileVirtuale;
      }
      prodotto += item.prodotto;
      ordinato += item.ordinato;
    }
    return { disponibile, prodotto, ordinato, combinazioni: lista.length };
  });

  protected readonly kpiProduttori = computed(() => {
    const lista = this.disponibilita();
    let scopertoTotale = 0;
    let combinazioniScoperte = 0;
    let prodottoTotale = 0;
    for (const item of lista) {
      prodottoTotale += item.prodotto;
      if (item.fabbisognoScoperto > 0) {
        scopertoTotale += item.fabbisognoScoperto;
        combinazioniScoperte++;
      }
    }
    return { scopertoTotale, combinazioniScoperte, prodottoTotale };
  });

  protected etichettaStatoOrdine(stato: string): string {
    switch (stato) {
      case 'bozza':
        return 'Da confermare';
      case 'confermato':
        return 'Confermato';
      case 'parzialmente_spedito':
        return 'Spedito parz.';
      case 'spedito':
        return 'Spedito';
      case 'chiuso':
        return 'Chiuso';
      case 'annullato':
        return 'Annullato';
      default:
        return stato;
    }
  }

  ngOnInit(): void {
    this.verificaSessione();
  }

  protected cloniPerVarieta(varietaId: number | null): Clone[] {
    if (!varietaId) return [];
    return this.listaCloni().filter((c) => c.varietaId === Number(varietaId) && c.attivo);
  }

  protected disponibilitaPerTripla(
    varietaId: number | null,
    cloneId: number | null,
    portainnestoId: number | null,
  ): DisponibilitaCombinazione | undefined {
    if (!varietaId || !cloneId || !portainnestoId) return undefined;
    return this.disponibilita().find(
      (d) =>
        d.varietaId === Number(varietaId) &&
        d.cloneId === Number(cloneId) &&
        d.portainnestoId === Number(portainnestoId),
    );
  }

  private pulisciMessaggi(): void {
    this.messaggioOk.set(null);
    this.messaggioAvviso.set(null);
    this.messaggioErrore.set(null);
  }

  private verificaSessione(): void {
    this.http.get<{ utente: UtenteProfilo }>('/api/auth/me').subscribe({
      next: (res) => {
        this.impostaUtenteAutenticato(res.utente);
        this.caricamentoIniziale.set(false);
      },
      error: () => {
        this.utente.set(null);
        this.caricamentoIniziale.set(false);
      },
    });
  }

  private impostaUtenteAutenticato(u: UtenteProfilo): void {
    this.utente.set(u);
    if (u.ruolo === 'commerciale') {
      this.vistaAttiva.set('commerciali');
    } else if (u.ruolo === 'produttore') {
      this.vistaAttiva.set('produttori');
      if (u.socioId) {
        this.segSocioId.set(u.socioId);
      }
    } else {
      this.vistaAttiva.set('commerciali');
    }
    this.ricaricaDati();
  }

  protected eseguiLogin(): void {
    this.loginErrore.set(null);
    this.inInvio.set(true);
    this.http
      .post<{ utente: UtenteProfilo }>('/api/auth/login', {
        email: this.loginEmail(),
        password: this.loginPassword(),
      })
      .subscribe({
        next: (res) => {
          this.inInvio.set(false);
          this.loginPassword.set('');
          this.impostaUtenteAutenticato(res.utente);
        },
        error: (err) => {
          this.inInvio.set(false);
          this.loginErrore.set(err?.error?.error ?? 'Errore durante il login');
        },
      });
  }

  protected compilaAccessoRapido(ruolo: RuoloUtente): void {
    if (ruolo === 'admin') {
      this.loginEmail.set('admin@cooperativa.it');
      this.loginPassword.set('AdminBarbatelle2026!');
    } else if (ruolo === 'commerciale') {
      this.loginEmail.set('commerciale@cooperativa.it');
      this.loginPassword.set('CommBarbatelle2026!');
    } else {
      this.loginEmail.set('rossi@cooperativa.it');
      this.loginPassword.set('SocioBarbatelle2026!');
    }
    this.eseguiLogin();
  }

  protected eseguiLogout(): void {
    this.http.post('/api/auth/logout', {}).subscribe({
      complete: () => {
        this.utente.set(null);
        this.pulisciMessaggi();
      },
    });
  }

  protected cambiaVista(v: TabVista): void {
    this.pulisciMessaggi();
    this.vistaAttiva.set(v);
  }

  protected ricaricaDati(): void {
    const ruolo = this.utente()?.ruolo;

    this.http
      .get<{
        varieta: Varieta[];
        cloni: Clone[];
        portainnesti: Portainnesto[];
        soci: Socio[];
      }>('/api/catalogo')
      .subscribe((cat) => {
        this.listaVarieta.set(cat.varieta);
        this.listaCloni.set(cat.cloni);
        this.listaPortainnesti.set(cat.portainnesti);
        this.listaSoci.set(cat.soci);
      });

    this.http
      .get<{ disponibilita: DisponibilitaCombinazione[] }>('/api/disponibilita')
      .subscribe((res) => this.disponibilita.set(res.disponibilita));

    if (ruolo === 'admin' || ruolo === 'produttore') {
      this.http
        .get<{ conferimenti: ConferimentoLotto[] }>('/api/conferimenti')
        .subscribe((res) => this.conferimenti.set(res.conferimenti));

      this.http
        .get<{ segnalazioni: SegnalazioneSocio[] }>('/api/conferimenti/segnalazioni')
        .subscribe((res) => this.segnalazioni.set(res.segnalazioni));
    }

    if (ruolo === 'admin' || ruolo === 'commerciale') {
      this.http
        .get<{ ordini: OrdineCliente[] }>('/api/ordini')
        .subscribe((res) => this.ordini.set(res.ordini));
    }

    if (ruolo === 'admin') {
      this.http
        .get<{ utenti: UtenteProfilo[] }>('/api/auth/utenti')
        .subscribe((res) => this.listaUtenti.set(res.utenti));
    }
  }

  // --- Azioni Vista 1 (Commerciali): Prenotazione rapida da una scheda ---

  protected prenotaDaScheda(item: DisponibilitaCombinazione): void {
    this.ordRighe.set([
      {
        varietaId: item.varietaId,
        cloneId: item.cloneId,
        portainnestoId: item.portainnestoId,
        quantitaOrdinata: item.disponibileVirtuale > 0 ? Math.min(500, item.disponibileVirtuale) : 500,
      },
    ]);
    this.mostraFormPrenotazioneComm.set(true);
  }

  // --- Azioni Vista 2 (Soci Produttori): Segnalazione disponibilità su uno scoperto ---

  protected apriSegnalazioneScoperto(item: DisponibilitaCombinazione): void {
    this.pulisciMessaggi();
    this.combinazioneInSegnalazione.set(item);
    this.segQuantita.set(item.fabbisognoScoperto > 0 ? item.fabbisognoScoperto : 500);
    this.segNote.set('');
    if (this.utente()?.socioId) {
      this.segSocioId.set(this.utente()!.socioId);
    }
  }

  protected inviaSegnalazioneDisponibilita(): void {
    this.pulisciMessaggi();
    const comb = this.combinazioneInSegnalazione();
    if (!comb) return;

    const quantitaProposta = Number(this.segQuantita());
    if (!quantitaProposta || quantitaProposta <= 0) {
      this.messaggioErrore.set('Inserisci una quantità valida (> 0).');
      return;
    }

    this.http
      .post('/api/conferimenti/segnalazioni', {
        socioId: this.segSocioId() ? Number(this.segSocioId()) : undefined,
        varietaId: comb.varietaId,
        cloneId: comb.cloneId,
        portainnestoId: comb.portainnestoId,
        quantitaProposta,
        note: this.segNote().trim() || null,
      })
      .subscribe({
        next: () => {
          this.messaggioOk.set(
            `Disponibilità di ${quantitaProposta} barbatelle (${comb.varietaNome} ${comb.cloneCodice} / ${comb.portainnestoCodice}) segnalata all'Amministrazione.`,
          );
          this.combinazioneInSegnalazione.set(null);
          this.ricaricaDati();
        },
        error: (err) =>
          this.messaggioErrore.set(err?.error?.error ?? 'Errore invio segnalazione'),
      });
  }

  protected convertiSegnalazioneInConferimento(seg: SegnalazioneSocio): void {
    this.pulisciMessaggi();
    this.http.post(`/api/conferimenti/segnalazioni/${seg.id}/converti`, {}).subscribe({
      next: () => {
        this.messaggioOk.set(
          `Segnalazione di ${seg.socioNome} (${seg.quantitaProposta} pz) convertita in Conferimento effettivo.`,
        );
        this.ricaricaDati();
      },
      error: (err) =>
        this.messaggioErrore.set(err?.error?.error ?? 'Errore durante la conversione'),
    });
  }

  protected archiviaSegnalazione(seg: SegnalazioneSocio): void {
    this.pulisciMessaggi();
    this.http.post(`/api/conferimenti/segnalazioni/${seg.id}/archivia`, {}).subscribe({
      next: () => {
        this.messaggioOk.set('Segnalazione archiviata.');
        this.ricaricaDati();
      },
      error: (err) =>
        this.messaggioErrore.set(err?.error?.error ?? 'Errore durante archiviazione'),
    });
  }

  // --- Azioni Vista 3: Conferimenti Soci ---

  protected onCambioVarietaConferimento(val: number | null): void {
    this.confVarietaId.set(val ? Number(val) : null);
    this.confCloneId.set(null);
  }

  protected salvaConferimento(): void {
    this.pulisciMessaggi();
    const socioId = Number(this.confSocioId());
    const varietaId = Number(this.confVarietaId());
    const cloneId = Number(this.confCloneId());
    const portainnestoId = Number(this.confPortainnestoId());
    const quantitaConferita = Number(this.confQuantita());

    if (!socioId || !varietaId || !cloneId || !portainnestoId || !quantitaConferita) {
      this.messaggioErrore.set('Compila Socio, Varietà, Clone, Portainnesto e Quantità.');
      return;
    }

    this.http
      .post('/api/conferimenti', {
        socioId,
        varietaId,
        cloneId,
        portainnestoId,
        codiceLotto: this.confCodiceLotto() || null,
        quantitaConferita,
        dataConferimento: this.confData(),
        note: this.confNote() || null,
      })
      .subscribe({
        next: () => {
          this.messaggioOk.set('Conferimento registrato con successo.');
          this.confCodiceLotto.set('');
          this.confNote.set('');
          this.ricaricaDati();
        },
        error: (err) => {
          this.messaggioErrore.set(err?.error?.error ?? 'Errore nel salvataggio del conferimento');
        },
      });
  }

  protected eliminaConferimento(id: number): void {
    this.pulisciMessaggi();
    this.http.delete(`/api/conferimenti/${id}`).subscribe({
      next: () => {
        this.messaggioOk.set('Conferimento rimosso.');
        this.ricaricaDati();
      },
      error: (err) => this.messaggioErrore.set(err?.error?.error ?? 'Errore durante la rimozione'),
    });
  }

  // --- Azioni Vista 4 (e Prenotazioni Commerciali): Ordini Clienti e Spedizioni ---

  protected aggiungiRigaOrdine(): void {
    this.ordRighe.update((r) => [
      ...r,
      { varietaId: null, cloneId: null, portainnestoId: null, quantitaOrdinata: 500 },
    ]);
  }

  protected rimuoviRigaOrdine(idx: number): void {
    this.ordRighe.update((r) => (r.length > 1 ? r.filter((_, i) => i !== idx) : r));
  }

  protected onCambioVarietaRiga(riga: NuovaRigaForm, val: number | null): void {
    riga.varietaId = val ? Number(val) : null;
    riga.cloneId = null;
  }

  protected salvaOrdineCliente(): void {
    this.pulisciMessaggi();
    const clienteNome = this.ordClienteNome().trim();
    if (!clienteNome) {
      this.messaggioErrore.set('Inserisci il nome del cliente.');
      return;
    }

    const righeValide = this.ordRighe().map((r) => ({
      varietaId: Number(r.varietaId),
      cloneId: Number(r.cloneId),
      portainnestoId: Number(r.portainnestoId),
      quantitaOrdinata: Number(r.quantitaOrdinata),
    }));

    if (
      righeValide.some(
        (r) => !r.varietaId || !r.cloneId || !r.portainnestoId || r.quantitaOrdinata <= 0,
      )
    ) {
      this.messaggioErrore.set(
        'Completa tutte le righe ordine (Varietà, Clone, Portainnesto e Quantità > 0).',
      );
      return;
    }

    const isComm = this.utente()?.ruolo === 'commerciale';

    this.http
      .post<{
        ordineId: number;
        stato: string;
        avvisiScoperto: DisponibilitaCombinazione[];
      }>('/api/ordini', {
        clienteNome,
        dataOrdine: this.ordData(),
        confermaSubito: !isComm,
        note: this.ordNote() || null,
        righe: righeValide,
      })
      .subscribe({
        next: (res) => {
          if (res.stato === 'bozza') {
            this.messaggioOk.set(
              `Prenotazione #${res.ordineId} inviata all'Amministrazione (in attesa di conferma).`,
            );
            this.mostraFormPrenotazioneComm.set(false);
          } else {
            this.messaggioOk.set(
              `Ordine #${res.ordineId} registrato e impegnato nel Magazzino Virtuale.`,
            );
          }
          if (res.avvisiScoperto && res.avvisiScoperto.length > 0) {
            const descr = res.avvisiScoperto
              .map(
                (a) =>
                  `${a.varietaNome} ${a.cloneCodice} / ${a.portainnestoCodice} (scoperto: ${a.fabbisognoScoperto} pz)`,
              )
              .join(', ');
            this.messaggioAvviso.set(
              `Attenzione (ADR-0003): l'ordine genera un fabbisogno scoperto per i soci su: ${descr}`,
            );
          }
          this.ordClienteNome.set('');
          this.ordNote.set('');
          this.ordRighe.set([
            { varietaId: null, cloneId: null, portainnestoId: null, quantitaOrdinata: 500 },
          ]);
          this.ricaricaDati();
        },
        error: (err) => {
          this.messaggioErrore.set(err?.error?.error ?? 'Errore nella creazione ordine');
        },
      });
  }

  protected apriModificaSpedizione(ordine: OrdineCliente): void {
    const map: Record<number, number> = {};
    for (const r of ordine.righe) {
      map[r.id] = r.quantitaSpedita;
    }
    this.spedizioneRigheMap.set(map);
    this.ordineInModificaSpedizione.set(ordine.id);
  }

  protected aggiornaQuantitaSpeditaInput(rigaId: number, valore: number): void {
    this.spedizioneRigheMap.update((m) => ({ ...m, [rigaId]: Number(valore) }));
  }

  protected salvaSpedizioneParziale(ordine: OrdineCliente): void {
    this.pulisciMessaggi();
    const map = this.spedizioneRigheMap();
    const righe = ordine.righe.map((r) => ({
      rigaId: r.id,
      quantitaSpedita: Number(map[r.id] ?? r.quantitaSpedita),
    }));

    this.http.post(`/api/ordini/${ordine.id}/spedizione`, { righe }).subscribe({
      next: () => {
        this.messaggioOk.set(`Spedizione aggiornata per l'ordine #${ordine.id}.`);
        this.ordineInModificaSpedizione.set(null);
        this.ricaricaDati();
      },
      error: (err) =>
        this.messaggioErrore.set(err?.error?.error ?? 'Errore aggiornamento spedizione'),
    });
  }

  protected spedisciTuttoOrdine(ordine: OrdineCliente): void {
    this.pulisciMessaggi();
    const righe = ordine.righe.map((r) => ({
      rigaId: r.id,
      quantitaSpedita: r.quantitaOrdinata,
    }));

    this.http.post(`/api/ordini/${ordine.id}/spedizione`, { righe }).subscribe({
      next: () => {
        this.messaggioOk.set(`Ordine #${ordine.id} contrassegnato come interamente spedito.`);
        this.ordineInModificaSpedizione.set(null);
        this.ricaricaDati();
      },
      error: (err) => this.messaggioErrore.set(err?.error?.error ?? 'Errore spedizione totale'),
    });
  }

  protected cambiaStatoOrdine(
    ordine: OrdineCliente,
    nuovoStato: 'chiuso' | 'annullato' | 'confermato',
  ): void {
    this.pulisciMessaggi();
    this.http.post(`/api/ordini/${ordine.id}/stato`, { stato: nuovoStato }).subscribe({
      next: () => {
        let msg = `Stato dell'ordine #${ordine.id} aggiornato a '${nuovoStato}'.`;
        if (nuovoStato === 'annullato') {
          msg = `Ordine #${ordine.id} annullato: la quantità è tornata subito disponibile nel Magazzino Virtuale.`;
        } else if (nuovoStato === 'confermato') {
          msg = `Prenotazione #${ordine.id} confermata: la quantità è ora impegnata nel Magazzino Virtuale.`;
        }
        this.messaggioOk.set(msg);
        this.ricaricaDati();
      },
      error: (err) => this.messaggioErrore.set(err?.error?.error ?? 'Errore cambio stato ordine'),
    });
  }

  // --- Azioni Vista 5: Catalogo Anagrafiche & Utenti ---

  protected aggiungiVarieta(): void {
    this.pulisciMessaggi();
    const nome = this.nuovaVarietaNome().trim();
    if (!nome) return;
    this.http.post('/api/catalogo/varieta', { nome }).subscribe({
      next: () => {
        this.nuovaVarietaNome.set('');
        this.messaggioOk.set(`Varietà '${nome}' aggiunta al catalogo.`);
        this.ricaricaDati();
      },
      error: (err) => this.messaggioErrore.set(err?.error?.error ?? 'Errore aggiunta varietà'),
    });
  }

  protected aggiungiClone(): void {
    this.pulisciMessaggi();
    const varietaId = Number(this.nuovoCloneVarietaId());
    const codice = this.nuovoCloneCodice().trim();
    if (!varietaId || !codice) return;
    this.http.post('/api/catalogo/cloni', { varietaId, codice }).subscribe({
      next: () => {
        this.nuovoCloneCodice.set('');
        this.messaggioOk.set(`Clone '${codice}' associato correttamente.`);
        this.ricaricaDati();
      },
      error: (err) => this.messaggioErrore.set(err?.error?.error ?? 'Errore aggiunta clone'),
    });
  }

  protected aggiungiPortainnesto(): void {
    this.pulisciMessaggi();
    const codice = this.nuovoPortainnestoCodice().trim();
    if (!codice) return;
    this.http
      .post('/api/catalogo/portainnesti', {
        codice,
        descrizione: this.nuovoPortainnestoDesc().trim() || null,
      })
      .subscribe({
        next: () => {
          this.nuovoPortainnestoCodice.set('');
          this.nuovoPortainnestoDesc.set('');
          this.messaggioOk.set(`Portainnesto '${codice}' aggiunto al catalogo.`);
          this.ricaricaDati();
        },
        error: (err) =>
          this.messaggioErrore.set(err?.error?.error ?? 'Errore aggiunta portainnesto'),
      });
  }

  protected aggiungiSocio(): void {
    this.pulisciMessaggi();
    const nome = this.nuovoSocioNome().trim();
    if (!nome) return;
    this.http
      .post('/api/catalogo/soci', {
        nome,
        note: this.nuovoSocioNote().trim() || null,
      })
      .subscribe({
        next: () => {
          this.nuovoSocioNome.set('');
          this.nuovoSocioNote.set('');
          this.messaggioOk.set(`Socio '${nome}' aggiunto.`);
          this.ricaricaDati();
        },
        error: (err) => this.messaggioErrore.set(err?.error?.error ?? 'Errore aggiunta socio'),
      });
  }

  protected aggiungiUtente(): void {
    this.pulisciMessaggi();
    this.http
      .post('/api/auth/utenti', {
        nome: this.nuovoUtenteNome().trim(),
        email: this.nuovoUtenteEmail().trim(),
        password: this.nuovoUtentePassword(),
        ruolo: this.nuovoUtenteRuolo(),
        socioId:
          this.nuovoUtenteRuolo() === 'produttore' && this.nuovoUtenteSocioId()
            ? Number(this.nuovoUtenteSocioId())
            : null,
      })
      .subscribe({
        next: () => {
          this.messaggioOk.set(`Account nominativo '${this.nuovoUtenteEmail()}' creato.`);
          this.nuovoUtenteNome.set('');
          this.nuovoUtenteEmail.set('');
          this.nuovoUtentePassword.set('');
          this.nuovoUtenteSocioId.set(null);
          this.ricaricaDati();
        },
        error: (err) => this.messaggioErrore.set(err?.error?.error ?? 'Errore creazione utente'),
      });
  }

  protected cambiaPasswordPersonale(): void {
    this.pulisciMessaggi();
    this.http
      .post('/api/auth/change-password', {
        passwordAttuale: this.passAttuale(),
        nuovaPassword: this.passNuova(),
      })
      .subscribe({
        next: () => {
          this.messaggioOk.set('Password aggiornata con successo.');
          this.passAttuale.set('');
          this.passNuova.set('');
          this.mostraCambioPassword.set(false);
        },
        error: (err) =>
          this.messaggioErrore.set(err?.error?.error ?? 'Errore durante il cambio password'),
      });
  }

  protected scaricaBackupManuale(): void {
    window.open('/api/backup/download', '_blank');
  }

  protected eseguiImportMassivoCatalogo(): void {
    this.pulisciMessaggi();
    this.http
      .post<{
        varietaElaborate: number;
        cloniElaborati: number;
        portainnestiElaborati: number;
      }>('/api/backup/import-catalogo', {
        righeVarietaCloni: this.importRigheVarietaCloni(),
        righePortainnesti: this.importRighePortainnesti(),
      })
      .subscribe({
        next: (res) => {
          this.messaggioOk.set(
            `Importazione completata: ${res.varietaElaborate} righe varietà, ${res.cloniElaborati} cloni, ${res.portainnestiElaborati} portainnesti.`,
          );
          this.importRigheVarietaCloni.set('');
          this.importRighePortainnesti.set('');
          this.ricaricaDati();
        },
        error: (err) =>
          this.messaggioErrore.set(err?.error?.error ?? 'Errore durante importazione catalogo'),
      });
  }
}
