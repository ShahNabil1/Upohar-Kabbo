export type CategoryRow = {
  id: string;
  slug: string;
  name_bn: string;
  name_en: string;
  description_bn: string | null;
  description_en: string | null;
  image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
  show_in_header: boolean;
};

export type SubcategoryRow = {
  id: string;
  category_id: string;
  slug: string;
  name_bn: string;
  name_en: string;
  description_bn: string | null;
  description_en: string | null;
  image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  sort_order: number;
  is_active: boolean;
};

export type CategoryWithSubs = CategoryRow & { subcategories: SubcategoryRow[] };

export type SettingValue =
  | string
  | number
  | boolean
  | null
  | SettingValue[]
  | { [key: string]: SettingValue };

export type SettingsMap = Record<string, Record<string, SettingValue>>;

type Catalog = typeof import("./catalog.server");
export type HomeData = Awaited<ReturnType<Catalog["fetchHome"]>>;
export type CategoryPageData = NonNullable<Awaited<ReturnType<Catalog["fetchCategoryPage"]>>>;
export type SubcategoryPageData = NonNullable<Awaited<ReturnType<Catalog["fetchSubcategoryPage"]>>>;
export type ProductPageData = NonNullable<Awaited<ReturnType<Catalog["fetchProduct"]>>>;
export type PromotionPageData = NonNullable<Awaited<ReturnType<Catalog["fetchPromotion"]>>>;
export type PromotionListData = Awaited<ReturnType<Catalog["fetchPromotionList"]>>;
export type FaqData = Awaited<ReturnType<Catalog["fetchFaqs"]>>;
export type SearchData = Awaited<ReturnType<Catalog["fetchSearch"]>>;
export type LandingPageData = NonNullable<Awaited<ReturnType<Catalog["fetchLandingPage"]>>>;
export type ComboContentItem = ProductPageData["comboItems"][number];
