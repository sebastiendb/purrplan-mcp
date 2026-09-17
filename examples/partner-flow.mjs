/**
 * Parcours partenaire, de bout en bout.
 *
 *   PURRPLAN_PARTNER_SECRET=… node examples/partner-flow.mjs
 *
 * Le secret crée le client. Le jeton rendu programme et demande le lien
 * Facebook. Rien ici n'ouvre l'interface PurrPlan.
 *
 * La vérification de signature en bas rejoue ce que le serveur fait :
 * HMAC-SHA256 du corps JSON, en-tête X-Signature, slashs échappés
 * comme le json_encode de PHP. Elle n'appelle pas le réseau.
 */

const BASE = "https://app.purrplan.ai";
const secret = process.env.PURRPLAN_PARTNER_SECRET;
const stamp = Date.now();

if (!secret) {
  console.error("PURRPLAN_PARTNER_SECRET manquant.");
  process.exit(1);
}

const created = await post("/api/partner/clients", {
  headers: { "X-Partner-Secret": secret },
  body: {
    name: "Client démo",
    email: `demo.${stamp}@example.com`,
    password: "Secret-client-1",
  },
});

if (created.status !== 201) {
  console.error("création refusée", created.status, created.json);
  process.exit(1);
}

const token = created.json.token;
const workspace = created.json.workspace_uuid;
console.log("client créé", workspace);

const listed = await post("/api/mcp", {
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/json, text/event-stream",
  },
  body: {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "list_workspaces", arguments: {} },
  },
});
console.log("workspaces", listed.status, listed.text.includes(workspace));

const link = await post("/api/partner/connect-link", {
  headers: { Authorization: `Bearer ${token}` },
  body: {
    workspace_uuid: workspace,
    provider: "facebook",
    return_url: "https://example.com/purrplan/connected",
  },
});
console.log("lien Facebook", link.status, link.json.url ?? link.json.message);

const refused = await post("/api/partner/connect-link", {
  headers: { Authorization: `Bearer ${token}` },
  body: {
    workspace_uuid: workspace,
    provider: "facebook",
    return_url: "http://127.0.0.1/cb",
  },
});
console.log("URL privée refusée", refused.status === 422);

// Même calcul que TriggerWebhook : hash_hmac('sha256', json_encode($data), $secret).
// PHP échappe les slashs. Un JSON.stringify nu ne retombe pas sur ces octets.
const sample = JSON.stringify({
  event: "post.published",
  data: { uuid: "post-1", status: "published", url: "https://app.purrplan.ai/posts/post-1" },
}).replaceAll("/", "\\/");
const { createHmac } = await import("node:crypto");
const signature = createHmac("sha256", "whsec-demo").update(sample).digest("hex");
const { verifyWebhookSignature } = await import("../src/webhook.ts");
console.log(
  "signature",
  verifyWebhookSignature({ rawBody: sample, signature, secret: "whsec-demo" }),
);

async function post(path, { headers, body }) {
  const response = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  return { status: response.status, json, text };
}
