// Key used to decide whether two product/variant names are "the same":
// case, spaces, hyphens, slashes and other punctuation are ignored, so
// "ლოგო სანათი", "ლოგო-სანათი" and "ლოგო  სანათი" all match.
export const nameKey = (value: string | null | undefined): string =>
  String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Groups of items whose names collapse to the same key (2+ items = duplicates).
export function duplicateNameGroups<T extends {name?: string | null}>(items: T[]): T[][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = nameKey(item.name);
    if (!key) continue;
    map.set(key, [...(map.get(key) || []), item]);
  }
  return [...map.values()].filter(group => group.length > 1);
}
