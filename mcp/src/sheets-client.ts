import { google } from 'googleapis';
import { Wine } from './types.js';

export interface SheetsClientConfig {
  spreadsheetId: string;
  sheetName: string;
  range: string;
  credentialsPath: string;
}

/**
 * Client for fetching and caching wine data from Google Sheets
 */
export class SheetsClient {
  private wines: Wine[] = [];
  private columnMapping: Map<string, number> = new Map();
  private config: SheetsClientConfig;
  private sheetsService: any;

  constructor(config: SheetsClientConfig) {
    this.config = config;
  }

  /**
   * Initialize the Google Sheets API client
   */
  async initialize(): Promise<void> {
    const auth = new google.auth.GoogleAuth({
      keyFile: this.config.credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    this.sheetsService = google.sheets({ version: 'v4', auth });

    // Load data on initialization
    await this.refreshData();
  }

  /**
   * Fetch fresh data from Google Sheets
   */
  async refreshData(): Promise<void> {
    try {
      const response = await this.sheetsService.spreadsheets.values.get({
        spreadsheetId: this.config.spreadsheetId,
        range: `${this.config.sheetName}!${this.config.range}`,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        throw new Error('No data found in sheet');
      }

      // Find the header row (first non-empty row)
      let headerIndex = 0;
      while (headerIndex < rows.length) {
        const row = rows[headerIndex];
        if (row && row.length > 0 && row.some((cell: string) => cell && cell.trim())) {
          break;
        }
        headerIndex++;
      }

      if (headerIndex >= rows.length) {
        throw new Error('No header row found in sheet');
      }

      const headers = rows[headerIndex];
      this.buildColumnMapping(headers);

      // Parse rows after the header into Wine objects
      this.wines = rows
        .slice(headerIndex + 1)
        .filter((row: any[]) => row && row.length > 0)
        .map((row: any[]) => this.parseWineRow(row));

      console.error(
        `Loaded ${this.wines.length} wines from Google Sheets`
      );
    } catch (error) {
      console.error('Error fetching data from Google Sheets:', error);
      throw error;
    }
  }

  /**
   * Build mapping from column names to indices
   */
  private buildColumnMapping(headers: string[]): void {
    this.columnMapping.clear();
    headers.forEach((header, index) => {
      // Normalize header names to camelCase
      const normalized = this.normalizeColumnName(header);
      this.columnMapping.set(normalized, index);
    });
  }

  /**
   * Normalize column name to camelCase for TypeScript property names
   */
  private normalizeColumnName(header: string): string {
    // Handle special cases
    if (header === 'ID') return 'id';
    if (header === '$') return 'price';
    if (header === 'Purchased/ Provided') return 'purchasedProvided';
    if (header === 'Temp (if not standard)') return 'temp';

    // Strip parenthetical content and non-alphanumeric characters (except spaces)
    const cleaned = header.replace(/\(.*?\)/g, '').replace(/[^a-zA-Z0-9\s]/g, '').trim();

    // Convert to camelCase
    return cleaned
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((word, i) => {
        if (i === 0) {
          return word.toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join('');
  }

  /**
   * Parse a row into a Wine object
   */
  private parseWineRow(row: string[]): Wine {
    const getValue = (key: string): string => {
      const index = this.columnMapping.get(key);
      return index !== undefined ? (row[index] || '').toString() : '';
    };

    const price = getValue('price');

    return {
      id: getValue('id'),
      brandName: getValue('brandName'),
      wineName: getValue('wineName'),
      ava: getValue('ava'),
      vintage: getValue('vintage'),
      price: price && price.trim() ? price : 'N/A',
      rating: getValue('rating'),
      review: getValue('review'),
      region: getValue('region'),
      type: getValue('type'),
      mainVarietal: getValue('mainVarietal'),
      tastingDate: getValue('tastingDate'),
      publicationDate: getValue('publicationDate'),
      setting: getValue('setting'),
      purchasedProvided: getValue('purchasedProvided'),
      temp: getValue('temp'),
      hyperlink: getValue('hyperlink'),
    };
  }

  /**
   * Get all wines
   */
  getAllWines(): Wine[] {
    return this.wines;
  }

  /**
   * Get available column names
   */
  getColumnNames(): string[] {
    return Array.from(this.columnMapping.keys());
  }

  /**
   * Get column index by name
   */
  getColumnIndex(columnName: string): number {
    return this.columnMapping.get(columnName) ?? -1;
  }
}
