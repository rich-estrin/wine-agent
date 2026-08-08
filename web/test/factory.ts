import type { Wine } from '../src/types.js';

const BLANK: Wine = {
  id: '', brandName: '', wineName: '', ava: '', vintage: '', price: '', rating: '',
  review: '', region: '', type: '', mainVarietal: '', varietyStyle: '', tastingDate: '',
  publicationDate: '', setting: '', purchasedProvided: '', temp: '', hyperlink: '',
  specialDesignation: '', alcohol: '', closure: '', stateProvince: '', source: '', reviewer: '',
};

let seq = 0;

/** Build a Wine with only the fields a test cares about. Ids are auto-assigned
 *  when omitted, so tests can identify results without restating boilerplate. */
export function makeWine(overrides: Partial<Wine> = {}): Wine {
  return { ...BLANK, id: String(++seq), ...overrides };
}

/** Ids of a result list — the usual assertion target for search and sort. */
export const ids = (wines: Wine[]): string[] => wines.map((w) => w.id);

/** A named wine set, so assertions read as `byName.kionaWinery` rather than '3'. */
export function wineSet<T extends Record<string, Partial<Wine>>>(spec: T): {
  wines: Wine[];
  byId: { [K in keyof T]: string };
} {
  const wines: Wine[] = [];
  const byId = {} as { [K in keyof T]: string };
  for (const key of Object.keys(spec) as (keyof T)[]) {
    const wine = makeWine({ id: String(key), ...spec[key] });
    wines.push(wine);
    byId[key] = wine.id;
  }
  return { wines, byId };
}
