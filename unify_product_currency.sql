-- Migración para unificar la moneda en un solo campo para el producto
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'CLP';

-- Opcional: Migrar datos existentes si los hay
UPDATE products SET currency = currency_purchase WHERE currency_purchase IS NOT NULL;
