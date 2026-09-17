/**
 * Public surface of the free client. Names and scopes match
 * app.purrplan.ai MCPToolRegistry — nothing else is advertised.
 */
export const TOOLS = [
  { name: "list_workspaces", scopes: ["read"] },
  { name: "list_accounts", scopes: ["read"] },
  { name: "list_posts", scopes: ["read"] },
  { name: "get_post", scopes: ["read"] },
  { name: "generate_ai_text", scopes: ["ai"] },
  { name: "create_draft_post", scopes: ["write"] },
  { name: "create_stories", scopes: ["write"] },
  { name: "update_draft_post", scopes: ["write"] },
  { name: "delete_post", scopes: ["write"] },
  { name: "upload_media_from_url", scopes: ["media"] },
  { name: "list_inbox", scopes: ["inbox:read"] },
  { name: "get_inbox_thread", scopes: ["inbox:read"] },
  { name: "manage_inbox_messages", scopes: ["inbox:read"] },
  { name: "refresh_inbox", scopes: ["inbox:read"] },
  { name: "reply_to_inbox_message", scopes: ["inbox:reply"] },
  { name: "get_analytics", scopes: ["analytics:read"] },
  { name: "get_top_posts", scopes: ["analytics:read"] },
  { name: "plan_my_week", scopes: ["write", "ai"] },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];

export const DEFAULT_ENDPOINT = "https://app.purrplan.ai/api/mcp";
