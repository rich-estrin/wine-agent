import { readFileSync } from 'fs';
import type { Wine } from '../src/types.js';

/** Static dataset loader, for running the app standalone and for tests.
 *
 *  Deliberately in-memory only: unlike CSVClient and WPClient this never writes
 *  to `cache/wines.json`, so running in fixture mode can't clobber the cache a
 *  developer built from real WordPress data. Mutations last until the process
 *  exits, which is what a test wants anyway. */
export class FixtureClient {
  private wines: Wine[] = [];
  private fixturePath: string;

  constructor(fixturePath: string) {
    this.fixturePath = fixturePath;
  }

  initialize(): void {
    const parsed = JSON.parse(readFileSync(this.fixturePath, 'utf-8'));
    // Accept either { wines: [...] } or a bare array.
    this.wines = Array.isArray(parsed) ? parsed : parsed.wines;
    if (!Array.isArray(this.wines)) {
      throw new Error(`${this.fixturePath}: expected an array of wines or { wines: [...] }`);
    }
  }

  getAllWines(): Wine[] {
    return this.wines;
  }

  upsertWine(wine: Wine): void {
    const idx = this.wines.findIndex((w) => w.id === wine.id);
    if (idx >= 0) this.wines[idx] = wine;
    else this.wines.push(wine);
  }

  removeWine(id: string): void {
    this.wines = this.wines.filter((w) => w.id !== id);
  }
}
