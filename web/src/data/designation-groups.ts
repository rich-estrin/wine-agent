// Display-only grouping for Special Designation. The underlying wine data is
// untouched — these groups merge related designations into a single filter
// option that matches any of its members.
//
// Shared by the server (meta endpoint emits the group labels) and the frontend
// (App expands a selected group label into its member values before querying).

export interface DesignationGroup {
  label: string;
  members: string[];
}

export const DESIGNATION_GROUPS: DesignationGroup[] = [
  { label: "Critic's Choice", members: ["Critic's Choice", "Editor's Choice"] },
  { label: 'Cellar Stocker',  members: ['Cellar Stocker', 'Cellar Selection'] },
  { label: 'Value Pick',      members: ['Best Buy', 'Value Pick'] },
];

/** Expand a selected group label into the underlying values to match against. */
export function expandDesignation(label: string): string[] {
  if (!label) return [];
  const group = DESIGNATION_GROUPS.find((g) => g.label === label);
  return group ? group.members : [label];
}

/** Given the distinct designations present in the data, return the group labels
 *  that actually have at least one member represented. */
export function designationGroupLabels(available: string[]): string[] {
  const present = new Set(available.map((v) => v.trim()).filter(Boolean));
  return DESIGNATION_GROUPS.filter((g) => g.members.some((m) => present.has(m))).map(
    (g) => g.label,
  );
}
