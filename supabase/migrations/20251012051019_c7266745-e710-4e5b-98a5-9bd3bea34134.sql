-- Add payment tracking and delivery earnings to orders
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS delivery_earning NUMERIC DEFAULT 0;

-- Add product images support (storing array of URLs)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for product images
CREATE POLICY "Anyone can view product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "Retailers can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Retailers can update own product images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'product-images' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Retailers can delete own product images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-images' 
    AND auth.role() = 'authenticated'
  );

-- Create view for retailer revenue summary
CREATE OR REPLACE VIEW retailer_revenue AS
SELECT 
  s.id as store_id,
  s.name as store_name,
  s.owner_id,
  COUNT(o.id) as total_orders,
  COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) as completed_orders,
  SUM(CASE WHEN o.payment_status = 'paid' THEN o.paid_amount ELSE 0 END) as total_revenue,
  SUM(CASE WHEN o.payment_status = 'paid' AND o.status = 'delivered' THEN o.paid_amount ELSE 0 END) as confirmed_revenue
FROM public.stores s
LEFT JOIN public.orders o ON o.store_id = s.id
GROUP BY s.id, s.name, s.owner_id;

-- Grant access to the view
GRANT SELECT ON retailer_revenue TO authenticated;

-- Create view for delivery person earnings
CREATE OR REPLACE VIEW delivery_earnings AS
SELECT 
  p.id as delivery_person_id,
  p.full_name,
  COUNT(o.id) as total_deliveries,
  COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) as completed_deliveries,
  SUM(CASE WHEN o.status = 'delivered' THEN o.delivery_earning ELSE 0 END) as total_earnings
FROM public.profiles p
INNER JOIN public.user_roles ur ON ur.user_id = p.id
LEFT JOIN public.orders o ON o.delivery_person_id = p.id
WHERE ur.role = 'delivery_person'
GROUP BY p.id, p.full_name;

-- Grant access to the view
GRANT SELECT ON delivery_earnings TO authenticated;