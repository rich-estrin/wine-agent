/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { emptyFilters, getDateFilter, hasAnyFilter, countActiveFilters, type Filters } from './Sidebar';

const withFilters = (overrides: Partial<Filters>): Filters => ({ ...emptyFilters, ...overrides });

describe('emptyFilters', () => {
  it('starts with nothing selected', () => {
    expect(hasAnyFilter(emptyFilters)).toBe(false);
    expect(countActiveFilters(emptyFilters)).toBe(0);
  });

  it('uses arrays for the multi-select facets and strings for the rest', () => {
    expect(emptyFilters.type).toEqual([]);
    expect(emptyFilters.stateProvince).toEqual([]);
    expect(emptyFilters.specialDesignation).toEqual([]);
    expect(emptyFilters.mainVarietal).toBe('');
    expect(emptyFilters.ava).toBe('');
    expect(emptyFilters.region).toBe('');
  });
});

describe('countActiveFilters', () => {
  it('counts a single-select filter once', () => {
    expect(countActiveFilters(withFilters({ mainVarietal: 'Merlot' }))).toBe(1);
  });

  it('counts each selection in a multi-select', () => {
    expect(countActiveFilters(withFilters({ type: ['Red', 'White'] }))).toBe(2);
  });

  it('does not count an empty array', () => {
    expect(countActiveFilters(withFilters({ type: [] }))).toBe(0);
  });

  it('adds up across facets', () => {
    const filters = withFilters({
      type: ['Red', 'White'], stateProvince: ['Oregon'],
      mainVarietal: 'Merlot', priceMin: '20',
    });
    expect(countActiveFilters(filters)).toBe(5);
  });
});

describe('hasAnyFilter', () => {
  it('is true for a single-select selection', () => {
    expect(hasAnyFilter(withFilters({ ava: 'Red Mountain' }))).toBe(true);
  });

  it('is true for a multi-select selection', () => {
    expect(hasAnyFilter(withFilters({ type: ['Red'] }))).toBe(true);
  });

  it('is true for a range endpoint on its own', () => {
    expect(hasAnyFilter(withFilters({ priceMax: '50' }))).toBe(true);
  });

  it('is false when arrays are present but empty', () => {
    expect(hasAnyFilter(withFilters({ type: [], stateProvince: [] }))).toBe(false);
  });
});

describe('getDateFilter', () => {
  const isoOf = (v: string) => getDateFilter(v).replace('>=', '');
  const daysAgo = (iso: string) =>
    Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);

  it('emits a >= comparison against an ISO date', () => {
    expect(getDateFilter('1y')).toMatch(/^>=\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a cutoff roughly one year back for 1y', () => {
    expect(daysAgo(isoOf('1y'))).toBeGreaterThan(360);
    expect(daysAgo(isoOf('1y'))).toBeLessThan(370);
  });

  it('returns a cutoff roughly ten years back for 10y', () => {
    expect(daysAgo(isoOf('10y'))).toBeGreaterThan(3640);
  });

  it('puts shorter ranges nearer to today than longer ones', () => {
    const order = ['3m', '6m', '1y', '2y', '3y', '5y', '10y'].map((v) => daysAgo(isoOf(v)));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('returns nothing for no selection or an unknown value', () => {
    expect(getDateFilter('')).toBe('');
    expect(getDateFilter('nonsense')).toBe('');
  });
});
