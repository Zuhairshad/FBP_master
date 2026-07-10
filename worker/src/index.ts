export interface Env {
  // Bindings land here as they're wired up (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  // per-marketplace client IDs/secrets via `wrangler secret put`, KV/queue bindings).
}

export default {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return Response.json({ ok: true })
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
