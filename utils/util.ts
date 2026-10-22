export function formatDate(dateStr: string): string {
  if (!dateStr) return "";

  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function formatPrice(price: number): string {
  return `¥${price.toFixed(2)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

export function parseFlavorPairs(
  flavorNames: string,
  flavorVals: string,
): Array<{ name: string; value: string }> {
  if (!flavorNames || !flavorVals) return [];

  const names = flavorNames.split(",");
  const vals = flavorVals.split(",");

  return names.map((name, index) => ({
    name: name.trim(),
    value: (vals[index] || "").trim(),
  }));
}
