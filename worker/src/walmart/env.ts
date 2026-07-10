// Walmart is the first platform in this repo where the Worker holds no
// app-level marketplace secret of its own — Walmart's client-credentials
// grant needs only the brand-submitted client_id/client_secret pair (see
// the walmart_tokens migration's header comment). No WALMART_CLIENT_ID/
// WALMART_CLIENT_SECRET binding exists, unlike every prior platform.
export interface WalmartWorkerEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}
