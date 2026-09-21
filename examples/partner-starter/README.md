# Console agence — squelette d'intégration PurrPlan

Une agence gère les réseaux de ses clients depuis **sa** propre interface. Le
client final n'ouvre jamais PurrPlan, ne crée pas de compte, ne voit pas notre
marque. Ce dossier est le plus petit code qui fait ça pour de vrai.

Zéro dépendance. Node 18+.

```bash
cp .env.example .env     # renseignez PURRPLAN_PARTNER_SECRET et PUBLIC_URL
node --env-file=.env server.js
```

→ `http://localhost:4321`

## Ce que ça montre

| Écran | Appel PurrPlan | Jeton utilisé |
|---|---|---|
| Créer un client | `POST /api/partner/clients` | secret partenaire |
| Connecter un réseau | `POST /api/partner/connect-link` | `token` (MCP) du client |
| Lister les comptes | `GET /app/api/{ws}/accounts` | `api_token` du client |
| Programmer | `POST /app/api/{ws}/posts/validate` puis `/posts` | `api_token` |
| Poser un webhook | `POST /app/api/{ws}/webhooks` | `api_token` |
| Recevoir les événements | — | signature HMAC vérifiée |

## Comment vos clients se connectent

Ils ne se connectent pas à PurrPlan : ils se connectent à **vous**.

```
votre client ──► votre interface ──► votre serveur ──► PurrPlan
```

Ce serveur est la seule chose qui détient le jeton. Le navigateur n'appelle
que `/api/*` de ce serveur, jamais `app.purrplan.ai` — et c'est délibéré :
sur l'API REST, un jeton est tout ou rien, il n'y a pas de portées. Un jeton
dans le navigateur, c'est la suppression des comptes sociaux du client depuis
sa console JavaScript.

Les 90 jours de validité concernent **vos jetons de serveur**, pas vos
clients : `POST /api/partner/clients/{ws}/tokens` les renouvelle sans qu'ils
aient rien à faire.

## Les trois pièges, traités dans le code

**1. `PUBLIC_URL` doit être publique.** PurrPlan refuse une URL de retour qui
pointe sur `localhost`, une IP privée ou un port exotique — c'est une
protection anti-SSRF, pas un réglage à contourner. En local, un tunnel https
(`cloudflared tunnel --url http://localhost:4321`) suffit.

**2. Le lien de connexion vaut session, et ne sert qu'une fois.** On l'ouvre
immédiatement, on ne le met ni en cache ni dans un e-mail conservé. Rejoué, il
ramène le client chez vous avec `status=error&error=link_expired`.

**3. La signature se vérifie sur les octets reçus.** PHP échappe les slashs
dans son JSON (`https:\/\/…`). Si vous re-sérialisez l'objet parsé pour
recalculer le HMAC, il ne tombera jamais juste. Voir `signatureIsValid()`.

## Ce qu'il reste à faire pour de la production

- `clients.json` → une vraie base, **jetons chiffrés au repos** ;
- une tâche qui appelle `POST /api/partner/clients/{ws}/tokens` avant J+90 —
  passé ce délai tout répond `401`, sans autre signal ;
- ne pas croire `status=success` : la vérité est dans `GET /accounts`, et
  `authorized: false` veut dire que le réseau a révoqué l'autorisation.

## Documentation

- [Guide partenaire](../../docs/partner-api.md)
- [Référence API REST](../../docs/rest-api.md)
- [Outils MCP](../../README.md)
