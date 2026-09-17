# API partenaire

Pour un outil qui crée les comptes PurrPlan à la place de ses clients. Le client ne se connecte pas à l'interface. Vous gardez le jeton, vous programmez avec le MCP, vous lui faites rattacher ses réseaux depuis votre propre écran.

Base : `https://app.purrplan.ai`

Deux secrets, deux rôles. Ne les mélangez pas.

| Secret | Qui l'a | À quoi il sert |
|---|---|---|
| `X-Partner-Secret` | Vous, une seule fois | Créer un client |
| Jeton `Bearer` | Un par client, rendu à la création | MCP, programmation, lien de connexion |

Le secret partenaire ne programme rien. Le jeton client ne crée pas d'autres clients.

## 1. Créer un client

```bash
curl -sS -X POST https://app.purrplan.ai/api/partner/clients \
  -H "Content-Type: application/json" \
  -H "X-Partner-Secret: $PURRPLAN_PARTNER_SECRET" \
  -d '{
    "name": "Atelier Nord",
    "email": "claire@atelier-nord.example",
    "password": "Un-mot-de-passe-solide-1"
  }'
```

`201` :

```json
{
  "token": "1|le-jeton-en-clair-une-seule-fois",
  "workspace_uuid": "4abc6745-4415-475e-8c9b-0f11b95bdeb2",
  "password": "Un-mot-de-passe-solide-1",
  "user": { "name": "Atelier Nord", "email": "claire@atelier-nord.example" }
}
```

Enregistrez `token` et `workspace_uuid` de votre côté. Le mot de passe n'est renvoyé qu'ici. Un appel plus tard ne le redonne pas.

Le même email une seconde fois répond `409` et ne crée ni utilisateur, ni workspace, ni jeton :

```json
{
  "message": "Un compte existe déjà pour cette adresse.",
  "errors": { "email": ["Un compte existe déjà pour cette adresse."] }
}
```

`401` : secret absent, faux, ou pas encore posé côté PurrPlan. `422` : email invalide, ou mot de passe trop court (8 caractères, majuscule, minuscule, chiffre).

## 2. Programmer avec ce jeton

Le jeton est un jeton MCP. Il s'utilise sur `POST /api/mcp`, pas sur une autre route.

```bash
curl -sS -X POST https://app.purrplan.ai/api/mcp \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": { "name": "list_workspaces", "arguments": {} }
  }'
```

La réponse contient le `workspace_uuid` créé à l'étape 1.

Pour poser un post, prenez d'abord les `id` numériques dans `list_accounts`, puis :

```bash
curl -sS -X POST https://app.purrplan.ai/api/mcp \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "create_draft_post",
      "arguments": {
        "workspace_uuid": "'"$WORKSPACE_UUID"'",
        "account_ids": [12],
        "content": "Ouverture samedi, 10 h.",
        "scheduled_at": "2026-09-20T08:00:00Z"
      }
    }
  }'
```

Sans `scheduled_at`, le post reste un brouillon. Les 18 outils sont dans le [README](../README.md).

En JavaScript, le client de ce dépôt fait le même appel :

```js
import { createPurrPlanClient } from "@purrplan/mcp";

const client = createPurrPlanClient({ token: process.env.CLIENT_TOKEN });
const workspaces = await client.listWorkspaces();
```

## 3. Rattacher un réseau

Vous ne remplacez pas l'adresse enregistrée chez Meta, X ou les autres. Le navigateur revient d'abord sur PurrPlan. PurrPlan envoie ensuite le visiteur sur l'URL que vous avez donnée pour cette tentative.

```bash
curl -sS -X POST https://app.purrplan.ai/api/partner/connect-link \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_uuid": "'"$WORKSPACE_UUID"'",
    "provider": "facebook",
    "return_url": "https://outil.example/purrplan/connected"
  }'
```

`200` :

```json
{
  "url": "https://www.facebook.com/v19.0/dialog/oauth?client_id=…&state=4abc6745-4415-475e-8c9b-0f11b95bdeb2",
  "provider": "facebook_page",
  "workspace_uuid": "4abc6745-4415-475e-8c9b-0f11b95bdeb2",
  "attempt": "f3c1…-uuid-de-la-tentative"
}
```

Ouvrez `url` dans le navigateur du client. `facebook` est un alias de `facebook_page`. Les autres providers utilisent leur nom PurrPlan (`instagram`, `linkedin`, `tiktok`, …).

L'URL de retour doit être publique, en `http` ou `https`, port 80 ou 443. Sont refusés avant tout lien : `127.0.0.1`, `localhost`, une IP privée, une IP de metadata, un nom interne d'un seul mot, un autre schéma, un autre port. Réponse : `422`, pas de champ `url`.

`403` si ce jeton n'est pas membre du workspace demandé. Un lien émis pour un workspace ne peut pas attacher le compte à un autre : le `state` OAuth est l'uuid de ce workspace, et Meta le renvoie tel quel.

### Facebook : un arrêt de plus

Une Page Facebook ne s'attache pas au premier retour. PurrPlan doit afficher le choix de la page. Une fois la page choisie, le navigateur part vers votre URL. Une erreur récupérable sur cette liste (quota, jeton pas encore bon, liste vide) vous prévient, mais ne brûle pas la tentative : le choix qui suit revient encore chez vous.

Les réseaux qui n'ont pas cet écran de choix reviennent directement après le consentement.

### Ce que vous recevez

```
https://outil.example/purrplan/connected?status=success&attempt=f3c1…
https://outil.example/purrplan/connected?status=error&attempt=f3c1…&error=access_denied
```

| Paramètre | Sens |
|---|---|
| `status` | `success` ou `error` |
| `attempt` | L'uuid rendu avec le lien. C'est lui qui rattache ce retour à votre demande. |
| `error` | Présent seulement en erreur. Message du réseau, ou message PurrPlan. |

La tentative vit 30 minutes. Au-delà, le retour ne part plus vers votre URL.

Le client doit être connecté à PurrPlan dans ce navigateur au moment du retour. Le premier passage par le lien de connexion le fait. Sans session, PurrPlan le renvoie vers sa page de login avant de lire le `state`.

## 4. Savoir qu'un post est parti

Ce n'est pas l'API partenaire. Dans le workspace, page **Webhooks**, vous déclarez une URL publique et les événements. PurrPlan poste ce JSON :

```json
{
  "event": "post.published",
  "data": {
    "uuid": "post-uuid",
    "status": "published",
    "accounts": [],
    "versions": [],
    "scheduled_at": "2026-09-20 08:00:00",
    "published_at": "2026-09-20 08:00:04"
  }
}
```

`data` est la fiche du post (`id`, `uuid`, `status`, `accounts`, `versions`, `tags`, `scheduled_at`, `published_at`) sauf pour `account.deleted`, qui ne porte que `{ "uuid" }`.

Événements :

| Nom | Quand |
|---|---|
| `post.scheduled` | Un post vient d'être programmé |
| `post.published` | Il est en ligne |
| `post.publishing_failed` | Le réseau a refusé |
| `post.deleted` | Il a été supprimé |
| `account.added` | Un compte vient d'être attaché |
| `account.updated` | Un compte a changé |
| `account.deleted` | Un compte a été retiré |

Répondez `200`, `201` ou `202`. Tout autre code est un échec, visible dans l'historique de livraison du workspace.

Si vous avez posé un secret sur le webhook, le corps est signé. L'en-tête `X-Signature` est le HMAC-SHA256 hexadécimal du corps JSON, calculé avec ce secret. Sans secret, l'en-tête est absent : ne traitez pas ça comme une livraison signée.

Le serveur signe avec `json_encode` de PHP (slashs échappés). Vérifiez le corps brut reçu, pas un JSON que vous avez ré-encodé.

```js
import { verifyWebhookSignature } from "@purrplan/mcp/webhook";

const ok = verifyWebhookSignature({
  rawBody: request.rawBody,          // le corps, octet pour octet
  signature: request.headers["x-signature"],
  secret: process.env.WEBHOOK_SECRET,
});
```

L'exemple commenté est dans [examples/partner-flow.mjs](../examples/partner-flow.mjs).
