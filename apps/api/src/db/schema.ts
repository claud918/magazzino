/**
 * Schema Drizzle del database D1 (SQLite) per la Cooperativa Barbatelle.
 * Vedi REQUISITI.md, GLOSSARY.md e docs/adr/0006-catalogo-vincolato-barbatelle-e-ruoli.md.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// 1. CATALOGO ANAGRAFICHE VINCOLATE (Varietà, Cloni, Portainnesti) e SOCI
// ============================================================================

export const varieta = sqliteTable(
  'varieta',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nome: text('nome').notNull(),
    attiva: integer('attiva', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [uniqueIndex('varieta_nome_uq').on(t.nome)],
);

export const cloni = sqliteTable(
  'cloni',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    varietaId: integer('varieta_id')
      .notNull()
      .references(() => varieta.id, { onDelete: 'restrict' }),
    codice: text('codice').notNull(),
    attivo: integer('attivo', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    uniqueIndex('cloni_varieta_codice_uq').on(t.varietaId, t.codice),
    index('cloni_varieta_idx').on(t.varietaId),
  ],
);

export const portainnesti = sqliteTable(
  'portainnesti',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    codice: text('codice').notNull(),
    descrizione: text('descrizione'),
    attivo: integer('attivo', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [uniqueIndex('portainnesti_codice_uq').on(t.codice)],
);

export const soci = sqliteTable(
  'soci',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nome: text('nome').notNull(),
    note: text('note'),
    attivo: integer('attivo', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [uniqueIndex('soci_nome_uq').on(t.nome)],
);

// ============================================================================
// 2. AUTENTICAZIONE E RUOLI NOMINATIVI (admin | commerciale | produttore)
// ============================================================================

export const utenti = sqliteTable(
  'utenti',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    nome: text('nome').notNull(),
    passwordHash: text('password_hash').notNull(),
    ruolo: text('ruolo', { enum: ['admin', 'commerciale', 'produttore'] }).notNull(),
    socioId: integer('socio_id').references(() => soci.id, { onDelete: 'set null' }),
    attivo: integer('attivo', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [uniqueIndex('utenti_email_uq').on(t.email)],
);

export const sessioni = sqliteTable(
  'sessioni',
  {
    id: text('id').primaryKey(),
    utenteId: integer('utente_id')
      .notNull()
      .references(() => utenti.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index('sessioni_utente_idx').on(t.utenteId)],
);

export const loginTentativi = sqliteTable('login_tentativi', {
  ip: text('ip').primaryKey(),
  tentativi: integer('tentativi').notNull().default(0),
  finestraStart: integer('finestra_start').notNull(),
});

// ============================================================================
// 3. CONFERIMENTI / LOTTI DEI SOCI (Entrate)
// ============================================================================

export const conferimentiLotti = sqliteTable(
  'conferimenti_lotti',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    socioId: integer('socio_id')
      .notNull()
      .references(() => soci.id, { onDelete: 'restrict' }),
    varietaId: integer('varieta_id')
      .notNull()
      .references(() => varieta.id, { onDelete: 'restrict' }),
    cloneId: integer('clone_id')
      .notNull()
      .references(() => cloni.id, { onDelete: 'restrict' }),
    portainnestoId: integer('portainnesto_id')
      .notNull()
      .references(() => portainnesti.id, { onDelete: 'restrict' }),
    codiceLotto: text('codice_lotto'),
    quantitaConferita: integer('quantita_conferita').notNull(),
    dataConferimento: text('data_conferimento').notNull(),
    note: text('note'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index('conferimenti_combinazione_idx').on(t.varietaId, t.cloneId, t.portainnestoId),
    index('conferimenti_socio_idx').on(t.socioId),
  ],
);

export const segnalazioniSoci = sqliteTable(
  'segnalazioni_soci',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    socioId: integer('socio_id')
      .notNull()
      .references(() => soci.id, { onDelete: 'restrict' }),
    varietaId: integer('varieta_id')
      .notNull()
      .references(() => varieta.id, { onDelete: 'restrict' }),
    cloneId: integer('clone_id')
      .notNull()
      .references(() => cloni.id, { onDelete: 'restrict' }),
    portainnestoId: integer('portainnesto_id')
      .notNull()
      .references(() => portainnesti.id, { onDelete: 'restrict' }),
    quantitaProposta: integer('quantita_proposta').notNull(),
    stato: text('stato', { enum: ['aperta', 'convertita', 'archiviata'] })
      .notNull()
      .default('aperta'),
    note: text('note'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index('segnalazioni_stato_idx').on(t.stato),
    index('segnalazioni_socio_idx').on(t.socioId),
  ],
);

// ============================================================================
// 4. ORDINI CLIENTI E RIGHE D'ORDINE (Impegni e Spedizioni)
// ============================================================================

export const ordiniClienti = sqliteTable(
  'ordini_clienti',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clienteNome: text('cliente_nome').notNull(),
    stato: text('stato', {
      enum: ['bozza', 'confermato', 'parzialmente_spedito', 'spedito', 'chiuso', 'annullato'],
    })
      .notNull()
      .default('confermato'),
    dataOrdine: text('data_ordine').notNull(),
    note: text('note'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index('ordini_stato_idx').on(t.stato)],
);

export const righeOrdine = sqliteTable(
  'righe_ordine',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ordineId: integer('ordine_id')
      .notNull()
      .references(() => ordiniClienti.id, { onDelete: 'cascade' }),
    varietaId: integer('varieta_id')
      .notNull()
      .references(() => varieta.id, { onDelete: 'restrict' }),
    cloneId: integer('clone_id')
      .notNull()
      .references(() => cloni.id, { onDelete: 'restrict' }),
    portainnestoId: integer('portainnesto_id')
      .notNull()
      .references(() => portainnesti.id, { onDelete: 'restrict' }),
    quantitaOrdinata: integer('quantita_ordinata').notNull(),
    quantitaSpedita: integer('quantita_spedita').notNull().default(0),
  },
  (t) => [
    index('righe_ordine_ordine_idx').on(t.ordineId),
    index('righe_ordine_combinazione_idx').on(t.varietaId, t.cloneId, t.portainnestoId),
  ],
);
