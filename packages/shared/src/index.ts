/**
 * Schemi Zod e tipi condivisi tra frontend (apps/web) e API (apps/api)
 * per la Cooperativa Barbatelle (REQUISITI.md e GLOSSARY.md).
 */
import { z } from 'zod';

// --- Healthcheck ---

export const HealthResponse = z.object({
  status: z.literal('ok'),
  db: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

// --- Ruoli e Autenticazione (Account nominativi) ---

export const RuoloUtente = z.enum(['admin', 'commerciale', 'produttore']);
export type RuoloUtente = z.infer<typeof RuoloUtente>;

export const UtenteProfilo = z.object({
  id: z.number().int().positive(),
  email: z.string().email(),
  nome: z.string().min(1),
  ruolo: RuoloUtente,
  socioId: z.number().int().positive().nullable(),
  attivo: z.boolean(),
});
export type UtenteProfilo = z.infer<typeof UtenteProfilo>;

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email('Email non valida'),
  password: z.string().min(1, 'Password obbligatoria'),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const CambioPasswordInput = z.object({
  passwordAttuale: z.string().min(1),
  nuovaPassword: z.string().min(8, 'La nuova password deve avere almeno 8 caratteri'),
});
export type CambioPasswordInput = z.infer<typeof CambioPasswordInput>;

export const CreaUtenteInput = z.object({
  email: z.string().trim().toLowerCase().email('Email non valida'),
  nome: z.string().trim().min(1, 'Nome obbligatorio'),
  password: z.string().min(8, 'La password deve avere almeno 8 caratteri'),
  ruolo: RuoloUtente,
  socioId: z.number().int().positive().nullable().optional(),
});
export type CreaUtenteInput = z.infer<typeof CreaUtenteInput>;

// --- Catalogo Anagrafiche Vincolate (Varietà, Clone, Portainnesto) ---

export const Varieta = z.object({
  id: z.number().int().positive(),
  nome: z.string().min(1),
  attiva: z.boolean(),
});
export type Varieta = z.infer<typeof Varieta>;

export const CreaVarietaInput = z.object({
  nome: z.string().trim().min(1, 'Nome varietà obbligatorio'),
});
export type CreaVarietaInput = z.infer<typeof CreaVarietaInput>;

export const Clone = z.object({
  id: z.number().int().positive(),
  varietaId: z.number().int().positive(),
  codice: z.string().min(1),
  attivo: z.boolean(),
});
export type Clone = z.infer<typeof Clone>;

export const CreaCloneInput = z.object({
  varietaId: z.number().int().positive(),
  codice: z.string().trim().min(1, 'Codice clone obbligatorio'),
});
export type CreaCloneInput = z.infer<typeof CreaCloneInput>;

export const Portainnesto = z.object({
  id: z.number().int().positive(),
  codice: z.string().min(1),
  descrizione: z.string().nullable(),
  attivo: z.boolean(),
});
export type Portainnesto = z.infer<typeof Portainnesto>;

export const CreaPortainnestoInput = z.object({
  codice: z.string().trim().min(1, 'Codice portainnesto obbligatorio'),
  descrizione: z.string().trim().nullable().optional(),
});
export type CreaPortainnestoInput = z.infer<typeof CreaPortainnestoInput>;

// --- Soci Produttori (e Fornitori Terzi) ---

export const Socio = z.object({
  id: z.number().int().positive(),
  nome: z.string().min(1),
  note: z.string().nullable(),
  attivo: z.boolean(),
});
export type Socio = z.infer<typeof Socio>;

export const CreaSocioInput = z.object({
  nome: z.string().trim().min(1, 'Nome socio obbligatorio'),
  note: z.string().trim().nullable().optional(),
});
export type CreaSocioInput = z.infer<typeof CreaSocioInput>;

// --- Conferimenti / Lotti dei Soci (Vista 3) ---

export const ConferimentoLotto = z.object({
  id: z.number().int().positive(),
  socioId: z.number().int().positive(),
  socioNome: z.string(),
  varietaId: z.number().int().positive(),
  varietaNome: z.string(),
  cloneId: z.number().int().positive(),
  cloneCodice: z.string(),
  portainnestoId: z.number().int().positive(),
  portainnestoCodice: z.string(),
  codiceLotto: z.string().nullable(),
  quantitaConferita: z.number().int().refine((n) => n !== 0, 'La quantità non può essere zero'),
  dataConferimento: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type ConferimentoLotto = z.infer<typeof ConferimentoLotto>;

export const CreaConferimentoInput = z.object({
  socioId: z.number().int().positive(),
  varietaId: z.number().int().positive(),
  cloneId: z.number().int().positive(),
  portainnestoId: z.number().int().positive(),
  codiceLotto: z.string().trim().nullable().optional(),
  quantitaConferita: z
    .number()
    .int('La quantità deve essere un numero intero')
    .refine((n) => n !== 0, 'La quantità non può essere zero'),
  dataConferimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data YYYY-MM-DD'),
  note: z.string().trim().nullable().optional(),
});
export type CreaConferimentoInput = z.infer<typeof CreaConferimentoInput>;

// --- Ordini Clienti e Spedizioni (Vista 4) ---

export const StatoOrdine = z.enum([
  'bozza',
  'confermato',
  'parzialmente_spedito',
  'spedito',
  'chiuso',
  'annullato',
]);
export type StatoOrdine = z.infer<typeof StatoOrdine>;

export const RigaOrdine = z.object({
  id: z.number().int().positive(),
  ordineId: z.number().int().positive(),
  varietaId: z.number().int().positive(),
  varietaNome: z.string(),
  cloneId: z.number().int().positive(),
  cloneCodice: z.string(),
  portainnestoId: z.number().int().positive(),
  portainnestoCodice: z.string(),
  quantitaOrdinata: z.number().int().positive(),
  quantitaSpedita: z.number().int().nonnegative(),
});
export type RigaOrdine = z.infer<typeof RigaOrdine>;

export const OrdineCliente = z.object({
  id: z.number().int().positive(),
  clienteNome: z.string().min(1),
  stato: StatoOrdine,
  dataOrdine: z.string(),
  note: z.string().nullable(),
  righe: z.array(RigaOrdine),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrdineCliente = z.infer<typeof OrdineCliente>;

export const CreaRigaOrdineInput = z.object({
  varietaId: z.number().int().positive(),
  cloneId: z.number().int().positive(),
  portainnestoId: z.number().int().positive(),
  quantitaOrdinata: z.number().int().positive('La quantità ordinata deve essere > 0'),
});
export type CreaRigaOrdineInput = z.infer<typeof CreaRigaOrdineInput>;

export const CreaOrdineClienteInput = z.object({
  clienteNome: z.string().trim().min(1, 'Nome cliente obbligatorio'),
  dataOrdine: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data YYYY-MM-DD'),
  confermaSubito: z.boolean().default(true),
  note: z.string().trim().nullable().optional(),
  righe: z.array(CreaRigaOrdineInput).min(1, 'Inserire almeno una riga d’ordine'),
});
export type CreaOrdineClienteInput = z.infer<typeof CreaOrdineClienteInput>;

export const RegistraSpedizioneInput = z.object({
  righe: z
    .array(
      z.object({
        rigaId: z.number().int().positive(),
        quantitaSpedita: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});
export type RegistraSpedizioneInput = z.infer<typeof RegistraSpedizioneInput>;

// --- I 7 Indicatori di Disponibilità per Combinazione (Viste 1 e 2) ---

export const DisponibilitaCombinazione = z.object({
  varietaId: z.number().int().positive(),
  varietaNome: z.string(),
  cloneId: z.number().int().positive(),
  cloneCodice: z.string(),
  portainnestoId: z.number().int().positive(),
  portainnestoCodice: z.string(),
  /** 1. Totale conferito dai soci */
  prodotto: z.number().int(),
  /** 2. Totale impegnato negli ordini attivi */
  ordinato: z.number().int(),
  /** 3. Di cui già spedito */
  spedito: z.number().int(),
  /** 4. Residuo ordini da spedire (ordinato - spedito) */
  daSpedire: z.number().int(),
  /** 5. Rimanenza Magazzino Virtuale vendibile dai commerciali (prodotto - ordinato) */
  disponibileVirtuale: z.number().int(),
  /** 6. Giacenza fisica attuale in magazzino (prodotto - spedito) */
  giacenzaFisica: z.number().int(),
  /** 7. Fabbisogno scoperto per i soci produttori: MAX(0, ordinato - prodotto) */
  fabbisognoScoperto: z.number().int().nonnegative(),
});
export type DisponibilitaCombinazione = z.infer<typeof DisponibilitaCombinazione>;

// --- Segnalazioni Disponibilità dei Soci Produttori (per coprire scoperti) ---

export const StatoSegnalazioneSocio = z.enum(['aperta', 'convertita', 'archiviata']);
export type StatoSegnalazioneSocio = z.infer<typeof StatoSegnalazioneSocio>;

export const SegnalazioneSocio = z.object({
  id: z.number().int().positive(),
  socioId: z.number().int().positive(),
  socioNome: z.string(),
  varietaId: z.number().int().positive(),
  varietaNome: z.string(),
  cloneId: z.number().int().positive(),
  cloneCodice: z.string(),
  portainnestoId: z.number().int().positive(),
  portainnestoCodice: z.string(),
  quantitaProposta: z.number().int().positive(),
  stato: StatoSegnalazioneSocio,
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type SegnalazioneSocio = z.infer<typeof SegnalazioneSocio>;

export const CreaSegnalazioneSocioInput = z.object({
  socioId: z.number().int().positive().optional(),
  varietaId: z.number().int().positive(),
  cloneId: z.number().int().positive(),
  portainnestoId: z.number().int().positive(),
  quantitaProposta: z.number().int().positive('Inserire una quantità > 0'),
  note: z.string().trim().nullable().optional(),
});
export type CreaSegnalazioneSocioInput = z.infer<typeof CreaSegnalazioneSocioInput>;
