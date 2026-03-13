-- Migración para añadir campos avanzados a la tabla de productos (Logística y Compras)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS internal_reference VARCHAR(100), -- SKU del proveedor o interno
ADD COLUMN IF NOT EXISTS product_type VARCHAR(50) DEFAULT 'STORABLE', -- STORABLE, CONSUMABLE, SERVICE
ADD COLUMN IF NOT EXISTS can_be_purchased BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_be_sold BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS weight NUMERIC(10,2), -- Peso en kg
ADD COLUMN IF NOT EXISTS volume NUMERIC(10,3), -- Volumen en m3
ADD COLUMN IF NOT EXISTS supplier_lead_time INTEGER DEFAULT 0, -- Plazo de entrega en días
ADD COLUMN IF NOT EXISTS purchase_notes TEXT, -- Notas que irán en la Orden de Compra
ADD COLUMN IF NOT EXISTS receipt_notes TEXT; -- Alertas para el bodeguero al recibir
