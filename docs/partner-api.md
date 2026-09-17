# API partenaire

Quatre appels, dans cet ordre. Vous créez le client, vous rangez le jeton, vous programmez avec, vous lui faites rattacher un réseau, puis vous vérifiez qu'un post est bien parti.

Base : `https://app.purrplan.ai`. Le client ne se connecte pas à l'interface.

Deux secrets. Ne les mélangez pas.

| Secret | Qui l'a | Sert à |
|---|---|---|
| `X-Partner-Secret` | Vous, une seule fois | Créer un client |
| Jeton `Bearer` | Un par client, rendu à la création | Programmer, demander un lien de connexion |

Le secret partenaire ne programme rien. Le jeton client ne crée pas d'autres clients. Ne collez jamais le secret dans un exemple que vous committez : une variable d'environnement suffit.

Le secret n'est pas public. S'il n'est pas encore posé côté PurrPlan, l'étape 1 répond `401` pour tout le monde.

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

`201` — gardez ces trois champs. Vous ne les reverrez pas ensemble.

```json
{
  "token": "1|le-jeton-en-clair-une-seule-fois",
  "workspace_uuid": "4abc6745-4415-475e-8c9b-0f11b95bdeb2",
  "password": "Un-mot-de-passe-solide-1",
  "user": { "name": "Atelier Nord", "email": "claire@atelier-nord.example" }
}
```

Le mot de passe en clair n'existe que dans cette réponse. Un appel plus tard ne le redonne pas, et ne le journalise pas. Le jeton s'appelle `[MCP] partner`, expire dans 90 jours, et porte toutes les portées connues : `read`, `write`, `ai`, `media`, `inbox:read`, `inbox:reply`, `analytics:read`.

Refus :

| Code | Quand | Corps |
|---|---|---|
| `401` | Secret absent, faux, ou pas encore posé | `{ "message": "Unauthorized." }` |
| `409` | Cet email a déjà un compte. Rien n'est créé : ni utilisateur, ni workspace, ni jeton | `{ "message": "Un compte existe déjà pour cette adresse.", "errors": { "email": ["Un compte existe déjà pour cette adresse."] } }` |
| `422` | Nom, email ou mot de passe refusé | `errors` par champ. Mot de passe : au moins 8 caractères |

## 2. Programmer avec ce jeton

Le jeton parle à `POST /api/mcp`. Pas à une autre route.

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

La réponse contient le `workspace_uuid` de l'étape 1.

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

Sans `scheduled_at`, le post reste un brouillon. Les 18 outils et leurs portées sont dans le [README](../README.md). Un jeton sans la portée demandée reçoit `Insufficient scopes`.

```js
import { createPurrPlanClient } from "@purrplan/mcp";

const client = createPurrPlanClient({ token: process.env.CLIENT_TOKEN });
const workspaces = await client.listWorkspaces();
```

Un jeton créé à la main, hors de cette API, se fait dans l'espace de travail : `https://app.purrplan.ai/{workspace_uuid}/api-mcp`. L'ancienne page profil `/app/mcp-integration` ne fait que rediriger là.

## 3. Rattacher un réseau

Vous ne remplacez pas l'adresse enregistrée chez Meta ou X. Le navigateur revient d'abord sur PurrPlan. PurrPlan envoie ensuite le visiteur sur l'URL que vous avez donnée pour cette tentative.

Le lien se demande avec le **jeton du client**, pas avec le secret partenaire.

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
  "url": "https://www.facebook.com/dialog/oauth?…&state=4abc6745-4415-475e-8c9b-0f11b95bdeb2",
  "provider": "facebook_page",
  "workspace_uuid": "4abc6745-4415-475e-8c9b-0f11b95bdeb2",
  "attempt": "f3c1…-uuid-de-la-tentative"
}
```

Ouvrez `url` dans le navigateur du client. `facebook` est un alias : la réponse dit `facebook_page`. Un nom inconnu (`facebook_page` est le bon nom, `facebok` non) répond `422` avec `Provider [facebok] not supported.` et aucun champ `url`.

L'URL de retour doit être publique, en `http` ou `https`, port 80 ou 443. Refusés avant tout lien : `127.0.0.1`, `localhost`, une IP privée, une IP de metadata, un nom interne d'un seul mot, un autre schéma, un autre port, un hôte absent, un hôte qui ne se résout pas. La réponse est `422`, sans champ `url` :

```json
{
  "message": "Cette URL pointe vers une adresse non publique.",
  "errors": { "return_url": ["Cette URL pointe vers une adresse non publique."] }
}
```

Les autres messages de ce champ : `URL invalide.`, `Seules les URL http et https sont acceptées.`, `URL sans nom d'hôte.`, `Seuls les ports 80 et 443 sont acceptés.`, `Nom d'hôte introuvable.`

Un `422` de validation (uuid mal formé, champ manquant) a la forme Laravel `{ "message", "errors": { champ: […] } }`. Un provider inconnu est un autre `422`, avec seulement `{ "message": "Provider [facebok] not supported." }` et pas de clé `errors`.

`403` et `{ "message": "Workspace inaccessible." }` si le jeton n'est pas membre du workspace demandé, ou si l'uuid n'existe pas. Un lien émis pour un workspace ne peut pas attacher le compte à un autre : le `state` OAuth est l'uuid de ce workspace, et le réseau le renvoie tel quel.

### Facebook : un arrêt de plus

Une Page Facebook ne s'attache pas au premier retour. PurrPlan affiche le choix de la page. Une fois la page choisie et attachée, le navigateur part vers votre URL et la tentative est consommée.

Avant cet attachement, un quota, un jeton pas encore échangé, ou une liste de pages vide prévient et **ne** consomme **pas** la tentative : un second essai revient encore chez vous. Ce n'est pas le cas d'un attachement réussi : là, la tentative est brûlée, et un retour suivant ne repart plus vers votre URL.

Les réseaux sans cet écran reviennent directement après le consentement.

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

La tentative vit 30 minutes, une par workspace. Une nouvelle demande remplace la précédente. Au-delà de 30 minutes, le retour ne part plus vers votre URL.

Le client doit être connecté à PurrPlan dans ce navigateur au moment du retour. Le premier passage par le lien de connexion le fait. Sans session, PurrPlan le renvoie vers sa page de login avant de lire le `state`.

## 4. Savoir qu'un post est parti

Ce n'est pas l'API partenaire. Dans l'espace de travail, page **Webhooks** (`/{workspace}/webhooks`, admin seulement), vous déclarez une URL publique et les événements. PurrPlan poste ce JSON :

```json
{
  "event": "post.published",
  "data": {
    "id": 42,
    "uuid": "post-uuid",
    "status": "published",
    "accounts": [],
    "versions": [],
    "tags": [],
    "user": { "name": "Atelier Nord" },
    "scheduled_at": "2026-09-20 08:00:00",
    "published_at": "2026-09-20 08:00:04",
    "created_at": "2026-09-18 10:00:00",
    "trashed": false
  }
}
```

Pour `post.scheduled`, `post.published` et `post.publishing_failed`, `data` est toute la fiche : `id`, `uuid`, `status`, `accounts`, `versions`, `tags`, `user` (`name` seulement), `scheduled_at`, `published_at`, `created_at`, `trashed`. Ne matchez pas un sous-ensemble : un champ en plus n'est pas une livraison invalide.

`post.deleted` n'envoie pas cette fiche. Une suppression peut en concerner plusieurs :

```json
{
  "event": "post.deleted",
  "data": { "uuids": ["post-uuid"], "deleted": true }
}
```

Mise à la corbeille : `{ "uuids": ["post-uuid"], "to_trash": true }`. Les deux drapeaux ne sont pas envoyés ensemble. `deleted` est absent quand `to_trash` est vrai, et l'inverse.

`account.added` et `account.updated` envoient la fiche compte, pas seulement un uuid : `id`, `uuid`, `name`, `username`, `image`, `provider`, `data`, `authorized`, `created_at`. `account.deleted` ne porte que `{ "uuid" }`.

| Nom | Quand |
|---|---|
| `post.scheduled` | Un post vient d'être programmé |
| `post.published` | Il est en ligne |
| `post.publishing_failed` | Le réseau a refusé |
| `post.deleted` | Un ou plusieurs posts ont été supprimés ou mis à la corbeille. `data` = `{ uuids, deleted? , to_trash? }`, pas la fiche. |
| `account.added` | Un compte vient d'être attaché |
| `account.updated` | Un compte a changé |
| `account.deleted` | Un compte a été retiré |

Répondez `200`, `201` ou `202`. Tout autre code est un échec, visible dans l'historique de livraison du workspace.

Si vous avez posé un secret sur le webhook, l'en-tête `X-Signature` est le HMAC-SHA256 hexadécimal du corps JSON, calculé avec ce secret. Sans secret, l'en-tête est absent : ne traitez pas ça comme une livraison signée.

Le serveur signe `json_encode` de PHP, donc les slashs sont échappés (`https:\/\/…`). Vérifiez le corps brut reçu. Un JSON que vous ré-encodez ne retombe pas sur les mêmes octets.

```js
import { verifyWebhookSignature } from "@purrplan/mcp/webhook";

const ok = verifyWebhookSignature({
  rawBody: request.rawBody,
  signature: request.headers["x-signature"],
  secret: process.env.WEBHOOK_SECRET,
});
```

L'exemple commenté est dans [examples/partner-flow.mjs](../examples/partner-flow.mjs). Il signe le même corps que le serveur, slashs échappés compris, et le fait passer par `verifyWebhookSignature`.
