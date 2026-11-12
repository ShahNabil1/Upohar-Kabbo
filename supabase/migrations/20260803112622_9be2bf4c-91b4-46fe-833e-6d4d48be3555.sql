UPDATE public.site_settings SET value = jsonb_build_object(
  'name_bn','উপহারকাব্য',
  'name_en','Upoharkabbo',
  'tagline_bn','প্রতিটি উপলক্ষের গিফট কম্বো',
  'tagline_en','Gift combos for every occasion',
  'email','hello@upoharkabbo.com',
  'phone', COALESCE(value->>'phone','+8801700000000'),
  'address_bn', COALESCE(value->>'address_bn',''),
  'address_en', COALESCE(value->>'address_en','')
) WHERE key = 'brand';

UPDATE public.site_settings SET value = jsonb_build_object(
  'eyebrow_bn','নতুন গিফট কালেকশন',
  'eyebrow_en','New gift collection',
  'title_bn','উপহার হোক একটা কবিতার মতো',
  'title_en','Let every gift read like a poem',
  'subtitle_bn','যত্নে সাজানো গিফট কম্বো, সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।',
  'subtitle_en','Curated gift combos with cash on delivery across Bangladesh.',
  'image_url', COALESCE(value->>'image_url','')
) WHERE key = 'hero';