import { describe, it, expect } from 'vitest';
import { AVA_TREE, buildAvaTree, expandAva, OTHER_AVA_LABEL, type AvaNode } from './ava-tree';

const names = (nodes: AvaNode[]): string[] =>
  nodes.flatMap((n) => [n.name, ...names(n.children ?? [])]);
const top = (nodes: AvaNode[]) => nodes.map((n) => n.name);

describe('expandAva', () => {
  it('expands a leaf to itself', () => {
    expect(expandAva('Red Mountain')).toEqual(['Red Mountain']);
  });

  it('expands a parent to itself plus every descendant', () => {
    const walla = expandAva('Walla Walla Valley');
    expect(walla).toContain('Walla Walla Valley');
    expect(walla).toContain('The Rocks District of Milton-Freewater');
  });

  it('expands a state to its whole sub-tree', () => {
    const wa = expandAva('Washington');
    expect(wa).toContain('Columbia Valley');
    expect(wa).toContain('Red Mountain');
    expect(wa).not.toContain('Willamette Valley');
  });

  it('returns an unknown name unchanged, so data outside the tree still filters', () => {
    expect(expandAva('Rioja')).toEqual(['Rioja']);
  });

  it('returns nothing for an empty selection', () => {
    expect(expandAva('')).toEqual(['']);
  });

  it('expands the Other group to exactly the appellations off the tree', () => {
    const available = ['Red Mountain', 'Rioja', 'Chianti Classico'];
    expect(expandAva(OTHER_AVA_LABEL, available)).toEqual(['Chianti Classico', 'Rioja']);
  });

  it('expands the Other group to nothing when everything is on the tree', () => {
    expect(expandAva(OTHER_AVA_LABEL, ['Red Mountain'])).toEqual([]);
  });
});

describe('buildAvaTree', () => {
  it('returns the full taxonomy when nothing is specified', () => {
    expect(buildAvaTree([])).toBe(AVA_TREE);
  });

  it('keeps only the appellations present', () => {
    const tree = buildAvaTree(['Red Mountain']);
    expect(names(tree)).toContain('Red Mountain');
    expect(names(tree)).not.toContain('Rattlesnake Hills');
  });

  it('keeps ancestors of a surviving leaf, so the hierarchy stays navigable', () => {
    const tree = names(buildAvaTree(['Red Mountain']));
    expect(tree).toContain('Washington');
    expect(tree).toContain('Columbia Valley');
    expect(tree).toContain('Yakima Valley');
  });

  it('drops branches with nothing under them', () => {
    expect(top(buildAvaTree(['Red Mountain']))).toEqual(['Washington']);
  });

  it('keeps a parent that is itself present even with no children left', () => {
    expect(names(buildAvaTree(['Columbia Valley']))).toContain('Columbia Valley');
  });

  // The bug this fixes: appellations absent from the fixed PNW taxonomy were
  // unreachable through the filter entirely.
  it('collects appellations off the tree under an Other group', () => {
    const tree = buildAvaTree(['Red Mountain', 'Rioja', 'Chianti Classico']);
    const other = tree.find((n) => n.name === OTHER_AVA_LABEL);
    expect(other).toBeDefined();
    expect(other!.children!.map((c) => c.name)).toEqual(['Chianti Classico', 'Rioja']);
  });

  it('omits the Other group when there is nothing to put in it', () => {
    expect(top(buildAvaTree(['Red Mountain']))).not.toContain(OTHER_AVA_LABEL);
  });

  it('puts the Other group last', () => {
    const tree = buildAvaTree(['Red Mountain', 'Rioja']);
    expect(tree.at(-1)!.name).toBe(OTHER_AVA_LABEL);
  });

  it('matches tree nodes accent- and case-insensitively', () => {
    expect(names(buildAvaTree(['red mountain']))).toContain('Red Mountain');
  });

  it('de-duplicates repeated appellations in the Other group', () => {
    const tree = buildAvaTree(['Rioja', 'Rioja', 'rioja ']);
    const other = tree.find((n) => n.name === OTHER_AVA_LABEL)!;
    expect(other.children!.map((c) => c.name)).toHaveLength(1);
  });

  it('does not mutate the source taxonomy', () => {
    const before = JSON.stringify(AVA_TREE);
    buildAvaTree(['Red Mountain', 'Rioja']);
    expect(JSON.stringify(AVA_TREE)).toBe(before);
  });
});
