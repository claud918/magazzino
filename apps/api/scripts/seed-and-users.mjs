/**
 * Script CLI per:
 * 1) Creare o reimpostare la password di un account nominativo (`admin`, `commerciale`, `produttore`)
 * 2) Popolare il database D1 con il catalogo iniziale della Cooperativa Barbatelle e3 utenze di test.
 *
 * Uso:
 *   node scripts/seed-and-users.mjs seed [--remote]
 *   node scripts/seed-and-users.mjs user <email> <password> <ruolo> "<nome>" [--remote]
 */
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const enc = new TextEncoder();
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await webcrypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: ITERATIONS,
    },
    keyMaterial,
    KEY_BYTES * 8,
  );
  return `pbkdf2:${ITERATIONS}:${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}

function sqlString(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function runD1Sql(sqlText, isRemote) {
  const tmpFile = join(process.cwd(), `.tmp-d1-${Date.now()}.sql`);
  writeFileSync(tmpFile, sqlText, 'utf8');
  try {
    const args = [
      'wrangler',
      'd1',
      'execute',
      'magazzino',
      isRemote ? '--remote' : '--local',
      `--file=${tmpFile}`,
    ];
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}

const args = process.argv.slice(2);
const command = args[0];
const isRemote = args.includes('--remote');

if (command === 'user') {
  const [email, password, ruolo, nome] = args.slice(1).filter((a) => a !== '--remote');
  if (!email || !password || !['admin', 'commerciale', 'produttore'].includes(ruolo) || !nome) {
    console.error(
      'Uso: node scripts/seed-and-users.mjs user <email> <password> <admin|commerciale|produttore> "<nome>" [--remote]',
    );
    process.exit(1);
  }
  const hash = await hashPassword(password);
  const sql = `
    INSERT INTO utenti (email, nome, password_hash, ruolo, attivo)
    VALUES (${sqlString(email.toLowerCase())}, ${sqlString(nome)}, ${sqlString(hash)}, ${sqlString(ruolo)}, 1)
    ON CONFLICT(email) DO UPDATE SET
      nome = excluded.nome,
      password_hash = excluded.password_hash,
      ruolo = excluded.ruolo,
      attivo = 1;
  `;
  runD1Sql(sql, isRemote);
  console.log(`Utente '${email}' (${ruolo}) creato o aggiornato con successo.`);
} else if (command === 'seed') {
  const adminHash = await hashPassword('AdminBarbatelle2026!');
  const commHash = await hashPassword('CommBarbatelle2026!');
  const socioHash = await hashPassword('SocioBarbatelle2026!');

  const sql = `
    -- 1. Varietà viticole ufficiali
    INSERT OR IGNORE INTO varieta (id, nome, attiva) VALUES
      (1, 'Sangiovese', 1),
      (2, 'Vermentino', 1),
      (3, 'Trebbiano Romagnolo', 1),
      (4, 'Albana', 1),
      (5, 'Chardonnay', 1),
      (6, 'Merlot', 1);

    -- 2. Cloni vincolati per Varietà
    INSERT OR IGNORE INTO cloni (id, varieta_id, codice, attivo) VALUES
      (1, 1, 'F9', 1),
      (2, 1, 'R24', 1),
      (3, 1, 'VCR 4', 1),
      (4, 1, 'BF 30', 1),
      (5, 2, 'VCR 1', 1),
      (6, 2, 'ICV 20', 1),
      (7, 3, 'TR 3T', 1),
      (8, 3, 'CAB 1', 1),
      (9, 4, 'AR 12', 1),
      (10, 5, 'R8', 1),
      (11, 5, 'SMA 127', 1),
      (12, 6, 'R3', 1),
      (13, 6, 'VCR 101', 1);

    -- 3. Portainnesti ufficiali
    INSERT OR IGNORE INTO portainnesti (id, codice, descrizione, attivo) VALUES
      (1, '1103P', 'Paulsen 1103 - vigoroso, resistente alla siccità', 1),
      (2, 'SO4', 'Selection Oppenheim 4 - terreni freschi e fertili', 1),
      (3, 'K5BB', 'Kober 5BB - elevata vigoria, tollera calcare', 1),
      (4, '420A', 'Millardet et de Grasset 420A - vigoria contenuta', 1),
      (5, '140Ru', 'Ruggeri 140 - altissima resistenza a siccità e calcare', 1);

    -- 4. Soci Produttori della Cooperativa
    INSERT OR IGNORE INTO soci (id, nome, note, attivo) VALUES
      (1, 'Az. Agr. Rossi Giuseppe', 'Socio fondatore - vivaio Faenza', 1),
      (2, 'Vivai Bianchi & Figli', 'Socio produttore - zona Forlì', 1),
      (3, 'Soc. Agr. Verde Vite', 'Socio produttore - zona Ravenna', 1),
      (4, 'Acquisto Terzi (Extra-Coop)', 'Fornitore esterno per copertura scoperti', 1);

    -- 5. Account nominativi per i 3 ruoli
    INSERT INTO utenti (id, email, nome, password_hash, ruolo, socio_id, attivo) VALUES
      (1, 'admin@cooperativa.it', 'Federico Mori (Amministrazione)', ${sqlString(adminHash)}, 'admin', NULL, 1),
      (2, 'commerciale@cooperativa.it', 'Marco (Commerciale)', ${sqlString(commHash)}, 'commerciale', NULL, 1),
      (3, 'rossi@cooperativa.it', 'Giuseppe Rossi (Socio Produttore)', ${sqlString(socioHash)}, 'produttore', 1, 1)
    ON CONFLICT(email) DO UPDATE SET
      password_hash = excluded.password_hash,
      ruolo = excluded.ruolo,
      nome = excluded.nome;

    -- 6. Conferimenti lotti di esempio
    DELETE FROM conferimenti_lotti;
    INSERT INTO conferimenti_lotti (socio_id, varieta_id, clone_id, portainnesto_id, codice_lotto, quantita_conferita, data_conferimento, note) VALUES
      (1, 1, 1, 1, 'LOT-2026-001', 5000, '2026-10-15', 'Primo conferimento Sangiovese F9 su 1103P'),
      (2, 1, 1, 1, 'LOT-2026-002', 3000, '2026-10-18', 'Secondo lotto Sangiovese F9 su 1103P'),
      (1, 1, 2, 2, 'LOT-2026-003', 4500, '2026-10-20', 'Sangiovese R24 su SO4'),
      (3, 2, 5, 1, 'LOT-2026-004', 6000, '2026-10-21', 'Vermentino VCR 1 su 1103P'),
      (2, 3, 7, 3, 'LOT-2026-005', 2500, '2026-10-22', 'Trebbiano TR 3T su K5BB'),
      (3, 5, 10, 2, 'LOT-2026-006', 1500, '2026-10-24', 'Chardonnay R8 su SO4');

    -- 7. Ordini clienti di esempio (con spedizione parziale e con scoperto per i soci)
    DELETE FROM righe_ordine;
    DELETE FROM ordini_clienti;
    INSERT INTO ordini_clienti (id, cliente_nome, stato, data_ordine, note) VALUES
      (1, 'Tenuta Colli Romagnoli', 'parzialmente_spedito', '2026-10-25', 'Consegna prima tranche effettuata'),
      (2, 'Cantina Sociale Val di Lamone', 'confermato', '2026-10-26', 'Da consegnare entro novembre'),
      (3, 'Podere San Martino', 'confermato', '2026-10-27', 'Ordine con varietà da coprire coi soci');

    INSERT INTO righe_ordine (ordine_id, varieta_id, clone_id, portainnesto_id, quantita_ordinata, quantita_spedita) VALUES
      -- Sangiovese F9 / 1103P: Prodotto 8000, Ordinato 5500 (3500 + 2000), Spedito 2000 -> Disponibile Virtuale 2500
      (1, 1, 1, 1, 3500, 2000),
      (2, 1, 1, 1, 2000, 0),
      -- Sangiovese R24 / SO4: Prodotto 4500, Ordinato 4500, Spedito 4500 -> Disponibile Virtuale 0 (Esaurito)
      (1, 1, 2, 2, 4500, 4500),
      -- Vermentino VCR 1 / 1103P: Prodotto 6000, Ordinato 2000, Spedito 0 -> Disponibile Virtuale 4000
      (2, 2, 5, 1, 2000, 0),
      -- Chardonnay R8 / SO4: Prodotto 1500, Ordinato 4000 -> FABBISOGNO SCOPERTO = 2500 per i Soci!
      (3, 5, 10, 2, 4000, 0),
      -- Merlot R3 / 1103P: Prodotto 0, Ordinato 1800 -> FABBISOGNO SCOPERTO = 1800 per i Soci!
      (3, 6, 12, 1, 1800, 0);
  `;

  runD1Sql(sql, isRemote);
  console.log('Seed Cooperativa Barbatelle completato con successo!');
} else {
  console.error('Comando non riconosciuto. Usa "seed" oppure "user".');
  process.exit(1);
}

