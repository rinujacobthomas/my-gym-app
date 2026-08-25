import { Injectable } from '@nestjs/common'
import { bad } from '../common/guards.js'

export interface OffItem {
  id: string
  name: string
  kcal100: number | null
  protein100: number | null
  carbs100: number | null
  fat100: number | null
  servingSize: string | null
}

const TTL = 24 * 3600 * 1000
const CAP = 2000

@Injectable()
export class OffService {
  private cache = new Map<string, { at: number; data: any }>()

  private getCached(key: string): any {
    const hit = this.cache.get(key)
    if (!hit) return undefined
    if (Date.now() - hit.at > TTL) {
      this.cache.delete(key)
      return undefined
    }
    return hit.data
  }

  private setCached(key: string, data: any) {
    if (this.cache.size >= CAP) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(key, { at: Date.now(), data })
  }

  private async getJson(url: string): Promise<any> {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 8000)
    try {
      const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'openGym/2.0 (nutrition lookup)' } })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return await res.json()
    } finally {
      clearTimeout(timer)
    }
  }

  private num(nutriments: any, top: any, key: string): number | null {
    const raw = nutriments?.[key] ?? top?.[key]
    const n = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN
    return Number.isFinite(n) ? n : null
  }

  private toItem(p: any): OffItem | null {
    const productName = String(p?.product_name ?? '').trim()
    const kcal100 = this.num(p?.nutriments, p, 'energy-kcal_100g')
    if (!productName || kcal100 == null) return null
    const brands = String(p?.brands ?? '').trim()
    return {
      id: String(p?.code ?? ''),
      name: brands ? productName + ' · ' + brands : productName,
      kcal100,
      protein100: this.num(p?.nutriments, p, 'proteins_100g'),
      carbs100: this.num(p?.nutriments, p, 'carbohydrates_100g'),
      fat100: this.num(p?.nutriments, p, 'fat_100g'),
      servingSize: p?.serving_size != null && String(p.serving_size).trim() !== '' ? String(p.serving_size) : null,
    }
  }

  async search(q: string): Promise<OffItem[]> {
    const query = String(q ?? '').trim()
    if (!query) return []
    const key = 'q:' + query
    const hit = this.getCached(key)
    if (hit !== undefined) return hit
    let json: any
    try {
      const params = new URLSearchParams({
        search_terms: query,
        search_simple: '1',
        action: 'process',
        json: '1',
        page_size: '20',
        fields: 'code,product_name,brands,nutriments,serving_size,energy-kcal_100g,proteins_100g,carbohydrates_100g,fat_100g',
      })
      json = await this.getJson('https://world.openfoodfacts.org/cgi/search.pl?' + params.toString())
    } catch {
      throw bad('Food search unavailable — add manually', 503)
    }
    const items: OffItem[] = []
    for (const p of Array.isArray(json?.products) ? json.products : []) {
      const item = this.toItem(p)
      if (item) items.push(item)
    }
    this.setCached(key, items)
    return items
  }

  async barcode(code: string): Promise<OffItem | null> {
    const c = String(code ?? '').trim()
    if (!c) return null
    const key = 'b:' + c
    const hit = this.getCached(key)
    if (hit !== undefined) return hit
    let json: any
    try {
      json = await this.getJson('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(c) + '.json')
    } catch {
      throw bad('Food search unavailable — add manually', 503)
    }
    if (json?.status !== 1) {
      this.setCached(key, null)
      return null
    }
    const item = this.toItem(json.product ?? {})
    this.setCached(key, item)
    return item
  }
}
