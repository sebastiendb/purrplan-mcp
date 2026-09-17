import { DEFAULT_ENDPOINT, TOOLS, type ToolName } from "./tools.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  token: string;
  endpoint?: string;
  fetch?: FetchLike;
}

export class McpClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpClientError";
  }
}

type JsonRpcResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal)$/i;

function isPrivateMediaUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return true;
  }

  if (url.port && url.port !== "80" && url.port !== "443") {
    return true;
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (PRIVATE_HOST.test(host) || host.endsWith(".local")) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return true;
    }
  }

  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return true;
  }

  return false;
}

export function createPurrPlanClient(options: ClientOptions) {
  const endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, "");
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  let nextId = 1;

  async function callTool(name: ToolName, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!options.token || !options.token.trim()) {
      throw new McpClientError("A bearer token is required for MCP tool calls.");
    }

    if (name === "reply_to_inbox_message" && args.confirm !== true) {
      throw new McpClientError(
        "Envoi refusé : confirm doit valoir true. La réponse part réellement au destinataire.",
      );
    }

    if (name === "upload_media_from_url" && isPrivateMediaUrl(String(args.url ?? ""))) {
      throw new McpClientError("URL refusée : elle pointe vers une adresse non publique (SSRF).");
    }

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId++,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

    if (!response.ok) {
      throw new McpClientError(`MCP HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      error?: { message?: string };
      result?: JsonRpcResult;
    };

    if (payload.error) {
      throw new McpClientError(payload.error.message ?? "MCP error");
    }

    const result = payload.result;
    if (!result) {
      throw new McpClientError("MCP response has no result.");
    }
    if (result.isError) {
      throw new McpClientError(result.content?.[0]?.text ?? "MCP tool error");
    }

    const text = result.content?.find((part) => part.type === "text")?.text ?? "";
    if (!text) {
      return result;
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return {
    tools: TOOLS,
    call: callTool,
    listWorkspaces: () => callTool("list_workspaces"),
    listAccounts: (args: Record<string, unknown>) => callTool("list_accounts", args),
    listPosts: (args: Record<string, unknown>) => callTool("list_posts", args),
    getPost: (args: Record<string, unknown>) => callTool("get_post", args),
    generateAiText: (args: Record<string, unknown>) => callTool("generate_ai_text", args),
    createDraftPost: (args: Record<string, unknown>) => callTool("create_draft_post", args),
    createStories: (args: Record<string, unknown>) => callTool("create_stories", args),
    updateDraftPost: (args: Record<string, unknown>) => callTool("update_draft_post", args),
    deletePost: (args: Record<string, unknown>) => callTool("delete_post", args),
    uploadMediaFromUrl: (args: Record<string, unknown>) => callTool("upload_media_from_url", args),
    listInbox: (args: Record<string, unknown>) => callTool("list_inbox", args),
    getInboxThread: (args: Record<string, unknown>) => callTool("get_inbox_thread", args),
    manageInboxMessages: (args: Record<string, unknown>) => callTool("manage_inbox_messages", args),
    refreshInbox: (args: Record<string, unknown>) => callTool("refresh_inbox", args),
    replyToInboxMessage: (args: Record<string, unknown>) => callTool("reply_to_inbox_message", args),
    getAnalytics: (args: Record<string, unknown>) => callTool("get_analytics", args),
    getTopPosts: (args: Record<string, unknown>) => callTool("get_top_posts", args),
    planMyWeek: (args: Record<string, unknown>) => callTool("plan_my_week", args),
  };
}

export type PurrPlanClient = ReturnType<typeof createPurrPlanClient>;
