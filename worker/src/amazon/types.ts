// Minimal local shapes for the two tables the Worker touches — same
// deliberate non-sharing with app/src/types/database.ts as
// worker/src/shopify/types.ts and worker/src/tiktok/types.ts.

export interface AmazonTokenRow {
  id: string
  brand_id: string
  marketplace_id: string
  refresh_token: string
  access_token: string | null
  access_token_expires_at: string | null
  last_synced_at: string | null
}

export type PlatformOrderStatus = 'pending' | 'resolved' | 'unmapped'

export interface PlatformOrderInsert {
  brand_id: string
  platform: 'amazon'
  platform_order_id: string
  raw_data: unknown
  resolved_master_sku: string | null
  status: PlatformOrderStatus
}

export interface SkuMappingRow {
  platform_sku: string
  products: { master_sku: string } | null
}

// Field names verified against Amazon's own selling-partner-api-models
// GitHub repo (models/orders-api-model/ordersV0.json) — the docs portal
// itself (developer-docs.amazon.com) returned HTTP 403 from this sandbox,
// same as TikTok's docs, but the canonical JSON schema repo was fetchable,
// so this is on firmer footing than a purely secondary-source ASSUMPTION.
export interface AmazonOrder {
  AmazonOrderId: string
  PurchaseDate: string
  OrderStatus: string
}

export interface AmazonOrderItem {
  OrderItemId: string
  SellerSKU?: string
  ASIN: string
}
