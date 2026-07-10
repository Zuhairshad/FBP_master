// Minimal local shapes for the two tables the Worker touches — same
// deliberate non-sharing with app/src/types/database.ts as
// worker/src/shopify/types.ts (no shared-types package in this workspace).

export interface EbayTokenRow {
  id: string
  brand_id: string
  refresh_token: string
  refresh_token_expires_at: string
  access_token: string | null
  access_token_expires_at: string | null
  last_synced_at: string | null
}

export type PlatformOrderStatus = 'pending' | 'resolved' | 'unmapped'

export interface PlatformOrderInsert {
  brand_id: string
  platform: 'ebay'
  platform_order_id: string
  raw_data: unknown
  resolved_master_sku: string | null
  status: PlatformOrderStatus
}

export interface SkuMappingRow {
  platform_sku: string
  products: { master_sku: string } | null
}

// eBay's Fulfillment API `getOrders`/`getOrder` line-item shape — field
// names (`orderId`, `lineItems`, `sku`, `creationDate`) verified against
// eBay's own developer.ebay.com documentation content as surfaced through
// WebSearch result summaries (the docs portal itself 403'd to a direct
// fetch from this sandbox, same class of block as TikTok's/Amazon's docs
// sites — see CLAUDE.md Landmines); a first-party source's content, but not
// a first-party *fetch*, so still flagged ASSUMPTION-grade pending live
// verification, same posture as every marketplace integration before this
// one had at this stage.
export interface EbayLineItem {
  lineItemId: string
  sku: string | null
}

export interface EbayOrder {
  orderId: string
  creationDate: string
  orderFulfillmentStatus?: string
  lineItems: EbayLineItem[]
}

export interface EbayOrderSearchResponse {
  orders?: EbayOrder[]
  total?: number
}
