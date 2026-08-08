import { describe, it, expect } from 'vitest';
import { DESIGNATION_GROUPS, expandDesignation, designationGroupLabels } from './designation-groups';

describe('expandDesignation', () => {
  it('expands a group label to every member value', () => {
    expect(expandDesignation("Critic's Choice")).toEqual(["Critic's Choice", "Editor's Choice"]);
    expect(expandDesignation('Value Pick')).toEqual(['Best Buy', 'Value Pick']);
  });

  it('passes an ungrouped value straight through', () => {
    expect(expandDesignation('Something Else')).toEqual(['Something Else']);
  });

  it('returns nothing for an empty selection', () => {
    expect(expandDesignation('')).toEqual([]);
  });
});

describe('designationGroupLabels', () => {
  it('offers a group when any one of its members is present', () => {
    expect(designationGroupLabels(["Editor's Choice"])).toEqual(["Critic's Choice"]);
  });

  it('does not offer a group with no members present', () => {
    expect(designationGroupLabels(['Best Buy'])).toEqual(['Value Pick']);
  });

  it('returns nothing when the data has no designations', () => {
    expect(designationGroupLabels([])).toEqual([]);
    expect(designationGroupLabels(['', '  '])).toEqual([]);
  });

  it('does not repeat a group when several members are present', () => {
    const labels = designationGroupLabels(["Critic's Choice", "Editor's Choice"]);
    expect(labels).toEqual(["Critic's Choice"]);
  });

  it('every group round-trips: its label expands to values that re-offer it', () => {
    for (const group of DESIGNATION_GROUPS) {
      expect(designationGroupLabels(expandDesignation(group.label))).toContain(group.label);
    }
  });
});
