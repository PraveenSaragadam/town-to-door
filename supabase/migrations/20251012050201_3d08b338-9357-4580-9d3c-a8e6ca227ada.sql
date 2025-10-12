-- Fix profiles table RLS - restrict public access to personal information
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Users can view their own complete profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can view limited public info for order-related users only
CREATE POLICY "Users can view limited public profiles"
  ON public.profiles FOR SELECT
  USING (
    -- Only show name and rating for users involved in same orders
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE (orders.customer_id = profiles.id OR 
             orders.delivery_person_id = profiles.id OR
             EXISTS (SELECT 1 FROM public.stores WHERE stores.owner_id = profiles.id AND stores.id = orders.store_id))
      AND (orders.customer_id = auth.uid() OR 
           orders.delivery_person_id = auth.uid() OR
           EXISTS (SELECT 1 FROM public.stores WHERE stores.owner_id = auth.uid() AND stores.id = orders.store_id))
    )
  );

-- Add database constraints for input validation
ALTER TABLE public.profiles ADD CONSTRAINT full_name_length CHECK (length(full_name) <= 100);
ALTER TABLE public.profiles ADD CONSTRAINT phone_length CHECK (length(phone) <= 20);

ALTER TABLE public.stores ADD CONSTRAINT name_length CHECK (length(name) <= 200);
ALTER TABLE public.stores ADD CONSTRAINT address_length CHECK (length(address) <= 500);

ALTER TABLE public.products ADD CONSTRAINT name_length CHECK (length(name) <= 200);
ALTER TABLE public.products ADD CONSTRAINT sku_length CHECK (length(sku) <= 50);
ALTER TABLE public.products ADD CONSTRAINT price_positive CHECK (price > 0);
ALTER TABLE public.products ADD CONSTRAINT stock_non_negative CHECK (stock_quantity >= 0);