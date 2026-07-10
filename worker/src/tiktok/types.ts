// Minimal local shapes for the two tables the Worker touches — same
// deliberate non-sharing with app/src/types/database.ts as
// worker/src/shopify/types.ts (no shared-types package in this workspace).

export interface TiktokTokenRow {
  id: string
  brand_id: string
  shop_id: string
  access_token: string
  refresh_token: string
  access_token_expires_at: string
  last_synced_at: string | null
}

export type PlatformOrderStatus = 'pending' | 'resolved' | 'unmapped'

export interface PlatformOrderInsert {
  brand_id: string
  platform: 'tiktok'
  platform_order_id: string
  raw_data: unknown
  resolved_master_sku: string | null
  status: PlatformOrderStatus
}

export interface SkuMappingRow {
  platform_sku: string
  products: { master_sku: string } | null
}

// ASSUMPTION: TikTok Shop's order line-item SKU field is named `seller_sku`
// (the seller-assigned SKU on the order, as distinct from `sku_id`, TikTok's
// own internal catalog id) — based on secondary-source documentation of the
// TikTok Shop Order API's line-item shape; TikTok's own docs pages returned
// 403 from this sandbox's network policy when fetched directly (see
// client.ts's header comment). UNVERIFIED against a live TikTok Shop order
// payload.
export interface TiktokLineItem {
  seller_sku: string | null
}

export interface TiktokOrder {
  id: string
  line_items: TiktokLineItem[]
  create_time: number
}

export interface TiktokShop {
  shop_id: string
  shop_name?: string
}
