-- 1. Agregar la columna po_number a la tabla purchase_orders
-- Primero verificamos si ya existe, si no, la agregamos
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS po_number integer;

-- 2. Crear una función para generar el correlativo por empresa
CREATE OR REPLACE FUNCTION set_purchase_order_number()
RETURNS TRIGGER AS $$
DECLARE
    next_number integer;
BEGIN
    -- Obtener el número máximo actual para esta empresa y sumarle 1
    -- Usamos COALESCE para que si es NULL (no hay órdenes para la empresa), empiece en 1
    SELECT COALESCE(MAX(po_number), 0) + 1 
    INTO next_number
    FROM public.purchase_orders 
    WHERE company_id = NEW.company_id;

    -- Asignar el nuevo número generado a la fila que se está insertando
    NEW.po_number := next_number;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Crear el Trigger que ejecutará la función antes de cada INSERT en purchase_orders
-- Primero lo eliminamos si existe para evitar errores al volver a correr el script
DROP TRIGGER IF EXISTS trigger_set_purchase_order_number ON public.purchase_orders;

CREATE TRIGGER trigger_set_purchase_order_number
BEFORE INSERT ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION set_purchase_order_number();

-- 4. Opcional: Actualizar las órdenes de compra existentes para que tengan un po_number
-- Este paso asignará números correlativos a las órdenes que ya existan en la base de datos
DO $$
DECLARE
    empresa_id uuid;
    orden_id uuid;
    contador integer;
BEGIN
    FOR empresa_id IN SELECT DISTINCT company_id FROM public.purchase_orders LOOP
        contador := 1;
        FOR orden_id IN SELECT id FROM public.purchase_orders WHERE company_id = empresa_id ORDER BY created_at ASC LOOP
            UPDATE public.purchase_orders SET po_number = contador WHERE id = orden_id AND po_number IS NULL;
            contador := contador + 1;
        END LOOP;
    END LOOP;
END;
$$;
