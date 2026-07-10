// Minimal local shapes for the two tables the Worker touches — deliberately
// not importing app/src/types/database.ts (no shared-types package exists in
// this workspace, and the Worker package has no dependency on `app`). Only
// the fields the Worker actually reads/writes are modeled.

export interface ShopifyTokenRow {
  id: string
  brand_id: string
  shop_domain: string
  access_token: string
  scope: string
  last_synced_at: string | null
}

export type PlatformOrderStatus = 'pending' | 'resolved' | 'unmapped'

export interface PlatformOrderInsert {
  brand_id: string
  platform: 'shopify'
  platform_order_id: string
  raw_data: unknown
  resolved_master_sku: string | null
  status: PlatformOrderStatus
}

export interface SkuMappingRow {
  platform_sku: string
  products: { master_sku: string } | null
}

export interface ShopifyLineItem {
  sku: string | null
}

export interface ShopifyOrder {
  id: number
  name: string
  line_items: ShopifyLineItem[]
  created_at: string
}
