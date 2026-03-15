-- ============================================================
-- MIGRACIÓN: Flujo de Aprobaciones (Paso 1)
-- Ejecutar en Supabase SQL Editor ANTES del deploy
-- ============================================================

-- 1. Actualizar estados permitidos en purchase_orders
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('DRAFT', 'WAITING_APPROVAL', 'PENDING', 'PARTIAL', 'RECEIVED', 'CANCELLED'));

-- 2. Umbral de aprobación por empresa (0 = sin umbral, toda orden se confirma directo)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS po_approval_threshold NUMERIC(15,2) DEFAULT 0;

-- 3. Trazabilidad de aprobación en la orden
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approval_date TIMESTAMP WITH TIME ZONE;

-- Índice para consultar rápido las órdenes en espera
CREATE INDEX IF NOT EXISTS idx_po_waiting_approval
  ON public.purchase_orders(company_id, status)
  WHERE status = 'WAITING_APPROVAL';
