const KNOWN_SLUGS: Record<string, string> = {
  "陶陶居": "taotaoju",
  "点都德": "diandoude",
  "广州塔": "guangzhou-tower",
  "陈家祠": "chenjiaci"
};

export function slugify(input: string): string {
  const known = KNOWN_SLUGS[input.trim()];
  if (known) {
    return known;
  }

  const ascii = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (ascii) {
    return ascii;
  }

  const hex = Array.from(input.trim())
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join("-");

  return hex ? `place-${hex}` : "place";
}
