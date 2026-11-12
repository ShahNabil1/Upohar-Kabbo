ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'partial_delivered';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_return';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'unpaid';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'lost_damaged';