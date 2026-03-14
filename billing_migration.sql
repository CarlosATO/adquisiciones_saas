-- Migración: Módulo de Facturación en Adquisiciones
-- Agrega control de billing a purchase_orders y referencia a PO en expenses

ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) DEFAULT 'NOT_BILLED';
-- Valores posibles: NOT_BILLED, BILLED

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES public.purchase_orders(id),
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id),
ADD COLUMN IF NOT EXISTS document_number VARCHAR,
ADD COLUMN IF NOT EXISTS due_date DATE,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING_PAYMENT';
-- status valores: PENDING_PAYMENT, PAID
