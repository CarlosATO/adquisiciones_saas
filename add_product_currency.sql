-- Migración para añadir campos de moneda a la tabla de productos
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS currency_purchase VARCHAR(10) DEFAULT 'CLP',
ADD COLUMN IF NOT EXISTS currency_sale VARCHAR(10) DEFAULT 'CLP';
