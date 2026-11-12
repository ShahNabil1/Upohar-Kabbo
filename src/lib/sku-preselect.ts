/**
 * Catalogue ads deep-link to a product page with `?sku=…`. The SKU can point at
 * three different things, so every surface resolves it the same way here:
 *  1. a variant of the product itself → preselect that variant
 *  2. the SKU of a component product inside a combo → nothing to select, but we
 *     still know which combo row was advertised
 *  3. a variant SKU of a component inside a combo → preselect that option in
 *     the "what's inside" picker
 */

type VariantLike = { id: string; sku?: string | null; stock?: number; group_name_bn: string; group_name_en: string };
type ComboLike = {
  id: string;
  itemSku?: string | null;
  variants: Array<{ id: string; sku?: string | null }>;
};

/** Default combo picker state: first option of every child that has options. */
export function defaultComboSelection(comboItems: ComboLike[]): Record<string, string> {
  return Object.fromEntries(
    comboItems.flatMap((item) => (item.variants[0] ? [[item.id, item.variants[0].id]] : [])),
  );
}

export function resolveVariantBySku<T extends VariantLike>(
  sku: string | undefined,
  variants: T[],
): T | undefined {
  if (!sku) return undefined;
  return variants.find((v) => v.sku && v.sku === sku);
}

/** Own-variant selection map keyed by both language group names (matches page state). */
export function variantSelectionBySku(
  sku: string | undefined,
  variants: VariantLike[],
): Record<string, string> {
  const requested = resolveVariantBySku(sku, variants);
  const match = requested && (requested.stock ?? 1) > 0 ? requested : variants.find((variant) => (variant.stock ?? 1) > 0);
  return match ? { [match.group_name_bn]: match.id, [match.group_name_en]: match.id } : {};
}

/** Combo picker state with the advertised child option preselected when the SKU hits one. */
export function comboSelectionBySku(
  sku: string | undefined,
  comboItems: ComboLike[],
): Record<string, string> {
  const base = defaultComboSelection(comboItems);
  if (!sku) return base;
  for (const item of comboItems) {
    const hit = item.variants.find((v) => v.sku && v.sku === sku);
    if (hit) base[item.id] = hit.id;
  }
  return base;
}

/** The combo row an advertised SKU belongs to, so the UI can highlight it. */
export function comboItemIdBySku(
  sku: string | undefined,
  comboItems: ComboLike[],
): string | null {
  if (!sku) return null;
  const hit = comboItems.find(
    (item) => item.itemSku === sku || item.variants.some((v) => v.sku && v.sku === sku),
  );
  return hit?.id ?? null;
}
