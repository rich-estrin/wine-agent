import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { Wine } from '../../mcp/src/types.js';

const DEFAULT_CACHE_PATH = './cache/wines.json';

const AVA_CORRECTIONS: Record<string, string> = {
  'columbia valley':                    'Columbia Valley',
  'horse heaven hills':                 'Horse Heaven Hills',
  'walla walla valley':                 'Walla Walla Valley',
  'ancient lakes':                      'Ancient Lakes of Columbia Valley',
  'ancient lakes of columbia valley':   'Ancient Lakes of Columbia Valley',
};

function normalizeAva(raw: string): string {
  const key = (raw ?? '').trim().toLowerCase();
  return AVA_CORRECTIONS[key] ?? (raw ?? '').trim();
}

function toTitleCase(s: string): string {
  return (s ?? '').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface WPReview {
  id: number;
  brand_name: string;
  wine_name: string;
  designation: string;
  variety_style: string;
  tasting_note: string;
  rating: string;
  price: string;
  vintage: string;
  wine_type: string;
  variety: string;
  region: string;
  appellation: string;
  publication_date: string;
}

export function mapWPReview(row: WPReview): Wine {
  const rawPrice = (row.price ?? '').trim();
  const price =
    !rawPrice || rawPrice === 'NA' || rawPrice === '0'
      ? 'N/A'
      : rawPrice.startsWith('$')
      ? rawPrice
      : `$${rawPrice}`;

  const varietyStyle = (row.variety_style ?? '').trim();
  const variety      = (row.variety ?? '').trim();

  return {
    id:                String(row.id),
    brandName:         (row.brand_name ?? '').trim(),
    wineName:          (row.wine_name ?? '').trim(),
    ava:               normalizeAva(row.appellation ?? ''),
    vintage:           (row.vintage ?? '').trim(),
    price,
    rating:            (row.rating ?? '').trim(),
    review:            (row.tasting_note ?? '').trim(),
    region:            toTitleCase(row.region ?? ''),
    type:              toTitleCase(row.wine_type ?? ''),
    mainVarietal:      toTitleCase(variety),
    varietyStyle:      toTitleCase(varietyStyle),
    publicationDate:   (row.publication_date ?? '').trim(),
    tastingDate:       '',
    setting:           '',
    purchasedProvided: '',
    temp:              '',
    hyperlink:         '',
  };
}

interface CacheFile {
  fetchedAt: string;
  wpUrl: string;
  wines: Wine[];
}

export class WPClient {
  private wines: Wine[] = [];
  private wpUrl: string;
  private apiKey: string;
  private cachePath: string;

  constructor(wpUrl: string, apiKey: string, cachePath = DEFAULT_CACHE_PATH) {
    // Normalise: strip trailing slash
    this.wpUrl = wpUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.cachePath = cachePath;
  }

  async initialize(): Promise<void> {
    if (existsSync(this.cachePath)) {
      const cache: CacheFile = JSON.parse(readFileSync(this.cachePath, 'utf-8'));
      if (cache.wpUrl === this.wpUrl) {
        this.wines = cache.wines;
        console.log(`Loaded ${this.wines.length} wines from cache (${this.cachePath})`);
        return;
      }
      console.log(`Cache WP URL mismatch — refreshing from ${this.wpUrl}`);
    } else {
      console.log(`No cache found — fetching from ${this.wpUrl}`);
    }
    await this.fetchFromWP();
  }

  private async fetchFromWP(): Promise<void> {
    const endpoint = `${this.wpUrl}/wp-json/wine-agent/v1/reviews`;
    const perPage = 1000;
    let page = 1;
    const all: WPReview[] = [];

    while (true) {
      const url = `${endpoint}?page=${page}&per_page=${perPage}`;
      const res = await fetch(url, {
        headers: { 'X-Wine-Agent-Key': this.apiKey },
      });

      if (!res.ok) {
        throw new Error(`WP API error ${res.status} at ${url}: ${await res.text()}`);
      }

      const batch: WPReview[] = await res.json();
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < perPage) break;
      page++;
    }

    this.wines = all.map(this.mapRow);

    mkdirSync(dirname(this.cachePath), { recursive: true });
    const cache: CacheFile = {
      fetchedAt: new Date().toISOString(),
      wpUrl: this.wpUrl,
      wines: this.wines,
    };
    writeFileSync(this.cachePath, JSON.stringify(cache));
    console.log(`Fetched ${this.wines.length} wines from WP — cache written to ${this.cachePath}`);
  }

  private mapRow(row: WPReview): Wine {
    return mapWPReview(row);
  }

  getAllWines(): Wine[] {
    return this.wines;
  }

  upsertWine(wine: Wine): void {
    const idx = this.wines.findIndex((w) => w.id === wine.id);
    if (idx >= 0) {
      this.wines[idx] = wine;
    } else {
      this.wines.push(wine);
    }
    this.persist();
  }

  removeWine(id: string): void {
    this.wines = this.wines.filter((w) => w.id !== id);
    this.persist();
  }

  private persist(): void {
    mkdirSync(dirname(this.cachePath), { recursive: true });
    writeFileSync(this.cachePath, JSON.stringify({
      fetchedAt: new Date().toISOString(),
      wpUrl: this.wpUrl,
      wines: this.wines,
    }));
  }

}
