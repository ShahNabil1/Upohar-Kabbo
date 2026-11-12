-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'user');
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned');
CREATE TYPE public.promotion_type AS ENUM ('offer', 'featured', 'flash', 'new_arrival');

-- ============ shared updated_at ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CATEGORIES ============
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_bn TEXT,
  description_en TEXT,
  image_url TEXT,
  icon_key TEXT,
  meta_title TEXT,
  meta_description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active categories" ON public.categories FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SUBCATEGORIES ============
CREATE TABLE public.subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_bn TEXT,
  description_en TEXT,
  image_url TEXT,
  meta_title TEXT,
  meta_description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);
GRANT SELECT ON public.subcategories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcategories TO authenticated;
GRANT ALL ON public.subcategories TO service_role;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active subcategories" ON public.subcategories FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage subcategories" ON public.subcategories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_subcategories_updated BEFORE UPDATE ON public.subcategories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  subcategory_id UUID REFERENCES public.subcategories(id) ON DELETE SET NULL,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  short_description_bn TEXT,
  short_description_en TEXT,
  description_bn TEXT,
  description_en TEXT,
  specs JSONB NOT NULL DEFAULT '[]'::jsonb,
  faq JSONB NOT NULL DEFAULT '[]'::jsonb,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  compare_at_price NUMERIC(10,2) CHECK (compare_at_price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sku TEXT UNIQUE,
  brand TEXT,
  badge_bn TEXT,
  badge_en TEXT,
  rating NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_subcategory ON public.products(subcategory_id);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active products" ON public.products FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PRODUCT VARIANTS ============
CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  group_name_bn TEXT NOT NULL,
  group_name_en TEXT NOT NULL,
  value_bn TEXT NOT NULL,
  value_en TEXT NOT NULL,
  sku TEXT,
  price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_variants_product ON public.product_variants(product_id);
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read variants" ON public.product_variants FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage variants" ON public.product_variants FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_variants_updated BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PRODUCT IMAGES ============
CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  r2_key TEXT,
  alt_bn TEXT,
  alt_en TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_images_product ON public.product_images(product_id);
GRANT SELECT ON public.product_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read images" ON public.product_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage images" ON public.product_images FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ LANDING PAGES ============
CREATE TABLE public.landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  headline_bn TEXT,
  headline_en TEXT,
  subheadline_bn TEXT,
  subheadline_en TEXT,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.landing_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_pages TO authenticated;
GRANT ALL ON public.landing_pages TO service_role;
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active landing pages" ON public.landing_pages FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage landing pages" ON public.landing_pages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_landing_updated BEFORE UPDATE ON public.landing_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PROMOTIONS ============
CREATE TABLE public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title_bn TEXT NOT NULL,
  title_en TEXT NOT NULL,
  subtitle_bn TEXT,
  subtitle_en TEXT,
  type public.promotion_type NOT NULL DEFAULT 'offer',
  banner_url TEXT,
  meta_title TEXT,
  meta_description TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  show_on_home BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.promotions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active promotions" ON public.promotions FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage promotions" ON public.promotions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_promotions_updated BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.promotion_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (promotion_id, product_id)
);
GRANT SELECT ON public.promotion_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_products TO authenticated;
GRANT ALL ON public.promotion_products TO service_role;
ALTER TABLE public.promotion_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read promotion products" ON public.promotion_products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage promotion products" ON public.promotion_products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE DEFAULT ('ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  delivery_area TEXT,
  note TEXT,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cod',
  status public.order_status NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'website',
  invoice_r2_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own orders" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage orders" ON public.orders FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_slug TEXT,
  variant_label TEXT,
  sku TEXT,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own order items" ON public.order_items FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
);
CREATE POLICY "Admins manage order items" ON public.order_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ FAQS ============
CREATE TABLE public.faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_bn TEXT NOT NULL,
  question_en TEXT NOT NULL,
  answer_bn TEXT NOT NULL,
  answer_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.faqs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faqs TO authenticated;
GRANT ALL ON public.faqs TO service_role;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active faqs" ON public.faqs FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage faqs" ON public.faqs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_faqs_updated BEFORE UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SITE SETTINGS ============
CREATE TABLE public.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read settings" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage settings" ON public.site_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SEED DATA ============
INSERT INTO public.categories (id, slug, name_bn, name_en, description_bn, description_en, image_url, sort_order, meta_title, meta_description) VALUES
('11111111-1111-4111-8111-111111111101', 'panjabi', 'পাঞ্জাবি', 'Panjabi', 'উৎসব ও দৈনন্দিন ব্যবহারের জন্য আরামদায়ক পাঞ্জাবি।', 'Comfortable panjabi for festivals and daily wear.', 'https://images.unsplash.com/photo-1622470953794-aa9c70b0fb9d?w=1200&q=80', 1, 'পাঞ্জাবি কালেকশন', 'সেরা মানের পাঞ্জাবি — ক্যাশ অন ডেলিভারিতে সারা বাংলাদেশে।'),
('11111111-1111-4111-8111-111111111102', 'shari', 'শাড়ি', 'Shari', 'হাতে বোনা ও তাঁতের শাড়ির নির্বাচিত সংগ্রহ।', 'Curated handloom and cotton shari collection.', 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1200&q=80', 2, 'শাড়ি কালেকশন', 'তাঁত, জামদানি ও সুতি শাড়ি — সরাসরি তাঁতির কাছ থেকে।'),
('11111111-1111-4111-8111-111111111103', 'accessories', 'অ্যাকসেসরিজ', 'Accessories', 'পোশাকের সাথে মানানসই অ্যাকসেসরিজ।', 'Accessories that complete your look.', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=1200&q=80', 3, 'অ্যাকসেসরিজ', 'ব্যাগ, স্কার্ফ ও গয়না — হাতে বাছাই করা।');

INSERT INTO public.subcategories (id, category_id, slug, name_bn, name_en, sort_order) VALUES
('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101', 'cotton-panjabi', 'সুতি পাঞ্জাবি', 'Cotton Panjabi', 1),
('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111101', 'silk-panjabi', 'সিল্ক পাঞ্জাবি', 'Silk Panjabi', 2),
('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111102', 'jamdani', 'জামদানি', 'Jamdani', 1),
('22222222-2222-4222-8222-222222222204', '11111111-1111-4111-8111-111111111102', 'tangail-tant', 'টাঙ্গাইল তাঁত', 'Tangail Tant', 2),
('22222222-2222-4222-8222-222222222205', '11111111-1111-4111-8111-111111111103', 'bags', 'ব্যাগ', 'Bags', 1),
('22222222-2222-4222-8222-222222222206', '11111111-1111-4111-8111-111111111103', 'jewellery', 'গয়না', 'Jewellery', 2);

INSERT INTO public.products (id, slug, category_id, subcategory_id, name_bn, name_en, short_description_bn, short_description_en, description_bn, description_en, price, compare_at_price, stock, sku, brand, rating, review_count, is_featured, sort_order, specs, faq) VALUES
('33333333-3333-4333-8333-333333333301', 'nilaboni-cotton-panjabi', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201', 'নীলাবনী সুতি পাঞ্জাবি', 'Nilaboni Cotton Panjabi', 'হালকা সুতি কাপড়, সারাদিন আরামদায়ক।', 'Lightweight cotton, comfortable all day.', 'নীলাবনী পাঞ্জাবিটি ১০০% সুতি কাপড়ে তৈরি। গরমেও আরাম দেবে, আর ধোয়ার পরেও রঙ থাকবে অটুট।', 'The Nilaboni panjabi is made from 100% cotton. It stays breathable in heat and holds its colour wash after wash.', 1490, 1990, 40, 'PNJ-COT-001', 'Nilaboni', 4.7, 128, true, 1, '[{"k_bn":"কাপড়","k_en":"Fabric","v_bn":"১০০% সুতি","v_en":"100% Cotton"},{"k_bn":"ফিট","k_en":"Fit","v_bn":"রেগুলার","v_en":"Regular"}]', '[{"q_bn":"ধোয়ার পর কি রঙ যাবে?","q_en":"Will the colour fade after wash?","a_bn":"না, ঠান্ডা পানিতে ধুলে রঙ অটুট থাকে।","a_en":"No, the colour holds when washed in cold water."}]'),
('33333333-3333-4333-8333-333333333302', 'meghdut-cotton-panjabi', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201', 'মেঘদূত সুতি পাঞ্জাবি', 'Meghdut Cotton Panjabi', 'মিনিমাল ডিজাইন, অফিস ও উৎসব দুটোতেই।', 'Minimal design for office and festival.', 'মেঘদূত পাঞ্জাবিতে আছে সংযত এমব্রয়ডারি আর নরম সুতি কাপড়।', 'Meghdut features restrained embroidery on soft cotton.', 1690, 2190, 32, 'PNJ-COT-002', 'Nilaboni', 4.6, 86, true, 2, '[{"k_bn":"কাপড়","k_en":"Fabric","v_bn":"সুতি","v_en":"Cotton"}]', '[]'),
('33333333-3333-4333-8333-333333333303', 'rajanigandha-silk-panjabi', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222202', 'রজনীগন্ধা সিল্ক পাঞ্জাবি', 'Rajanigandha Silk Panjabi', 'উৎসবের জন্য রাজকীয় সিল্ক।', 'Regal silk for festive days.', 'রজনীগন্ধা সিল্ক পাঞ্জাবি বিশেষ দিনের জন্য — হালকা ঝলমলে ফিনিশ আর নিখুঁত সেলাই।', 'Rajanigandha silk panjabi is made for special days with a subtle sheen and precise tailoring.', 2890, 3690, 18, 'PNJ-SLK-001', 'Nilaboni', 4.8, 54, true, 3, '[{"k_bn":"কাপড়","k_en":"Fabric","v_bn":"সিল্ক","v_en":"Silk"}]', '[]'),
('33333333-3333-4333-8333-333333333304', 'ononto-silk-panjabi', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222202', 'অনন্ত সিল্ক পাঞ্জাবি', 'Ononto Silk Panjabi', 'গাঢ় রঙে ক্লাসিক সিল্ক।', 'Classic silk in deep tones.', 'অনন্ত সিল্ক পাঞ্জাবির গাঢ় রঙ আর মসৃণ ফিনিশ যেকোনো আয়োজনে আলাদা করে তুলবে।', 'Deep tones and a smooth finish make Ononto stand out at any gathering.', 3190, NULL, 12, 'PNJ-SLK-002', 'Nilaboni', 4.5, 31, false, 4, '[]', '[]'),
('33333333-3333-4333-8333-333333333305', 'dhakai-jamdani-shari', '11111111-1111-4111-8111-111111111102', '22222222-2222-4222-8222-222222222203', 'ঢাকাই জামদানি শাড়ি', 'Dhakai Jamdani Shari', 'হাতে বোনা খাঁটি ঢাকাই জামদানি।', 'Authentic handwoven Dhakai jamdani.', 'ঢাকাই জামদানি শাড়িটি রূপগঞ্জের তাঁতিদের হাতে বোনা। প্রতিটি নকশা সম্পূর্ণ হাতে তোলা।', 'Handwoven by artisans of Rupganj, every motif on this jamdani is lifted entirely by hand.', 6900, 8500, 9, 'SHR-JMD-001', 'Tantghor', 4.9, 72, true, 1, '[{"k_bn":"কাপড়","k_en":"Fabric","v_bn":"সুতি জামদানি","v_en":"Cotton Jamdani"}]', '[{"q_bn":"শাড়ির দৈর্ঘ্য কত?","q_en":"What is the length?","a_bn":"১২ হাত, ব্লাউজ পিসসহ।","a_en":"12 hands, blouse piece included."}]'),
('33333333-3333-4333-8333-333333333306', 'nokshi-jamdani-shari', '11111111-1111-4111-8111-111111111102', '22222222-2222-4222-8222-222222222203', 'নকশি জামদানি শাড়ি', 'Nokshi Jamdani Shari', 'ঐতিহ্যবাহী নকশায় বোনা।', 'Woven in traditional motifs.', 'নকশি জামদানি শাড়িতে ফুটে উঠেছে পুরনো দিনের নকশা, আধুনিক রঙে।', 'Nokshi jamdani brings age-old motifs into a modern palette.', 5400, 6900, 14, 'SHR-JMD-002', 'Tantghor', 4.7, 41, false, 2, '[]', '[]'),
('33333333-3333-4333-8333-333333333307', 'tangail-tant-shari', '11111111-1111-4111-8111-111111111102', '22222222-2222-4222-8222-222222222204', 'টাঙ্গাইল তাঁতের শাড়ি', 'Tangail Tant Shari', 'দৈনন্দিন ব্যবহারের হালকা তাঁত।', 'Light tant for everyday wear.', 'টাঙ্গাইলের তাঁতে বোনা এই শাড়ি হালকা, আরামদায়ক আর সারাদিন পরার উপযোগী।', 'Woven on Tangail looms, this shari is light, breathable and made for all-day wear.', 2450, 2990, 25, 'SHR-TNT-001', 'Tantghor', 4.6, 96, true, 3, '[]', '[]'),
('33333333-3333-4333-8333-333333333308', 'sonali-tant-shari', '11111111-1111-4111-8111-111111111102', '22222222-2222-4222-8222-222222222204', 'সোনালি তাঁতের শাড়ি', 'Sonali Tant Shari', 'সোনালি পাড়ে ক্লাসিক তাঁত।', 'Classic tant with golden border.', 'সোনালি পাড়ের এই তাঁতের শাড়ি অনুষ্ঠানের জন্য একদম মানানসই।', 'The golden border makes this tant shari perfect for occasions.', 2890, NULL, 20, 'SHR-TNT-002', 'Tantghor', 4.4, 38, false, 4, '[]', '[]'),
('33333333-3333-4333-8333-333333333309', 'jute-tote-bag', '11111111-1111-4111-8111-111111111103', '22222222-2222-4222-8222-222222222205', 'পাটের টোট ব্যাগ', 'Jute Tote Bag', 'পরিবেশবান্ধব, মজবুত পাটের ব্যাগ।', 'Eco-friendly, sturdy jute bag.', 'দেশি পাট দিয়ে তৈরি এই টোট ব্যাগ বাজার থেকে অফিস — সবখানেই সঙ্গী।', 'Made from local jute, this tote goes from market to office with ease.', 890, 1200, 60, 'ACC-BAG-001', 'Deshi Craft', 4.5, 143, true, 1, '[]', '[]'),
('33333333-3333-4333-8333-333333333310', 'leather-sling-bag', '11111111-1111-4111-8111-111111111103', '22222222-2222-4222-8222-222222222205', 'লেদার স্লিং ব্যাগ', 'Leather Sling Bag', 'আসল চামড়ার কমপ্যাক্ট স্লিং।', 'Compact genuine leather sling.', 'আসল চামড়ায় তৈরি কমপ্যাক্ট স্লিং ব্যাগ — প্রয়োজনীয় সবকিছু হাতের নাগালে।', 'A compact genuine leather sling that keeps essentials within reach.', 2290, 2790, 22, 'ACC-BAG-002', 'Deshi Craft', 4.6, 57, false, 2, '[]', '[]'),
('33333333-3333-4333-8333-333333333311', 'silver-jhumka', '11111111-1111-4111-8111-111111111103', '22222222-2222-4222-8222-222222222206', 'রুপার ঝুমকা', 'Silver Jhumka', 'হাতে গড়া রুপার ঝুমকা।', 'Handcrafted silver jhumka.', 'হাতে গড়া এই রুপার ঝুমকা যেকোনো শাড়ির সাথে দারুণ মানায়।', 'This handcrafted silver jhumka pairs beautifully with any shari.', 1650, 1990, 35, 'ACC-JWL-001', 'Deshi Craft', 4.8, 89, true, 3, '[]', '[]'),
('33333333-3333-4333-8333-333333333312', 'terracotta-necklace', '11111111-1111-4111-8111-111111111103', '22222222-2222-4222-8222-222222222206', 'টেরাকোটা নেকলেস', 'Terracotta Necklace', 'মাটির গয়নার ঐতিহ্য।', 'The tradition of clay jewellery.', 'হাতে তৈরি টেরাকোটা নেকলেস — হালকা, আরামদায়ক আর একদম আলাদা।', 'Handmade terracotta necklace — light, comfortable and distinctly different.', 750, 990, 48, 'ACC-JWL-002', 'Deshi Craft', 4.3, 64, false, 4, '[]', '[]');

INSERT INTO public.product_images (product_id, url, alt_bn, alt_en, sort_order) VALUES
('33333333-3333-4333-8333-333333333301', 'https://images.unsplash.com/photo-1622470953794-aa9c70b0fb9d?w=1200&q=80', 'নীলাবনী সুতি পাঞ্জাবি', 'Nilaboni Cotton Panjabi', 0),
('33333333-3333-4333-8333-333333333301', 'https://images.unsplash.com/photo-1603252109303-2751441dd157?w=1200&q=80', 'নীলাবনী পাঞ্জাবির বিস্তারিত', 'Nilaboni panjabi detail', 1),
('33333333-3333-4333-8333-333333333302', 'https://images.unsplash.com/photo-1603252109303-2751441dd157?w=1200&q=80', 'মেঘদূত সুতি পাঞ্জাবি', 'Meghdut Cotton Panjabi', 0),
('33333333-3333-4333-8333-333333333303', 'https://images.unsplash.com/photo-1594938291221-94f18cbb5660?w=1200&q=80', 'রজনীগন্ধা সিল্ক পাঞ্জাবি', 'Rajanigandha Silk Panjabi', 0),
('33333333-3333-4333-8333-333333333304', 'https://images.unsplash.com/photo-1521369909029-2afed882baee?w=1200&q=80', 'অনন্ত সিল্ক পাঞ্জাবি', 'Ononto Silk Panjabi', 0),
('33333333-3333-4333-8333-333333333305', 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1200&q=80', 'ঢাকাই জামদানি শাড়ি', 'Dhakai Jamdani Shari', 0),
('33333333-3333-4333-8333-333333333306', 'https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=1200&q=80', 'নকশি জামদানি শাড়ি', 'Nokshi Jamdani Shari', 0),
('33333333-3333-4333-8333-333333333307', 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=1200&q=80', 'টাঙ্গাইল তাঁতের শাড়ি', 'Tangail Tant Shari', 0),
('33333333-3333-4333-8333-333333333308', 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=1200&q=80', 'সোনালি তাঁতের শাড়ি', 'Sonali Tant Shari', 0),
('33333333-3333-4333-8333-333333333309', 'https://images.unsplash.com/photo-1591561954557-26941169b49e?w=1200&q=80', 'পাটের টোট ব্যাগ', 'Jute Tote Bag', 0),
('33333333-3333-4333-8333-333333333310', 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=1200&q=80', 'লেদার স্লিং ব্যাগ', 'Leather Sling Bag', 0),
('33333333-3333-4333-8333-333333333311', 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=1200&q=80', 'রুপার ঝুমকা', 'Silver Jhumka', 0),
('33333333-3333-4333-8333-333333333312', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=1200&q=80', 'টেরাকোটা নেকলেস', 'Terracotta Necklace', 0);

INSERT INTO public.product_variants (product_id, group_name_bn, group_name_en, value_bn, value_en, stock, sort_order) VALUES
('33333333-3333-4333-8333-333333333301', 'সাইজ', 'Size', 'এম', 'M', 15, 1),
('33333333-3333-4333-8333-333333333301', 'সাইজ', 'Size', 'এল', 'L', 15, 2),
('33333333-3333-4333-8333-333333333301', 'সাইজ', 'Size', 'এক্সএল', 'XL', 10, 3),
('33333333-3333-4333-8333-333333333303', 'সাইজ', 'Size', 'এম', 'M', 6, 1),
('33333333-3333-4333-8333-333333333303', 'সাইজ', 'Size', 'এল', 'L', 12, 2);

INSERT INTO public.promotions (id, slug, title_bn, title_en, subtitle_bn, subtitle_en, type, sort_order) VALUES
('44444444-4444-4444-8444-444444444401', 'eid-offer', 'ঈদ অফার', 'Eid Offer', 'নির্বাচিত পণ্যে ২৫% পর্যন্ত ছাড়', 'Up to 25% off on selected items', 'offer', 1),
('44444444-4444-4444-8444-444444444402', 'best-sellers', 'বেস্ট সেলার', 'Best Sellers', 'সবচেয়ে বেশি বিক্রি হওয়া পণ্য', 'Our most loved products', 'featured', 2);

INSERT INTO public.promotion_products (promotion_id, product_id, sort_order) VALUES
('44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333301', 1),
('44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333305', 2),
('44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333309', 3),
('44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333311', 4),
('44444444-4444-4444-8444-444444444402', '33333333-3333-4333-8333-333333333303', 1),
('44444444-4444-4444-8444-444444444402', '33333333-3333-4333-8333-333333333307', 2),
('44444444-4444-4444-8444-444444444402', '33333333-3333-4333-8333-333333333302', 3),
('44444444-4444-4444-8444-444444444402', '33333333-3333-4333-8333-333333333312', 4);

INSERT INTO public.landing_pages (product_id, slug, headline_bn, headline_en, subheadline_bn, subheadline_en) VALUES
('33333333-3333-4333-8333-333333333301', 'nilaboni-panjabi-offer', 'এই ঈদে নীলাবনী পাঞ্জাবি', 'Nilaboni Panjabi This Eid', 'সীমিত সময়ের জন্য ২৫% ছাড়, ক্যাশ অন ডেলিভারি', '25% off for a limited time, cash on delivery'),
('33333333-3333-4333-8333-333333333305', 'dhakai-jamdani-offer', 'খাঁটি ঢাকাই জামদানি', 'Authentic Dhakai Jamdani', 'সরাসরি তাঁতির কাছ থেকে, মাঝখানে কেউ নেই', 'Straight from the weaver, no middleman');

INSERT INTO public.faqs (question_bn, question_en, answer_bn, answer_en, sort_order) VALUES
('ডেলিভারি কতদিনে পাবো?', 'How long does delivery take?', 'ঢাকার ভিতরে ১-২ দিন, ঢাকার বাইরে ২-৪ দিন।', 'Inside Dhaka 1-2 days, outside Dhaka 2-4 days.', 1),
('ডেলিভারি চার্জ কত?', 'What is the delivery charge?', 'ঢাকার ভিতরে ৭০ টাকা, ঢাকার বাইরে ১৩০ টাকা।', 'Tk 70 inside Dhaka, Tk 130 outside Dhaka.', 2),
('পেমেন্ট কীভাবে করবো?', 'How do I pay?', 'পণ্য হাতে পেয়ে ডেলিভারিম্যানকে টাকা দেবেন — ক্যাশ অন ডেলিভারি।', 'Pay the delivery person when you receive the product — cash on delivery.', 3),
('পণ্য পছন্দ না হলে ফেরত দেওয়া যাবে?', 'Can I return a product?', 'হ্যাঁ, পণ্য হাতে পাওয়ার ৩ দিনের মধ্যে অক্ষত অবস্থায় ফেরত দেওয়া যাবে।', 'Yes, within 3 days of receiving, in unused condition.', 4),
('অর্ডার করতে কি অ্যাকাউন্ট লাগে?', 'Do I need an account to order?', 'না, অ্যাকাউন্ট ছাড়াই অর্ডার করা যাবে।', 'No, you can order without an account.', 5);

INSERT INTO public.site_settings (key, value) VALUES
('brand', '{"name_bn":"তাঁতঘর","name_en":"Tantghor","tagline_bn":"দেশি তাঁতের সেরা সংগ্রহ","tagline_en":"The finest of local looms","phone":"+8801700000000","email":"hello@tantghor.com","address_bn":"১২/এ, ধানমন্ডি, ঢাকা ১২০৯","address_en":"12/A, Dhanmondi, Dhaka 1209"}'),
('hero', '{"eyebrow_bn":"নতুন সংগ্রহ","eyebrow_en":"New arrivals","title_bn":"তাঁতির হাতে বোনা, আপনার ঘরে","title_en":"Woven by hand, delivered to your door","subtitle_bn":"সারা বাংলাদেশে ক্যাশ অন ডেলিভারি। পণ্য দেখে টাকা দিন।","subtitle_en":"Cash on delivery across Bangladesh. Pay after you see it.","image_url":"https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1600&q=80"}'),
('delivery', '{"inside_dhaka":70,"outside_dhaka":130}');