export function filterItems<T>(
  items: T[],
  search: string,
  key: keyof T
) {
  if (!search.trim()) return items;

  return items.filter((item) =>
    String(item[key])
      .toLowerCase()
      .includes(search.toLowerCase())
  );
}