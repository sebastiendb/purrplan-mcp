/**
 * PurrPlan — squelette d'intégration partenaire.
 *
 * Un serveur Node sans aucune dépendance (Node 18+). Il fait exactement ce
 * qu'une agence doit faire, et rien d'autre :
 *
 *   1. créer un client PurrPlan et garder ses jetons ;
 *   2. demander un lien de connexion de réseau social, avec retour chez SOI ;
 *   3. lister les comptes réellement connectés ;
 *   4. programmer une publication ;
 *   5. recevoir les webhooks et vérifier leur signature.
 *
 * ⚠️ Les jetons et le secret partenaire ne quittent JAMAIS ce serveur. Le
 * navigateur ne parle qu'à lui. C'est pour cela que tout passe par /api/*
 * au lieu d'appeler PurrPlan directement depuis la page.
 *
 *   node server.js
 */

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const PURRPLAN = process.env.PURRPLAN_BASE_URL ?? 'https://app.purrplan.ai';
const PARTNER_SECRET = process.env.PURRPLAN_PARTNER_SECRET ?? '';
const WEBHOOK_SECRET = process.env.PURRPLAN_WEBHOOK_SECRET ?? 'changez-moi';
const PORT = Number(process.env.PORT ?? 4321);

// L'URL sur laquelle PurrPlan renvoie le client après l'autorisation. En
// développement, exposez ce port par un tunnel https : PurrPlan refuse toute
// URL de retour non publique (protection anti-SSRF), donc « localhost » ne
// marchera pas.
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;

const DB_FILE = join(HERE, 'clients.json');

/* ─────────────────────────── stockage jouet ─────────────────────────── */
// Une vraie intégration met ça en base, avec les jetons chiffrés au repos.

async function loadClients() {
  try {
    return JSON.parse(await readFile(DB_FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function saveClients(clients) {
  await writeFile(DB_FILE, JSON.stringify(clients, null, 2));
}

const events = []; // journal des webhooks reçus, pour la démo

/* ───────────────────────────── appels API ───────────────────────────── */

async function purrplan(path, { method = 'GET', token, partnerSecret, body, raw } = {}) {
  const headers = {};

  if (token) headers.Authorization = `Bearer ${token}`;
  if (partnerSecret) headers['X-Partner-Secret'] = partnerSecret;
  if (body && !raw) headers['Content-Type'] = 'application/json';
  headers.Accept = 'application/json';

  const response = await fetch(`${PURRPLAN}${path}`, {
    method,
    headers,
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text.slice(0, 300) };
  }

  if (!response.ok) {
    const error = new Error(payload?.message ?? `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

/* ─────────────────────────────── routes ─────────────────────────────── */

const routes = {
  /** Liste des clients de l'agence, sans les jetons. */
  'GET /api/clients': async () => {
    const clients = await loadClients();

    return clients.map(({ token, apiToken, password, ...safe }) => safe);
  },

  /** 1. Créer un client PurrPlan. */
  'POST /api/clients': async (body) => {
    if (!PARTNER_SECRET) {
      throw Object.assign(new Error('PURRPLAN_PARTNER_SECRET manquant.'), { status: 500 });
    }

    const created = await purrplan('/api/partner/clients', {
      method: 'POST',
      partnerSecret: PARTNER_SECRET,
      body: {
        name: body.name,
        email: body.email,
        // Le client ne s'en servira pas : le parcours de connexion passe par
        // un lien signé. On le garde seulement pour pouvoir, un jour, lui
        // ouvrir l'interface PurrPlan en direct.
        password: body.password ?? randomPassword(),
      },
    });

    const clients = await loadClients();

    clients.push({
      name: body.name,
      email: body.email,
      workspaceUuid: created.workspace_uuid,
      token: created.token,           // MCP + connect-link
      apiToken: created.api_token,    // API REST
      expiresAt: created.expires_at,
      password: created.password,
    });

    await saveClients(clients);

    return { workspace_uuid: created.workspace_uuid, expires_at: created.expires_at };
  },

  /** 2. Renouveler les jetons avant les 90 jours. */
  'POST /api/clients/rotate': async (body) => {
    const clients = await loadClients();
    const client = find(clients, body.workspace_uuid);

    const rotated = await purrplan(`/api/partner/clients/${client.workspaceUuid}/tokens`, {
      method: 'POST',
      partnerSecret: PARTNER_SECRET,
    });

    // Les anciens jetons sont déjà révoqués côté PurrPlan : on remplace les
    // deux d'un bloc, jamais un seul.
    client.token = rotated.token;
    client.apiToken = rotated.api_token;
    client.expiresAt = rotated.expires_at;

    await saveClients(clients);

    return { expires_at: rotated.expires_at };
  },

  /** 3. Demander le lien de connexion d'un réseau. */
  'POST /api/connect-link': async (body) => {
    const clients = await loadClients();
    const client = find(clients, body.workspace_uuid);

    const link = await purrplan('/api/partner/connect-link', {
      method: 'POST',
      token: client.token, // le jeton MCP du client, PAS le secret partenaire
      body: {
        workspace_uuid: client.workspaceUuid,
        provider: body.provider,
        // Le retour se fait chez NOUS. `workspace` nous permet de recoller le
        // retour au bon client ; `attempt` nous est rendu par PurrPlan.
        return_url: `${PUBLIC_URL}/retour?workspace=${client.workspaceUuid}`,
        ...(body.extra ? { extra: body.extra } : {}),
      },
    });

    return link;
  },

  /** 4. Les comptes réellement connectés — la seule vérité. */
  'GET /api/accounts': async (_body, url) => {
    const clients = await loadClients();
    const client = find(clients, url.searchParams.get('workspace_uuid'));

    const accounts = await purrplan(`/app/api/${client.workspaceUuid}/accounts`, {
      token: client.apiToken, // API REST → jeton REST
    });

    return accounts;
  },

  /** 5. Programmer une publication. */
  'POST /api/posts': async (body) => {
    const clients = await loadClients();
    const client = find(clients, body.workspace_uuid);

    const accountIds = body.account_ids ?? [];

    const payload = {
      accounts: accountIds,
      date: body.date,
      time: body.time,
      timezone: body.timezone ?? 'Europe/Paris',
      schedule: Boolean(body.date && body.time),
      versions: [
        {
          account_id: 0,        // 0 = la version commune à tous les comptes
          is_original: true,
          content: [{ body: body.text, media: [] }],
        },
      ],
    };

    // On valide AVANT de programmer : même source de vérité que la
    // programmation, donc ce qui passe ici passera ensuite.
    await purrplan(`/app/api/${client.workspaceUuid}/posts/validate`, {
      method: 'POST',
      token: client.apiToken,
      body: payload,
    });

    return purrplan(`/app/api/${client.workspaceUuid}/posts`, {
      method: 'POST',
      token: client.apiToken,
      body: payload,
    });
  },

  /** 6. Poser le webhook de ce client, par API. */
  'POST /api/webhooks': async (body) => {
    const clients = await loadClients();
    const client = find(clients, body.workspace_uuid);

    return purrplan(`/app/api/${client.workspaceUuid}/webhooks`, {
      method: 'POST',
      token: client.apiToken,
      body: {
        callback_url: `${PUBLIC_URL}/purrplan/hook`,
        events: body.events ?? [
          'post.published',
          'post.publishing_failed',
          'account.added',
          'account.deleted',
        ],
        secret: WEBHOOK_SECRET,
      },
    });
  },

  'GET /api/events': async () => events.slice(-30).reverse(),
};

function find(clients, workspaceUuid) {
  const client = clients.find((c) => c.workspaceUuid === workspaceUuid);

  if (!client) {
    throw Object.assign(new Error('Client inconnu.'), { status: 404 });
  }

  return client;
}

function randomPassword() {
  return `Pp-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ──────────────────────── vérification webhook ──────────────────────── */

/**
 * Le serveur signe les octets qu'il a envoyés. PHP échappe les slashs dans
 * son JSON (`https:\/\/…`) : si vous ré-encodez l'objet parsé, vous ne
 * retombez pas sur les mêmes octets et la signature semble fausse. On vérifie
 * donc TOUJOURS le corps brut.
 */
function signatureIsValid(rawBody, signature, secret) {
  if (!signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');

  return a.length === b.length && timingSafeEqual(a, b);
}

/* ──────────────────────────────── HTTP ──────────────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = `${req.method} ${url.pathname}`;

  // Webhook entrant.
  if (key === 'POST /purrplan/hook') {
    const rawBody = await readBody(req);
    const valid = signatureIsValid(rawBody, req.headers['x-signature'], WEBHOOK_SECRET);

    // Un webhook mal signé se refuse. Le journaliser « pour voir » revient à
    // laisser n'importe qui écrire dans votre produit.
    if (!valid) {
      res.writeHead(401).end('signature invalide');
      return;
    }

    events.push({ at: new Date().toISOString(), ...JSON.parse(rawBody || '{}') });
    res.writeHead(200).end('ok');
    return;
  }

  // Retour du parcours de connexion sociale.
  if (key === 'GET /retour') {
    res.writeHead(302, { Location: `/?${url.searchParams.toString()}` }).end();
    return;
  }

  if (routes[key]) {
    try {
      const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : null;
      const result = await routes[key](body, url);

      json(res, 200, result);
    } catch (error) {
      json(res, error.status ?? 500, {
        message: error.message,
        details: error.payload ?? null,
      });
    }
    return;
  }

  // Fichiers statiques.
  const file = url.pathname === '/' ? '/index.html' : url.pathname;

  try {
    const content = await readFile(join(HERE, 'public', file));

    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload ?? null);

  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

server.listen(PORT, () => {
  console.log(`\n  Console agence   →  http://localhost:${PORT}`);
  console.log(`  PurrPlan         →  ${PURRPLAN}`);
  console.log(`  URL de retour    →  ${PUBLIC_URL}/retour`);

  if (!PARTNER_SECRET) {
    console.log('\n  ⚠️  PURRPLAN_PARTNER_SECRET absent : la création de client échouera.');
  }

  if (PUBLIC_URL.includes('localhost')) {
    console.log("\n  ⚠️  PUBLIC_URL pointe sur localhost : PurrPlan refusera l'URL de retour.");
    console.log('      Exposez ce port en https (tunnel) et relancez avec PUBLIC_URL=…\n');
  }
});
