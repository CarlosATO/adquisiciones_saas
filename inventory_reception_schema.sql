-- Tablas para el flujo de Recepción e Inventario (SaaS)

-- 1. Cabecera de Recepción (Picking/Incoming Shipment)
CREATE TABLE IF NOT EXISTS inventory_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL,
    po_id UUID REFERENCES purchase_orders(id), 
    supplier_id UUID REFERENCES suppliers(id),
    receipt_number SERIAL,
    status VARCHAR(20) DEFAULT 'DONE', -- DRAFT, DONE, CANCELLED
    document_type VARCHAR(20), -- FACTURA, GUIA, etc
    document_number VARCHAR(50),
    notes TEXT, -- Para anomalías generales
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID
);

-- 2. Movimientos de Stock (Historial / Kardex)
-- Usaremos la tabla 'inventory_movements' que ya existe, pero aseguraremos que tenga los campos necesarios
-- O crearemos stock_moves si queremos separar Logística de POS. 
-- Según tu visión, prefiero usar 'inventory_movements' para que aparezca en el POS también.

ALTER TABLE inventory_movements 
ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES inventory_receipts(id),
ADD COLUMN IF NOT EXISTS batch_id UUID; 

-- 3. Actualizar purchase_order_items para seguimiento de recepciones
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS received_quantity NUMERIC(15,3) DEFAULT 0;

-- 4. Asegurar que la tabla products tiene stock_quantity (si no existe)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='products' AND COLUMN_NAME='stock_quantity') THEN
        ALTER TABLE products ADD COLUMN stock_quantity NUMERIC(15,3) DEFAULT 0;
    END IF;

-- 5. Actualizar los estados permitidos en purchase_orders (Permitir 'PARTIAL')
-- Primero eliminamos la constraint antigua y agregamos la nueva
DO $$ 
BEGIN 
    ALTER TABLE IF EXISTS purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
    ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check 
    CHECK (status = ANY (ARRAY['DRAFT'::text, 'PENDING'::text, 'PARTIAL'::text, 'RECEIVED'::text, 'CANCELLED'::text]));
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error al actualizar constraint de estados: %', SQLERRM;
END $$;
