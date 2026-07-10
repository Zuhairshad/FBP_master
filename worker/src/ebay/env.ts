export interface EbayWorkerEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  EBAY_CLIENT_ID: string
  EBAY_CLIENT_SECRET: string
  // eBay's OAuth authorize URL takes a `redirect_uri` parameter, but eBay
  // requires it to be a "RuName" it assigns per registered app (a name that
  // maps to accept/decline URLs configured in the eBay Developer Portal),
  // not a literal callback URL the way Shopify's redirect_uri is — see
  // client.ts's buildAuthorizeUrl. There is no WORKER_URL-as-redirect_uri
  // pattern here.
  EBAY_RU_NAME: string
  // Where the browser lands after OAuth completes (the app/ dev server).
  APP_URL: string
  // This Worker's own publicly reachable URL — used only to compute the
  // account-deletion-notification endpoint string for the challenge-code
  // hash (see client.ts's computeChallengeResponse), not as an OAuth
  // redirect_uri.
  WORKER_URL: string
  // eBay assigns this when a marketplace account deletion notification
  // subscription is registered in the Developer Portal; required to
  // reproduce the SHA-256 challengeCode+verificationToken+endpoint hash eBay
  // checks during endpoint verification.
  EBAY_VERIFICATION_TOKEN: string
}
