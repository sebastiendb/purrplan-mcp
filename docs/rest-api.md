# API REST PurrPlan — référence

Base : `https://app.purrplan.ai/app/api`
Auth : `Authorization: Bearer <api_token>` — le jeton **sans portées**.

> Un jeton MCP (celui qui porte des portées) est refusé ici en `403`. Les deux
> surfaces sont volontairement étanches ; voir [partner-api.md](./partner-api.md) § 2.

> ⚠️ **Sur cette API, un jeton est tout ou rien** : il n'existe pas de portées
> côté REST. Ne le placez jamais dans un navigateur — appelez PurrPlan depuis
> votre serveur. Voir [partner-api.md](./partner-api.md) § 4.

Toutes les réponses sont en JSON. Les identifiants exposés sont des **uuid**,
sauf dans le corps de création d'un post, qui référence les comptes, tags et
médias par leur **id entier** — ce sont ceux que rendent `GET /accounts`,
`GET /tags` et `POST /media`.

## Limites de débit

| Famille | Limite |
|---|---|
| API générale | 100 req/min |
| Envoi de média | 30 req/min |
| Génération IA | 20 req/min |

Dépassement : `429`, avec `Retry-After`.

---

## Global

### `GET /me`
```json
{ "id": 1, "name": "Atelier Nord", "email": "contact@ateliernord.fr" }
```

### `GET /workspaces`
```json
{ "data": [ { "uuid": "9f1c…", "name": "Atelier Nord", "role": "admin", "can_approve": true } ] }
```

Tout le reste est préfixé par `/{workspace}` — l'uuid de l'espace.

---

## Comptes sociaux

### `GET /{workspace}/accounts`
La liste des comptes connectés. **`authorized: false` signifie que le réseau a
révoqué l'autorisation** : les publications partiront en échec tant qu'un
nouveau `connect-link` n'a pas été fait.

### `GET /{workspace}/accounts/{uuid}`

> Il n'y a pas de `POST /accounts` : connecter un réseau passe forcément par un
> navigateur. Voir [partner-api.md](./partner-api.md) § 3.

---

## Médias

### `POST /{workspace}/media` — `multipart/form-data`, champ `file`
Rend la fiche média, dont l'`id` entier à référencer dans un post.

### `GET /{workspace}/media` — paginé, 20 par page
### `GET /{workspace}/media/{uuid}`
### `DELETE /{workspace}/media` — corps `{ "items": [uuid, …] }`

---

## Publications

### `POST /{workspace}/posts`

Le corps mérite d'être compris une fois pour toutes :

```json
{
  "accounts": [12, 13],
  "tags": [4],
  "date": "2026-09-24",
  "time": "08:00",
  "timezone": "Europe/Paris",
  "schedule": true,
  "versions": [
    {
      "account_id": 0,
      "is_original": true,
      "content": [ { "body": "Le texte commun.", "media": [88] } ]
    },
    {
      "account_id": 13,
      "is_original": false,
      "content": [ { "body": "La variante pour ce compte-là.", "media": [] } ]
    }
  ]
}
```

| Champ | Rôle |
|---|---|
| `accounts` | les comptes qui publient, par **id entier** |
| `versions` | **obligatoire**, au moins une |
| `account_id: 0` | la version **commune**, utilisée par tout compte sans variante |
| `is_original` | `true` sur la version commune |
| `content` | un **tableau** : plusieurs entrées = fil (X, Threads, Bluesky, Mastodon) ou premier commentaire (Facebook, Instagram) |
| `media` | ids entiers rendus par `POST /media` |
| `options` | réglages propres au réseau (type de story, titre YouTube, subreddit…) |
| `schedule` | programme à `date`+`time` |
| `schedule_now` | publie immédiatement |
| `queue` | place au prochain créneau de la file de l'espace |

Sans `schedule`, `schedule_now` ni `queue`, le post est créé en **brouillon**.
Un `account_id` de `versions` doit figurer dans `accounts`, sinon `422`.

**Ce que `POST /posts` rend** — l'objet créé, **sans enveloppe** (pas de clé
`data`). C'est là que vous lisez l'`uuid` à conserver :

```json
{
  "id": 4821,
  "uuid": "9c8b7a65-…",
  "status": "scheduled",
  "accounts": [ { "id": 12, "uuid": "…", "name": "…", "provider": "instagram_direct" } ],
  "versions": [ { "account_id": 0, "is_original": true, "content": [ … ] } ],
  "tags": [],
  "user": { "name": "Atelier Nord" },
  "scheduled_at": "2026-09-24 08:00:00",
  "published_at": null,
  "created_at": "2026-09-21 14:02:11",
  "trashed": false
}
```

`status` vaut `draft`, `scheduled`, `publishing`, `published` ou `failed`.
**Gardez l'`uuid`** : c'est lui qui adresse le post partout ailleurs (`GET`,
`PUT`, `DELETE`, `schedule`). L'`id` entier n'est utile qu'en interne.

### `POST /{workspace}/posts/validate`
Même corps, ne persiste rien. Rend les refus qu'opposeraient les réseaux
(longueur, nombre de médias, format). **Appelez-le avant de programmer** :
c'est la même source de vérité que la programmation elle-même.

### `GET /{workspace}/posts`
Paginé, 20 par page. Filtres : `status` (`draft`, `scheduled`, `published`,
`failed`), `keyword`, `tags`, `accounts`, `start_date`, `end_date`.

### `GET /{workspace}/posts/{uuid}`
### `PUT /{workspace}/posts/{uuid}`
**Même corps que `POST /posts`**, en entier — ce n'est pas une mise à jour
partielle : les `versions` que vous envoyez remplacent les précédentes. Rend
`{ "success": true }`, pas le post : relisez-le par `GET` si vous en avez
besoin.

Deux refus possibles en `422`, propres à la mise à jour : `in_history` (le post
est déjà publié ou archivé) et `publishing` (sa publication est en cours). On
ne réécrit pas un post pendant que le réseau est en train de le prendre.
### `DELETE /{workspace}/posts/{uuid}` → `{ "deleted": true }`, ou `?trash=1` → `{ "to_trash": true }`
### `DELETE /{workspace}/posts` — suppression en lot, corps `{ "items": [uuid, …] }`
### `POST /{workspace}/posts/schedule/{uuid}` — corps `{ "postNow": true|false }`
### `POST /{workspace}/posts/add-to-queue/{uuid}`
### `POST /{workspace}/posts/approve/{uuid}`

---

## Tags

`GET|POST /{workspace}/tags` · `GET|PUT|DELETE /{workspace}/tags/{uuid}`

---

## Webhooks

Réservés au rôle **admin** de l'espace. Le secret s'écrit, ne se relit jamais.

### `GET /{workspace}/webhooks/events`
La liste des événements disponibles. Ne la recopiez pas en dur.

### `POST /{workspace}/webhooks`
```json
{
  "callback_url": "https://votre-outil.fr/purrplan/hook",
  "events": ["post.published", "account.deleted"],
  "secret": "…",
  "method": "post",
  "content_type": "application/json",
  "max_attempts": 3,
  "active": true
}
```
Seuls `callback_url` et `events` sont obligatoires. `callback_url` doit être
une URL **publique** en http(s) sur le port 80 ou 443 : une IP privée ou
`localhost` est refusée en `422`.

### `GET /{workspace}/webhooks` · `GET|PUT|DELETE /{workspace}/webhooks/{uuid}`
`PUT` accepte une mise à jour partielle : `{"active": false}` coupe un webhook
sans toucher à ses abonnements.

Charges utiles, signature HMAC et vérification : [partner-api.md](./partner-api.md) § 5.

---

## IA

`POST /{workspace}/ai/text/generate` · `…/modify` · `…/generate-multi-social`
Consomment les crédits texte de l'espace. 20 req/min.

---

## Codes d'erreur

| Code | Signification |
|---|---|
| `401` | jeton absent, faux ou **expiré** |
| `403` | jeton MCP sur l'API REST · rôle insuffisant · abonnement inactif |
| `404` | ressource hors de cet espace de travail (on ne confirme pas son existence) |
| `422` | validation — le corps porte `errors` champ par champ |
| `429` | limite de débit |
