-- Remove default and drop both views
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
DROP VIEW IF EXISTS retailer_revenue;
DROP VIEW IF EXISTS delivery_earnings;

-- Update order_status enum to match delivery lifecycle
DO $$ BEGIN
  ALTER TYPE order_status RENAME TO order_status_old;
  CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'ready_for_pickup', 'assigned', 'picked_up', 'delivering', 'delivered', 'completed', 'cancelled');
  ALTER TABLE orders ALTER COLUMN status TYPE order_status USING status::text::order_status;
  DROP TYPE order_status_old;
END $$;

-- Restore default
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending'::order_status;

-- Recreate retailer_revenue view
CREATE OR REPLACE VIEW retailer_revenue AS
SELECT 
  s.id AS store_id,
  s.name AS store_name,
  s.owner_id,
  count(o.id) AS total_orders,
  count(CASE WHEN o.status = 'delivered'::order_status THEN 1 ELSE NULL::integer END) AS completed_orders,
  sum(CASE WHEN o.payment_status = 'paid'::text THEN o.paid_amount ELSE 0::numeric END) AS total_revenue,
  sum(CASE WHEN o.payment_status = 'paid'::text AND o.status = 'delivered'::order_status THEN o.paid_amount ELSE 0::numeric END) AS confirmed_revenue
FROM stores s
LEFT JOIN orders o ON o.store_id = s.id
GROUP BY s.id, s.name, s.owner_id;

-- Recreate delivery_earnings view
CREATE OR REPLACE VIEW delivery_earnings AS
SELECT 
  p.id AS delivery_person_id,
  p.full_name,
  count(o.id) AS total_deliveries,
  count(CASE WHEN o.status = 'delivered'::order_status THEN 1 ELSE NULL::integer END) AS completed_deliveries,
  sum(CASE WHEN o.status = 'delivered'::order_status THEN o.delivery_earning ELSE 0::numeric END) AS total_earnings
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN orders o ON o.delivery_person_id = p.id
WHERE ur.role = 'delivery_person'::app_role
GROUP BY p.id, p.full_name;

-- Create delivery_history table for audit trail
CREATE TABLE IF NOT EXISTS public.delivery_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_person_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.delivery_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery users can view own history"
  ON public.delivery_history FOR SELECT
  USING (delivery_person_id = auth.uid() OR EXISTS (
    SELECT 1 FROM orders WHERE orders.id = delivery_history.order_id 
    AND (orders.customer_id = auth.uid() OR orders.delivery_person_id = auth.uid())
  ));

-- Create order_rejections table to prevent re-offering
CREATE TABLE IF NOT EXISTS public.order_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_person_id UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT,
  rejected_at TIMESTAMPTZ DEFAULT now(),
  reofferable_after TIMESTAMPTZ DEFAULT (now() + interval '30 minutes'),
  UNIQUE(order_id, delivery_person_id)
);

ALTER TABLE public.order_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery users can create rejections"
  ON public.order_rejections FOR INSERT
  WITH CHECK (delivery_person_id = auth.uid());

CREATE POLICY "Users can view relevant rejections"
  ON public.order_rejections FOR SELECT
  USING (delivery_person_id = auth.uid());

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_status_delivery ON orders(status, delivery_person_id) WHERE delivery_person_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_location ON orders(delivery_lat, delivery_lon) WHERE status = 'ready_for_pickup';

-- Function to log delivery actions
CREATE OR REPLACE FUNCTION log_delivery_action()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
    INSERT INTO delivery_history (order_id, delivery_person_id, action, note)
    VALUES (NEW.id, NEW.delivery_person_id, 
            'Status changed to ' || NEW.status, 
            'From ' || OLD.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for automatic delivery history logging
DROP TRIGGER IF EXISTS log_delivery_status_changes ON orders;
CREATE TRIGGER log_delivery_status_changes
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION log_delivery_action();

-- Add realtime for delivery_history
ALTER PUBLICATION supabase_realtime ADD TABLE delivery_history;