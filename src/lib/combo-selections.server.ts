/**
 * Combo line helpers.
 *
 * A combo product ships every child item in its box, but the customer only
 * picks variants for the items that HAVE variants. Storing just the picked
 * variants made invoices show fewer items than the package actually contains,
 * so these helpers always expand the full combo_items list and attach the
 * chosen variant label when there is one.
 */

type AnyDb = { from: (table: string) => any };

export type ComboChild = {
  itemId: string;
  nameBn: string;
  nameEn: string;
  quantity: number;
  sortOrder: number;
};

export type VariantRow = {
  id: string;
  product_id: string;
  group_name_bn: string;
  group_name_en: string;
  value_bn: string;
  value_en: string;
  sku: string | null;
};

export type StoredComboSelection = {
  item_id: string;
  item_name_bn: string;
  item_name_en: string;
  quantity: number;
  variant_id: string | null;
  variant_label_bn: string;
  variant_label_en: string;
  sku: string | null;
};

/** Map of combo product id -> its child items (ordered). */
export async function loadComboChildren(db: AnyDb, comboProductIds: string[]) {
  const map = new Map<string, ComboChild[]>();
  if (!comboProductIds.length) return map;

  const { data } = await db
    .from("combo_items")
    .select(
      "combo_id, item_id, quantity, sort_order, label_bn, label_en, item:products!combo_items_item_id_fkey(id, name_bn, name_en)",
    )
    .in("combo_id", comboProductIds)
    .order("sort_order", { ascending: true });

  for (const row of (data ?? []) as any[]) {
    const child: ComboChild = {
      itemId: row.item_id,
      nameBn: row.label_bn || row.item?.name_bn || "",
      nameEn: row.label_en || row.item?.name_en || row.item?.name_bn || "",
      quantity: Number(row.quantity ?? 1),
      sortOrder: Number(row.sort_order ?? 0),
    };
    const list = map.get(row.combo_id) ?? [];
    list.push(child);
    map.set(row.combo_id, list);
  }
  return map;
}

/**
 * Builds the stored combo_selections payload: every child of the combo, with
 * the selected variant label where the customer picked one.
 */
export function buildComboSelections(
  children: ComboChild[] | undefined,
  selections: Array<{ itemId: string; variantId: string; quantity?: number }>,
  variants: VariantRow[],
): StoredComboSelection[] {
  const pickFor = (itemId: string) => selections.find((s) => s.itemId === itemId);

  if (!children?.length) {
    // Fallback: no combo definition available, keep whatever was selected.
    return selections.flatMap((selection) => {
      const v = variants.find((c) => c.id === selection.variantId);
      if (!v) return [];
      return [{
        item_id: selection.itemId,
        item_name_bn: "",
        item_name_en: "",
        quantity: Number(selection.quantity ?? 1),
        variant_id: v.id,
        variant_label_bn: `${v.group_name_bn}: ${v.value_bn}`,
        variant_label_en: `${v.group_name_en}: ${v.value_en}`,
        sku: v.sku ?? null,
      }];
    });
  }

  return children
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((child) => {
      const picked = pickFor(child.itemId);
      const variant = picked
        ? variants.find((v) => v.id === picked.variantId && v.product_id === child.itemId)
        : undefined;
      return {
        item_id: child.itemId,
        item_name_bn: child.nameBn,
        item_name_en: child.nameEn,
        quantity: Number(picked?.quantity ?? child.quantity ?? 1),
        variant_id: variant?.id ?? null,
        variant_label_bn: variant ? `${variant.group_name_bn}: ${variant.value_bn}` : "",
        variant_label_en: variant ? `${variant.group_name_en}: ${variant.value_en}` : "",
        sku: variant?.sku ?? null,
      };
    });
}
