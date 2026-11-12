CREATE TABLE public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE,
  name text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_templates TO authenticated;
GRANT ALL ON public.sms_templates TO service_role;

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sms templates"
ON public.sms_templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE TRIGGER trg_sms_templates_updated
BEFORE UPDATE ON public.sms_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sms_templates (key, name, body, category, variables, is_system, sort_order) VALUES
('order_confirm', 'Order confirmation', 'প্রিয় {{name}}, আপনার অর্ডার {{order_no}} কনফার্ম হয়েছে। মোট: {{amount}} টাকা। ধন্যবাদ — উপহারকাব্য', 'transactional', '["name","order_no","amount","receipt_url","phone"]'::jsonb, true, 1),
('no_response', 'No response follow-up', 'প্রিয় {{name}}, আপনার অর্ডার {{order_no}} নিশ্চিত করতে আমরা কল করেছি কিন্তু পাইনি। কল ব্যাক করুন — উপহারকাব্য', 'reminder', '["name","order_no","amount","receipt_url","phone"]'::jsonb, true, 2),
('shipped', 'Order shipped', 'প্রিয় {{name}}, আপনার অর্ডার {{order_no}} কুরিয়ারে পাঠানো হয়েছে। ইনভয়েস: {{receipt_url}}', 'transactional', '["name","order_no","amount","receipt_url","phone"]'::jsonb, true, 3),
('delivery_today', 'Delivery today', 'প্রিয় {{name}}, আজ আপনার পার্সেল {{order_no}} ডেলিভারি হবে। অনুগ্রহ করে ফোন খোলা রাখুন।', 'reminder', '["name","order_no","amount","receipt_url","phone"]'::jsonb, true, 4);