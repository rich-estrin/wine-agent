import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { parse } from 'csv-parse/sync';
import type { Wine } from '../../mcp/src/types.js';

const DEFAULT_CACHE_PATH = './cache/wines.json';

// Canonical spellings for known data-entry typos
const AVA_CORRECTIONS: Record<string, string> = {
  'columbia valley':                    'Columbia Valley',
  'horse heaven hills':                 'Horse Heaven Hills',
  'walla walla valley':                 'Walla Walla Valley',
  'ancient lakes':                      'Ancient Lakes of Columbia Valley',
  'ancient lakes of columbia valley':   'Ancient Lakes of Columbia Valley',
};

function normalizeAva(raw: string): string {
  const key = raw.trim().toLowerCase();
  return AVA_CORRECTIONS[key] ?? raw.trim();
}

// Capitalize the first letter of every word (handles hyphens too)
function toTitleCase(s: string): string {
  return s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

interface CacheFile {
  fetchedAt: string;
  csvPath: string;
  wines: Wine[];
}

export class CSVClient {
  private wines: Wine[] = [];
  private csvPath: string;
  private cachePath: string;

  constructor(csvPath: string, cachePath = DEFAULT_CACHE_PATH) {
    this.csvPath = csvPath;
    this.cachePath = cachePath;
  }

  initialize(): void {
    // Invalidate cache if it was built from a different CSV path
    if (existsSync(this.cachePath)) {
      const cache: CacheFile = JSON.parse(readFileSync(this.cachePath, 'utf-8'));
      if (cache.csvPath === this.csvPath) {
        this.wines = cache.wines;
        console.log(`Loaded ${this.wines.length} wines from cache (${this.cachePath})`);
        return;
      }
      console.log(`Cache CSV path mismatch — rebuilding from ${this.csvPath}`);
    } else {
      console.log(`No cache found — parsing ${this.csvPath}`);
    }
    this.loadFromCSV();
  }

  private loadFromCSV(): void {
    const text = readFileSync(this.csvPath, 'utf-8');
    const rows: Record<string, string>[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
    });

    this.wines = rows.map(this.mapRow);

    mkdirSync(dirname(this.cachePath), { recursive: true });
    const cache: CacheFile = {
      fetchedAt: new Date().toISOString(),
      csvPath: this.csvPath,
      wines: this.wines,
    };
    writeFileSync(this.cachePath, JSON.stringify(cache));
    console.log(`Loaded ${this.wines.length} wines from CSV — cache written to ${this.cachePath}`);
  }

  private mapRow(row: Record<string, string>): Wine {
    const rawPrice = (row['Review Input => Price'] ?? '').trim();
    const price =
      !rawPrice || rawPrice === 'NA' || rawPrice === '0'
        ? 'N/A'
        : rawPrice.startsWith('$')
        ? rawPrice
        : `$${rawPrice}`;

    const designation = (row['Review Input => Designation'] ?? '').trim();
    const varietyStyle = (row['Review Input => Variety Style'] ?? '').trim();
    const varietalLabel = (row['Review Input => Varietal Label'] ?? '').trim();

    return {
      id: (row['ID'] ?? '').trim(),
      brandName: (row['Title'] ?? '').trim(),
      wineName: designation || varietyStyle || varietalLabel,
      ava: normalizeAva(row['Review Input => Appellation'] ?? ''),
      vintage: (row['Review Input => Vintage'] ?? '').trim(),
      price,
      rating: (row['Review Input => Rating'] ?? '').trim(),
      review: (row['Review Input => Review Content'] ?? '').trim(),
      region: toTitleCase(row['Review Input => Home Region'] ?? ''),
      type: toTitleCase(row['Review Input => Wine Type'] ?? ''),
      mainVarietal: toTitleCase(varietalLabel),
      varietyStyle: toTitleCase(varietyStyle),
      publicationDate: (row['Date'] ?? '').trim(),
      tastingDate: '',
      setting: '',
      purchasedProvided: '',
      temp: '',
      hyperlink: (row['Permalink'] ?? '').trim(),
    };
  }

  getAllWines(): Wine[] {
    return this.wines;
  }
}
