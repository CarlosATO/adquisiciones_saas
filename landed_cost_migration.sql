-- ============================================================
-- MIGRACIÓN: Landed Costs (Costos en Destino)
-- Ejecutar en Supabase SQL Editor ANTES del deploy
-- ============================================================

CREATE TABLE IF NOT EXISTS public.landed_cost_allocations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL,
    expense_id  UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
    receipt_id  UUID REFERENCES public.inventory_receipts(id) ON DELETE CASCADE,
    allocated_amount NUMERIC(15,2) NOT NULL CHECK (allocated_amount > 0),
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by  UUID
);

CREATE INDEX IF NOT EXISTS idx_lca_expense_id  ON public.landed_cost_allocations(expense_id);
CREATE INDEX IF NOT EXISTS idx_lca_receipt_id  ON public.landed_cost_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_lca_company_id  ON public.landed_cost_allocations(company_id);
