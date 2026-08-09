import { describe, it, expect } from 'vitest';
import { statesOf, buildRegionTree, expandRegion } from './region-tree';

const REGIONS = [
  'Tri-Cities (WA)',
  'Yakima (WA)',
  'Walla Walla Valley (WA/OR)',
  'Willamette (OR)',
  'Sunnyslope (ID)',
  'Okanagan (BC)',
  'Imported (Other)',
];

describe('statesOf', () => {
  it('reads the state code out of the parenthetical', () => {
    expect(statesOf('Tri-Cities (WA)')).toEqual(['Washington']);
    expect(statesOf('Sunnyslope (ID)')).toEqual(['Idaho']);
    expect(statesOf('Okanagan (BC)')).toEqual(['British Columbia']);
  });

  it('handles a region spanning two states', () => {
    expect(statesOf('Walla Walla Valley (WA/OR)')).toEqual(['Washington', 'Oregon']);
  });

  it('falls back to Other for an unrecognised or missing code', () => {
    expect(statesOf('Imported (Other)')).toEqual(['Other']);
    expect(statesOf('No Parenthetical')).toEqual(['Other']);
  });
});

describe('buildRegionTree', () => {
  it('groups regions under their state', () => {
    const tree = buildRegionTree(REGIONS);
    const wa = tree.find((n) => n.name === 'Washington')!;
    expect(wa.children!.map((c) => c.name)).toContain('Tri-Cities (WA)');
  });

  it('lists a two-state region under both states', () => {
    const tree = buildRegionTree(REGIONS);
    for (const state of ['Washington', 'Oregon']) {
      const node = tree.find((n) => n.name === state)!;
      expect(node.children!.map((c) => c.name)).toContain('Walla Walla Valley (WA/OR)');
    }
  });

  it('orders states consistently, with Other last', () => {
    const tree = buildRegionTree(REGIONS);
    expect(tree.map((n) => n.name)).toEqual(
      ['Washington', 'Oregon', 'Idaho', 'British Columbia', 'Other'],
    );
  });

  it('omits states with no regions — this is what makes the tree narrow', () => {
    const tree = buildRegionTree(['Willamette (OR)']);
    expect(tree.map((n) => n.name)).toEqual(['Oregon']);
  });

  it('handles an empty list', () => {
    expect(buildRegionTree([])).toEqual([]);
  });

  it('ignores blank entries', () => {
    expect(buildRegionTree(['', 'Willamette (OR)']).flatMap((n) => n.children!)).toHaveLength(1);
  });
});

describe('expandRegion', () => {
  it('expands a state group to its member regions', () => {
    expect(expandRegion('Washington', REGIONS))
      .toEqual(['Tri-Cities (WA)', 'Yakima (WA)', 'Walla Walla Valley (WA/OR)']);
  });

  it('includes a two-state region under each of its states', () => {
    expect(expandRegion('Oregon', REGIONS)).toContain('Walla Walla Valley (WA/OR)');
  });

  it('expands a leaf region to itself', () => {
    expect(expandRegion('Yakima (WA)', REGIONS)).toEqual(['Yakima (WA)']);
  });

  it('returns nothing for an empty selection', () => {
    expect(expandRegion('', REGIONS)).toEqual([]);
  });

  it('expands a state with no members to an empty list', () => {
    expect(expandRegion('Idaho', ['Willamette (OR)'])).toEqual([]);
  });
});
