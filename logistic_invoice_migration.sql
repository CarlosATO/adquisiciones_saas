-- ============================================================
-- MIGRACIÓN: Facturas Logísticas Directas (Sin OC)
-- Ejecutar en Supabase SQL Editor ANTES del deploy
-- ============================================================

-- Agregar identificador interno para diferenciar facturas logísticas
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS internal_id VARCHAR(50);

-- Índice para búsquedas rápidas por prefijo LOG-
CREATE INDEX IF NOT EXISTS idx_expenses_internal_id ON public.expenses(internal_id);
