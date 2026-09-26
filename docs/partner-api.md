# API partenaire — construire son produit au-dessus de PurrPlan

> Pour une agence ou un éditeur qui veut gérer les réseaux sociaux de SES clients
> depuis SA propre interface. Le client final n'ouvre jamais PurrPlan, ne crée
> jamais de compte, ne voit jamais notre marque.

Trois choses à comprendre avant de coder, et tout le reste en découle.

### 1. Un client = un espace de travail

Vous appelez `POST /api/partner/clients`. PurrPlan crée le compte, son espace de
travail, et vous rend les jetons. Vous stockez `workspace_uuid` à côté de votre
propre client en base. C'est votre seule clé de correspondance.

### 2. Deux jetons, deux surfaces — ils ne sont pas interchangeables

| Jeton | Ouvre | Refusé sur |
|---|---|---|
| `api_token` | l'**API REST** `https://app.purrplan.ai/app/api` | l'endpoint MCP (liste d'outils vide) |
| `token` | l'**endpoint MCP** `https://app.purrplan.ai/api/mcp` et `connect-link` | l'API REST (403) |

Ce n'est pas une maladresse, c'est la garantie centrale : vous pouvez confier le
jeton MCP à un agent IA — le vôtre, ou celui de votre client — sans lui ouvrir la
suppression de comptes. **Utilisez `api_token` pour votre produit, `token` pour
les agents.**

### 3. Connecter un réseau se fait par un lien, pas par un appel

Aucune API ne peut « ajouter un compte Instagram » : Meta, Google et LinkedIn
exigent que la personne autorise elle-même, dans un navigateur. Vous demandez donc
un **lien** à PurrPlan, vous le présentez à votre client, et PurrPlan vous le
renvoie à l'adresse que vous avez choisie.

---

## Prérequis

Un secret partenaire, délivré par PurrPlan. Il ne quitte jamais votre serveur :
il sert à créer vos clients, les lister et renouveler leurs jetons.

Ce secret ne fait pas qu'ouvrir la porte, il **dit qui entre** : c'est lui qui
identifie votre agence, et donc de qui vos clients héritent leurs droits.

```
X-Partner-Secret: <votre secret>
```

Base URL : `https://app.purrplan.ai`

---

## 1. Créer un client

```http
POST /api/partner/clients
X-Partner-Secret: <secret>
Content-Type: application/json

{ "name": "Atelier Nord", "email": "contact@ateliernord.fr", "password": "…" }
```

```json
{
  "created":        true,
  "token":          "…",      // MCP + connect-link
  "api_token":      "…",      // API REST
  "expires_at":     "2026-12-20T09:12:44+00:00",
  "workspace_uuid": "9f1c…",
  "password":       "…",      // celui que vous avez envoyé
  "user": { "name": "Atelier Nord", "email": "contact@ateliernord.fr" }
}
```

| Code | Signification |
|---|---|
| `201` | Créé. |
| `200` | **Ce client est déjà le vôtre** : rien n'a été créé, on vous rend son `workspace_uuid` et une paire de jetons neuve. `created: false`. Rejouez l'appel autant de fois que nécessaire. |
| `409` | Cette adresse a un compte PurrPlan qui n'est **pas** dans votre programme. Rien n'est créé. |
| `401` | Secret absent, faux, ou rattaché à aucune agence. |

> **Le `200` est votre filet.** En développant une intégration, on relance le
> même appel dix fois : vous récupérez l'espace au lieu de rester bloqué sur un
> refus. C'est aussi ainsi qu'on **rattache** un compte créé avant cette
> version — envoyez le mot de passe que vous aviez choisi, il fait preuve.

### Ce dont votre client hérite

Le compte créé **hérite de votre plan**. Vous avez payé : vos clients publient,
posent des webhooks et utilisent l'API sans qu'on leur propose d'essai ni
d'abonnement. Aucun écran de paiement PurrPlan ne leur sera jamais présenté.

Les limites (nombre de marques, de comptes sociaux, crédits IA) sont les
vôtres, partagées entre vos clients.

## 1 bis. Lister vos clients

```http
GET /api/partner/clients
X-Partner-Secret: <secret>
```

```json
{ "data": [
  { "workspace_uuid": "9f1c…", "name": "Atelier Nord",
    "email": "contact@ateliernord.fr", "created_at": "2026-09-21T14:02:11+00:00" }
] }
```

Chaque agence ne voit que ses propres clients, et ne peut agir que sur eux :
un `workspace_uuid` qui ne vous appartient pas répond `404`, jamais `403` — on
ne confirme pas son existence.

> Le mot de passe vous est rendu parce que vous l'avez choisi. Vous n'en avez
> besoin **que** si vous voulez, un jour, donner à ce client l'accès direct à
> l'interface PurrPlan. Le parcours normal ne l'utilise jamais.

> **Vos propres jetons**, pour votre espace à vous, se créent sans API : écran
> **API & MCP** de votre espace (`app.purrplan.ai/{workspace}/api-mcp`). Le
> formulaire demande d'abord le type — « Pour votre code (API REST) » ou « Pour
> un agent IA (MCP) ». C'est la même distinction qu'au § ci-dessus.

## 2. Renouveler les jetons

Les jetons vivent **90 jours**. Passé ce délai vos appels répondent `401`, sans
autre signal. Prévoyez la rotation dès maintenant — une tâche mensuelle suffit.

```http
POST /api/partner/clients/{workspace_uuid}/tokens
X-Partner-Secret: <secret>
```

Rend la même paire `token` / `api_token` / `expires_at`. **Les anciens jetons sont
révoqués immédiatement** : basculez vos enregistrements dans la même transaction.

## 3. Connecter un réseau social

### 3.1 Demander le lien

```http
POST /api/partner/connect-link
Authorization: Bearer <token>            ← le jeton MCP du CLIENT, pas le secret
Content-Type: application/json

{
  "workspace_uuid": "9f1c…",
  "provider":       "youtube",
  "return_url":     "https://votre-outil.fr/clients/42/reseaux"
}
```

```json
{
  "url":            "https://app.purrplan.ai/partner-connect/youtube/…?signature=…",
  "provider":       "youtube",
  "workspace_uuid": "9f1c…",
  "attempt":        "3b0e…",
  "expires_in":     1800
}
```

Vous redirigez votre client vers `url` (ou vous en faites un bouton). Il autorise
chez YouTube. PurrPlan enregistre le compte, puis le renvoie sur **votre**
`return_url`.

### 3.2 Le retour

```
https://votre-outil.fr/clients/42/reseaux?status=success&attempt=3b0e…
https://votre-outil.fr/clients/42/reseaux?status=error&attempt=3b0e…&error=…
```

`attempt` vous permet de recoller le retour à la demande que vous aviez lancée —
utile quand votre client connecte trois réseaux à la suite.

> **Ne vous fiez pas à `status=success` pour dire « c'est connecté ».**
> Appelez `GET /app/api/{workspace}/accounts` et regardez ce qui est réellement
> là. Un retour est un signal d'interface, pas un état.

### 3.3 Ce que vous pouvez passer

| Champ | Obligatoire | Remarque |
|---|---|---|
| `workspace_uuid` | oui | doit appartenir au porteur du jeton, sinon `403` |
| `provider` | oui | voir la liste ci-dessous |
| `return_url` | oui | **https public uniquement** — une IP privée, `localhost` ou un port exotique est refusé en `422` (protection anti-SSRF) |
| `extra.channel` | Telegram seulement | le canal dont `@purrplanbot` est administrateur |

### Instagram : deux chemins, choisissez le bon

| Provider | Passe par Facebook | Prérequis |
|---|---|---|
| **`instagram_direct`** | **non** | compte professionnel ou créateur |
| `instagram` | oui | compte pro/créateur **et** rattaché à une Page Facebook |

**Préférez `instagram_direct`.** L'autre chemin fait passer votre client par
l'écran d'autorisation de Meta, qui refuse net — « Vous ne pouvez pas vous
connecter avec ce compte » — si son Instagram n'est pas relié à une Page
Facebook. Ce refus a lieu chez Meta, avant de nous revenir : nous ne pouvons
ni l'anticiper ni l'expliquer à sa place.

Même logique pour Facebook : `facebook_page` connecte une **Page**, jamais un
profil personnel.

Réseaux : `facebook_page` (alias `facebook`), `instagram`, `instagram_direct`,
`threads`, `twitter` (alias `x`), `linkedin`, `linkedin_page`, `youtube`,
`google_business`, `pinterest`, `tiktok`, `bluesky`, `reddit`, `telegram`.
`mastodon` se connecte depuis l'interface PurrPlan : son protocole impose
d'enregistrer une application sur l'instance choisie avant même de savoir où
rediriger.

### 3.4 Les erreurs que vous verrez vraiment

| Code | Cause | Ce que vous faites |
|---|---|---|
| `403` | l'espace n'appartient pas au jeton | vous avez croisé deux clients |
| `422` + `supported_providers` | nom de réseau inconnu | corrigez le nom |
| `422` + `missing_field` | champ propre au réseau absent | demandez-le à votre client avant |
| `422` + `usage` | plafond de comptes du plan atteint | proposez une montée de plan |
| `401` | jeton expiré | § 2 |

### 3.5 Le lien est à usage unique

Il vaut ouverture de session pour votre client, pendant 30 minutes. Rejoué, il
renvoie chez vous avec `status=error&error=link_expired` — jamais sur un écran
PurrPlan. Ne le mettez ni en cache, ni dans un e-mail conservé.

## 4. Comment vos clients se connectent

C'est la question qui revient toujours, et la réponse tient en une phrase :
**vos clients ne se connectent pas à PurrPlan, ils se connectent à vous.**

```
votre client  ──►  votre interface  ──►  votre serveur  ──►  PurrPlan
  (son mot de       (votre design,        (porte le jeton     (ne le connaît
   passe à vous)     votre domaine)        du client)          jamais)
```

Vous gérez vos comptes, vos mots de passe, vos rôles — comme pour n'importe
quelle fonctionnalité de votre produit. PurrPlan ne sait rien de vos clients :
il sait qu'un jeton donné agit sur un espace de travail donné. La
correspondance « mon client n° 42 ↔ ce `workspace_uuid` » vit dans **votre**
base.

### La règle qui compte

**Le jeton ne descend jamais dans le navigateur.** Ni celui de 90 jours, ni un
jeton de session. Sur l'API REST, un jeton est tout ou rien : il n'y a pas de
portées. Un jeton exposé côté client, c'est la possibilité de supprimer les
publications et les comptes sociaux de votre client, depuis sa console
JavaScript.

Votre front appelle **vos** routes (`/api/clients/42/posts`), votre serveur
appelle PurrPlan. Le serveur d'exemple fourni ne fait rien d'autre.

### Le compte PurrPlan de votre client

`POST /api/partner/clients` en crée un, avec le mot de passe que vous
choisissez. **Vous n'avez pas à le lui transmettre** : il ne sert que si vous
décidez, un jour, de lui ouvrir l'interface PurrPlan en direct. Le parcours
normal ne l'utilise jamais — y compris la connexion des réseaux sociaux, qui
passe par le lien du § 3.

### Jetons de session, quand votre serveur n'est pas seul

Un traitement par lot, un worker, une fonction de bord : plutôt que d'y copier
le jeton de 90 jours, frappez un jeton court.

```http
POST /api/partner/session-token
X-Partner-Secret: <secret>

{ "workspace_uuid": "9f1c…", "ttl_minutes": 60, "label": "worker-nuit" }
```

```json
{ "token": "…", "token_id": 128, "workspace_uuid": "9f1c…",
  "expires_at": "2026-09-21T09:12:44+00:00" }
```

`ttl_minutes` va de 5 à 1440 (défaut : 60). Pour le révoquer avant l'heure —
fin de mission, incident :

```http
DELETE /api/partner/session-token/128
X-Partner-Secret: <secret>

{ "workspace_uuid": "9f1c…" }
```

> Un jeton de session n'a **pas moins de pouvoir** que le jeton maître,
> seulement moins de temps. Il réduit le rayon d'une fuite ; il ne rend pas le
> navigateur sûr.

### Et si un client veut vraiment entrer dans PurrPlan ?

Donnez-lui le mot de passe que vous aviez choisi à la création, ou faites-lui
utiliser « Mot de passe oublié » sur `app.purrplan.ai`. Il verra alors
l'interface PurrPlan, pas la vôtre — à réserver aux cas où c'est ce que vous
voulez.

## 5. Piloter le contenu — API REST

Base : `https://app.purrplan.ai/app/api` — `Authorization: Bearer <api_token>`.
Référence complète : [rest-api.md](./rest-api.md).

Le strict nécessaire pour un produit d'agence :

```http
GET    /app/api/workspaces                      → vos espaces
GET    /app/api/{workspace}/accounts            → comptes connectés + état d'autorisation
POST   /app/api/{workspace}/media               → envoi d'un fichier (multipart)
POST   /app/api/{workspace}/posts               → créer / programmer
GET    /app/api/{workspace}/posts?status=…      → suivre
DELETE /app/api/{workspace}/posts/{uuid}        → supprimer
```

## 6. Être prévenu — webhooks

Posez-les **par API**, sans passer par l'interface :

```http
POST /app/api/{workspace}/webhooks
Authorization: Bearer <api_token>

{
  "callback_url": "https://votre-outil.fr/purrplan/hook",
  "events": ["post.published", "post.publishing_failed", "account.added", "account.deleted"],
  "secret": "<votre secret HMAC>"
}
```

`GET …/webhooks/events` liste les événements disponibles — ne recopiez pas la
liste en dur, elle bouge. `PUT` accepte une mise à jour partielle
(`{"active": false}` suffit à couper un webhook). Le secret n'est jamais relu :
il s'écrit et se remplace.

### Ce que PurrPlan vous envoie

PurrPlan poste ce JSON :

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

Chaque livraison porte `workspace_uuid` à la racine, à côté de `event` et
`data` : c'est lui qui dit de quel client il s'agit, indépendamment de l'URL
que vous avez déclarée.

La charge utile de `post.published` est la fiche complète du post : elle
porte donc `published[]`, avec l'adresse publique de la publication sur chaque
réseau (`url`), et `failures[]` en cas de refus. C'est là qu'on récupère le
lien à montrer à son utilisateur.

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

---

## 7. Mesurer — statistiques et palmarès

Deux endpoints, avec le jeton REST du client :

```
GET /app/api/{workspace}/analytics?days=30
GET /app/api/{workspace}/analytics/top-posts?days=30&limit=10
```

Le détail des champs est dans [rest-api.md § Statistiques](./rest-api.md#statistiques).
Ce qui suit ne concerne que ce qui se déduit mal quand on construit une
interface au-dessus.

### Le palmarès liste des publications, pas des posts PurrPlan

`top-posts` renvoie ce qui a été **relevé chez les réseaux**, une entrée par
compte. Un contenu diffusé sur trois réseaux y apparaît donc en **trois
entrées**, chacune avec les métriques de son réseau — et non en une ligne
agrégée.

C'est voulu : les chiffres d'Instagram et ceux de LinkedIn ne s'additionnent
pas de façon comparable. Mais il faut pouvoir recomposer le contenu d'origine.

### `purrplan_post` — ce qui relie les entrées entre elles

Chaque entrée porte :

```json
"purrplan_post": { "id": 1102, "uuid": "0d0410cd-…" }
```

ou `null` si la publication n'est pas passée par PurrPlan (publiée à la main
sur le réseau, ou antérieure au compte).

**Deux entrées partageant ce même `uuid` sont le même contenu vu sur deux
réseaux.** Groupez dessus pour afficher un post et sa ventilation par
plateforme, chaque ligne gardant ses vraies métriques. L'`uuid` est celui que
renvoient déjà `GET /posts` et les webhooks : c'est la même clé partout.

### Ce qui est fiable, et ce qui ne l'est pas

| Champ | À savoir |
|---|---|
| `likes`, `comments`, `shares` | présents pour tous les réseaux qui les exposent |
| `views` | **`0` veut dire « non fourni »** sur LinkedIn et YouTube — affichez `—`, pas `0` |
| `engagement` | somme likes + commentaires + partages, jamais les vues |
| `provider`, `account` | le réseau et le compte de cette entrée précise |
| `url` | jamais inventée : absente quand le réseau ne donne pas de lien public |
| `clicks` | clics sur les liens tracés du post ; **`null`** si le suivi de liens est inactif — `null` et `0` ne veulent pas dire la même chose |

Trois comportements du classement lui-même :

- il **panache les réseaux** — le meilleur contenu de chacun d'abord, puis le
  reste par engagement. Ce n'est pas un tri brut, ne le présentez pas comme
  un « top 10 » strict ;
- les **republications** sont écartées ;
- les publications **sans aucune métrique** sont écartées (une ligne à zéro
  partout n'apprend rien et occupe une place).

### Quand les chiffres ne sont pas encore là

`GET /analytics` répond `warming_up: true` tant que la collecte n'a pas
tourné. Les compteurs sont alors **absents**, pas à zéro : afficher des zéros
ferait croire à un échec de publication. Prévoyez un état « collecte en
cours » plutôt qu'un tableau vide.

Certains comptes ne seront jamais relevés (réseau sans API de statistiques,
compte connecté par un chemin qui ne les expose pas) : ils sont exclus du
décompte de progression, pour que la barre n'attende pas indéfiniment ce qui
ne viendra pas.

---

## Exemple complet

Un serveur Node minimal, l'interface qui va avec, et la vérification de
signature : [`examples/partner-starter/`](../examples/partner-starter/).

## Ce à quoi penser avant la mise en production

Rien de bloquant, mais chacun de ces points finit par se rappeler à vous.

**Les autorisations sociales expirent.** Meta les révoque au bout d'une
soixantaine de jours, et l'utilisateur peut les retirer à tout moment. Rien ne
vous préviendra tout seul : surveillez `authorized: false` dans
`GET /accounts`, ou abonnez-vous à `account.updated`. Sans cela, les
publications de vos clients échoueront en silence — et c'est vous qu'ils
appelleront.

**Le fuseau horaire.** Un espace créé par l'API prend le fuseau du serveur.
Passez `timezone` explicitement à **chaque** `POST /posts` : c'est le seul
endroit où vous en avez la main, et une publication programmée dans le mauvais
fuseau part à la mauvaise heure sans que rien ne le signale.

**Un webhook par espace.** Les webhooks se déclarent client par client. La
charge utile porte `workspace_uuid` : fiez-vous à lui plutôt qu'à l'URL que
vous avez déclarée, une URL se recopie mal.

**Les crédits IA sont par espace**, et ne se partagent pas. Les packs que vous
achetez sur votre propre espace ne financent pas les générations de vos
clients.

**X (Twitter) est facturé à l'acte** par la plateforme. Si vos clients y
publient en volume, parlez-en avec nous avant : ce n'est pas compris dans les
plans.

**Débit** : 120 requêtes par minute sur `/api/partner/*`, comptées par secret
partenaire — donc par agence, pas par IP. Les appels faits avec un jeton
client relèvent des limites habituelles (100/min, 30/min pour les envois de
fichiers), comptées par client.

## Ce qu'il ne faut pas faire

- **Réutiliser un `connect-link`.** Il vaut session. Un par clic.
- **Traiter `status=success` comme une vérité.** Vérifiez par `GET /accounts`.
- **Stocker le secret partenaire côté navigateur.** Il crée des comptes.
- **Recalculer le JSON pour vérifier la signature.** Signez les octets reçus :
  PHP échappe les slashs (`https:\/\/…`), votre ré-encodage ne retombera pas
  dessus.
- **Ignorer `expires_at`.** À J+90 tout s'arrête d'un coup.
