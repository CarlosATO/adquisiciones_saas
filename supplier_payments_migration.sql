-- ============================================================
-- MIGRACIÓN: Módulo Cuentas por Pagar
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Tabla de pagos/abonos a facturas de proveedor
CREATE TABLE IF NOT EXISTS public.supplier_payments (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id       UUID NOT NULL,
    expense_id       UUID REFERENCES public.expenses(id),
    amount           NUMERIC(15,2) NOT NULL,
    payment_date     DATE NOT NULL,
    payment_method   VARCHAR(50),  -- TRANSFERENCIA, EFECTIVO, CHEQUE, TARJETA
    reference_number VARCHAR(100), -- N° comprobante o cheque
    notes            TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by       UUID
);

-- 2. Agregar control de saldo a expenses
--    (reutilizamos expenses.status existente: PENDING_PAYMENT → PARTIAL_PAYMENT → PAID)
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) DEFAULT 0;
