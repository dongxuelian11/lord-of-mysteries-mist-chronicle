const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const ALLOWED_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 1_500_000) return Response.json({ error: { message: "请求内容过大" } }, { status: 413 });
    const input = JSON.parse(text) as { apiKey?: unknown; payload?: unknown };
    if (typeof input.apiKey !== "string" || input.apiKey.length < 8) return Response.json({ error: { message: "缺少有效的 DeepSeek API Key" } }, { status: 400 });
    if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) return Response.json({ error: { message: "缺少模型请求" } }, { status: 400 });
    const payload = input.payload as Record<string, unknown>;
    if (typeof payload.model !== "string" || !ALLOWED_MODELS.has(payload.model)) return Response.json({ error: { message: "只允许 DeepSeek V4 Flash 或 V4 Pro" } }, { status: 400 });
    if (!Array.isArray(payload.messages) || payload.messages.length > 8) return Response.json({ error: { message: "消息格式无效" } }, { status: 400 });
    const stream = payload.stream === true;
    const upstream = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({ ...payload, stream }),
      signal: AbortSignal.timeout(175_000),
    });
    if (stream && upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }
    return new Response(await upstream.text(), { status: upstream.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ error: { message: timeout ? "DeepSeek 响应超时" : "无法转发模型请求" } }, { status: timeout ? 504 : 502, headers: { "Cache-Control": "no-store" } });
  }
}
