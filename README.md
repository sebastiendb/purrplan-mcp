# PurrPlan MCP Server

Official **remote MCP server** for [PurrPlan](https://purrplan.ai) — the social media scheduler your AI agent can drive. Plan, publish and analyze content across 12+ networks (LinkedIn, X, Instagram, TikTok, Facebook, YouTube, Threads, Bluesky, Pinterest, Telegram, Mastodon…) straight from Claude, Cursor, OpenClaw or your own scripts.

- **Endpoint**: `https://app.purrplan.ai/api/mcp` (Streamable HTTP, MCP protocol `2025-06-18`)
- **Health check** (no auth): `https://app.purrplan.ai/api/mcp/health`
- **Auth**: Bearer token (created in-app) or OAuth 2.0 with Dynamic Client Registration + PKCE
- **Docs**: https://purrplan.ai/developpeurs (FR) · https://purrplan.ai/en/developpeurs (EN)

## Quick start

Create a token in PurrPlan → **API & MCP** page (`https://app.purrplan.ai/app/mcp-integration`), pick your scopes, then:

### Claude Code

```bash
claude mcp add --transport http purrplan https://app.purrplan.ai/api/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

### Generic JSON (Cursor, Windsurf, OpenClaw, …)

```json
{
  "mcpServers": {
    "purrplan": {
      "type": "http",
      "url": "https://app.purrplan.ai/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

Clients without native HTTP support can bridge through `mcp-remote`:

```json
{
  "mcpServers": {
    "purrplan": {
      "command": "npx",
      "args": ["mcp-remote", "https://app.purrplan.ai/api/mcp",
               "--header", "Authorization: Bearer YOUR_TOKEN"]
    }
  }
}
```

## Tools (18)

| Tool | Scope | What it does |
|---|---|---|
| `list_workspaces` | `read` | Workspaces you can act on |
| `list_accounts` | `read` | Connected social accounts and their auth status |
| `list_posts` | `read` | Posts with per-network versions, filterable by status |
| `get_post` | `read` | Full detail of one post (versions, media, accounts) |
| `generate_ai_text` | `ai` | Generate copy with the workspace's brand voice |
| `create_draft_post` | `write` | Create a draft or scheduled post; array content = thread (X, Threads, Bluesky, Mastodon) or first comment (Facebook, Instagram) |
| `create_stories` | `write` | Schedule a cascade of stories (Instagram, Facebook), up to 30 |
| `update_draft_post` | `write` | Edit content, accounts, media or schedule of a draft |
| `delete_post` | `write` | Delete drafts/scheduled posts (never published ones) |
| `upload_media_from_url` | `media` | Ingest an image/video from a URL (≤ 50 MB) |
| `list_inbox` | `inbox:read` | Comments, DMs and mentions across networks |
| `get_inbox_thread` | `inbox:read` | Full thread of one conversation |
| `manage_inbox_messages` | `inbox:read` | Mark read/unread, archive, assign |
| `refresh_inbox` | `inbox:read` | Force an immediate inbox sync |
| `reply_to_inbox_message` | `inbox:reply` | Send a real reply as the connected account (`confirm: true` required, hourly cap) |
| `get_analytics` | `analytics:read` | Followers, reach, impressions, engagement, clicks, per-network breakdown |
| `get_top_posts` | `analytics:read` | Best posts + audience/engagement curves |
| `plan_my_week` | `write`+`ai` | Turn a brief into N scheduled posts across the week |

## Scopes

`read` · `write` · `ai` · `media` · `inbox:read` · `inbox:reply` · `analytics:read`

Tokens carry only the scopes you grant. Inbox replying and analytics are deliberately separate scopes. Every tool call is audit-logged in-app.

## Security

- Untrusted content guard: inbox content is treated as data, never as instructions.
- SSRF protection on all client-supplied URLs.
- Rate limits: 100 req/min (API+MCP), 20/min (AI), 30/min (media).
- Destructive/outbound actions (`reply_to_inbox_message`, scheduled sends) require explicit confirmation flags.

## Pricing

API & MCP access is **included** in PurrPlan plans (from €9/month, MCP from the Pro plan) — not a paid add-on. 7-day free trial: https://app.purrplan.ai/app/register

**Lifetime deal**: pay **€597 once**, your agent posts forever — no subscription. Includes the Pro plan (API + MCP, AI credits and quotas). The only social scheduler with a lifetime option for agent-driven workflows.

## Support

- Website: https://purrplan.ai
- In-app MCP page: https://app.purrplan.ai/app/mcp-integration
- Contact: hello@purrplan.ai
