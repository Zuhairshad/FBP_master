// Minimal local shapes for the two tables the Worker touches — same
// deliberate non-sharing with app/src/types/database.ts as
// worker/src/shopify/types.ts (no shared-types package in this workspace).

export interface WalmartTokenRow {
  id: string
  brand_id: string
  client_id: string
  client_secret: string
  access_token: string | null
  access_token_expires_at: string | null
  last_synced_at: string | null
}

export type PlatformOrderStatus = 'pending' | 'resolved' | 'unmapped'

export interface PlatformOrderInsert {
  brand_id: string
  platform: 'walmart'
  platform_order_id: string
  raw_data: unknown
  resolved_master_sku: string | null
  status: PlatformOrderStatus
}

export interface SkuMappingRow {
  platform_sku: string
  products: { master_sku: string } | null
}

// Walmart Marketplace Orders API's response shape — field names
// (`purchaseOrderId`, `orderLines.orderLine[].item.sku`) verified against
// WebSearch result summaries quoting developer.walmart.com's own
// documentation content (the docs portal itself 403'd to a direct fetch
// from this sandbox, same class of block as every other marketplace
// platform's docs site — see CLAUDE.md Landmines): same "first-party
// source, not first-party fetch" posture as Phase 8's eBay integration,
// not TikTok's purely-secondary-source posture. UNVERIFIED against a live
// Walmart order payload.
export interface WalmartOrderLine {
  lineNumber?: string
  item: { sku: string | null; productName?: string }
}

export interface WalmartOrder {
  purchaseOrderId: string
  orderDate?: number
  orderLines: { orderLine: WalmartOrderLine[] }
}

export interface WalmartOrderListResponse {
  list?: {
    elements?: { order?: WalmartOrder[] }
  }
}
