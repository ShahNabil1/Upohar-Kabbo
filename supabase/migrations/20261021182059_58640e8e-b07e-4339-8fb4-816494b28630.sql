UPDATE public.sms_templates SET variables = '["name","order_no","amount","phone","receipt_url","address","items"]'::jsonb WHERE key IN ('order_confirm','shipped');
INSERT INTO public.sms_templates (key, name, body, category, variables, is_system, enabled, sort_order)
SELECT * FROM (VALUES
('order_cancelled','Order cancelled','প্রিয় {{name}}, আপনার অর্ডার {{order_no}} বাতিল করা হয়েছে। কোনো প্রশ্ন থাকলে আমাদের সাথে যোগাযোগ করুন — উপহারকাব্য','transactional','["name","order_no","amount","phone","receipt_url","address","items"]'::jsonb,true,true,5),
('pre_order','Pre-order placed','প্রিয় {{name}}, আপনার প্রি-অর্ডার {{order_no}} গ্রহণ করা হয়েছে। পণ্য: {{items}}। মোট: {{amount}} টাকা। স্টকে আসলেই পাঠানো হবে — উপহারকাব্য','transactional','["name","order_no","amount","phone","receipt_url","address","items"]'::jsonb,true,true,6),
('scheduled_order','Scheduled order','প্রিয় {{name}}, আপনার অর্ডার {{order_no}} {{scheduled_date}} তারিখে পাঠানোর জন্য নির্ধারিত হয়েছে। পণ্য: {{items}}। মোট: {{amount}} টাকা — উপহারকাব্য','transactional','["name","order_no","amount","phone","receipt_url","address","items","scheduled_date"]'::jsonb,true,true,7)
) v(key,name,body,category,variables,is_system,enabled,sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.sms_templates t WHERE t.key = v.key);