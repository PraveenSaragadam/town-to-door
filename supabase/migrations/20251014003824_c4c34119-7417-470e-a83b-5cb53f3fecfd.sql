-- Update product_category enum to match the categories in the UI
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'vegetables';
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'fruits';
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'dairy';
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'bakery';
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'snacks';
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'beverages';