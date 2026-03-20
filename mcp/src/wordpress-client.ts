import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { Wine } from './types.js';

export interface WordPressClientConfig {
  apiUrl: string;   // WordPress site root, no trailing slash
  apiKey: string;   // Must match plugin setting
  cachePath?: string; // Path to local JSON cache file
  cacheTtlHours?: number; // Hours before cache is considered stale (default: 24)
}

interface WPReview {
  id: number;
  brand_name: string;
  wine_name: string;
  designation: string;
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

interface CacheFile {
  fetchedAt: string;
  wines: Wine[];
}

const DEFAULT_CACHE_PATH = './cache/wines.json';
const DEFAULT_CACHE_TTL_HOURS = 24;

/**
 * Client for fetching and caching wine data from the WordPress REST API.
 * Writes a local JSON cache on first load; subsequent starts use the cache
 * and refresh in the background if it is older than cacheTtlHours.
 */
export class WordPressClient {
  private wines: Wine[] = [];
  private config: WordPressClientConfig;

  constructor(config: WordPressClientConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const cachePath = this.config.cachePath ?? DEFAULT_CACHE_PATH;
    const ttlHours = this.config.cacheTtlHours ?? DEFAULT_CACHE_TTL_HOURS;

    if (existsSync(cachePath)) {
      const cache: CacheFile = JSON.parse(readFileSync(cachePath, 'utf-8'));
      this.wines = cache.wines;
      console.error(`Loaded ${this.wines.length} wines from cache (${cachePath})`);

      const ageHours = (Date.now() - new Date(cache.fetchedAt).getTime()) / 3_600_000;
      if (ageHours >= ttlHours) {
        console.error(`Cache is ${Math.round(ageHours)}h old — refreshing in background...`);
        this.refreshData(cachePath).catch((e) =>
          console.error('Background refresh failed:', e)
        );
      } else {
        console.error(`Cache age: ${Math.round(ageHours)}h (TTL: ${ttlHours}h)`);
      }
    } else {
      console.error('No cache found — fetching from WordPress...');
      await this.refreshData(cachePath);
    }
  }

  async refreshData(cachePath?: string): Promise<void> {
    const path = cachePath ?? this.config.cachePath ?? DEFAULT_CACHE_PATH;
    const reviews = await this.fetchAllPages();
    this.wines = reviews.map(this.mapToWine);

    mkdirSync(dirname(path), { recursive: true });
    const cache: CacheFile = { fetchedAt: new Date().toISOString(), wines: this.wines };
    writeFileSync(path, JSON.stringify(cache));
    console.error(`Loaded ${this.wines.length} wines from WordPress — cache written to ${path}`);
  }

  getAllWines(): Wine[] {
    return this.wines;
  }

  getColumnNames(): string[] {
    return [
      'id', 'brandName', 'wineName', 'ava', 'vintage', 'price', 'rating',
      'review', 'region', 'type', 'mainVarietal', 'publicationDate',
      'tastingDate', 'setting', 'purchasedProvided', 'temp', 'hyperlink',
    ];
  }

  private async fetchAllPages(): Promise<WPReview[]> {
    const all: WPReview[] = [];
    let page = 1;
    const perPage = 500;

    while (true) {
      const url = `${this.config.apiUrl}/wp-json/wine-agent/v1/reviews?page=${page}&per_page=${perPage}`;
      console.error(`Fetching page ${page} (${all.length} records so far)...`);
      const response = await fetch(url, {
        headers: { 'X-Wine-Agent-Key': this.config.apiKey },
      });

      if (!response.ok) {
        throw new Error(
          `WordPress API error: ${response.status} ${response.statusText} (${url})`
        );
      }

      const batch: WPReview[] = await response.json();
      all.push(...batch);

      if (batch.length < perPage) {
        break;
      }
      page++;
    }

    return all;
  }

  private mapToWine(r: WPReview): Wine {
    return {
      id: String(r.id),
      brandName: r.brand_name,
      wineName: r.wine_name,
      ava: r.appellation,
      vintage: r.vintage,
      price: (r.price && r.price.trim() && r.price.trim() !== 'NA') ? r.price : 'N/A',
      rating: r.rating,
      review: r.tasting_note,
      region: r.region,
      type: r.wine_type,
      mainVarietal: r.variety,
      publicationDate: r.publication_date,
      tastingDate: '',
      setting: '',
      purchasedProvided: '',
      temp: '',
      hyperlink: '',
    };
  }
}
