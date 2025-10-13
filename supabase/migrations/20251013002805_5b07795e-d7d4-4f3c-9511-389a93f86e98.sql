-- Create function to reduce product stock
CREATE OR REPLACE FUNCTION reduce_product_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity - p_quantity
  WHERE id = p_product_id AND stock_quantity >= p_quantity;
END;
$$;

-- Create function to automatically assign delivery person based on location and availability
CREATE OR REPLACE FUNCTION assign_delivery_person(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_person_id UUID;
BEGIN
  -- Select a delivery person with 'delivery' role who has the least active orders
  SELECT ur.user_id INTO v_delivery_person_id
  FROM user_roles ur
  WHERE ur.role = 'delivery'
  ORDER BY (
    SELECT COUNT(*) 
    FROM orders o 
    WHERE o.delivery_person_id = ur.user_id 
    AND o.status IN ('picked_up', 'in_transit')
  ) ASC
  LIMIT 1;
  
  RETURN v_delivery_person_id;
END;
$$;

-- Create trigger to auto-assign delivery person when order is confirmed
CREATE OR REPLACE FUNCTION trigger_assign_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned_id UUID;
BEGIN
  -- Only auto-assign when order moves to 'confirmed' status and no delivery person assigned
  IF NEW.status = 'confirmed' AND NEW.delivery_person_id IS NULL THEN
    v_assigned_id := assign_delivery_person(NEW.id);
    IF v_assigned_id IS NOT NULL THEN
      NEW.delivery_person_id := v_assigned_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_order_confirmed
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION trigger_assign_delivery();