-- Temporary shared-access mode: every signed-in user can manage ERP data.
-- Authentication is still required; anonymous visitors have no access.

DROP POLICY IF EXISTS "sales manage customers" ON public.customers;
CREATE POLICY "authenticated users manage customers" ON public.customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sales manage followups" ON public.follow_ups;
CREATE POLICY "authenticated users manage followups" ON public.follow_ups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "warehouse manage products" ON public.products;
CREATE POLICY "authenticated users manage products" ON public.products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "warehouse add movements" ON public.stock_movements;
CREATE POLICY "authenticated users manage stock movements" ON public.stock_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sales manage challans" ON public.challans;
CREATE POLICY "authenticated users manage challans" ON public.challans
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sales manage challan items" ON public.challan_items;
CREATE POLICY "authenticated users manage challan items" ON public.challan_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "accounts manage invoices" ON public.invoices;
CREATE POLICY "authenticated users manage invoices" ON public.invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.confirm_challan(_challan_id uuid)
RETURNS public.challans LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ch public.challans;
  it record;
  available integer;
BEGIN
  SELECT * INTO ch FROM public.challans WHERE id = _challan_id FOR UPDATE;
  IF ch.id IS NULL THEN RAISE EXCEPTION 'Challan not found'; END IF;
  IF ch.status <> 'draft' THEN RAISE EXCEPTION 'Only draft challans can be confirmed'; END IF;

  FOR it IN SELECT * FROM public.challan_items WHERE challan_id = _challan_id LOOP
    SELECT current_stock INTO available FROM public.products WHERE id = it.product_id FOR UPDATE;
    IF available IS NULL THEN RAISE EXCEPTION 'Product % no longer exists', it.product_name; END IF;
    IF available < it.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for % (available %, required %)', it.product_name, available, it.quantity;
    END IF;
    UPDATE public.products SET current_stock = current_stock - it.quantity WHERE id = it.product_id;
    INSERT INTO public.stock_movements (product_id, quantity, movement_type, reason, created_by)
    VALUES (it.product_id, it.quantity, 'out', 'Challan ' || ch.challan_number, auth.uid());
  END LOOP;

  UPDATE public.challans SET status = 'confirmed' WHERE id = _challan_id RETURNING * INTO ch;
  RETURN ch;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_stock(_product_id uuid, _quantity integer, _type public.movement_type, _reason text)
RETURNS public.products LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products;
BEGIN
  IF _quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  SELECT * INTO p FROM public.products WHERE id = _product_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF _type = 'out' AND p.current_stock < _quantity THEN
    RAISE EXCEPTION 'Insufficient stock: available %, requested %', p.current_stock, _quantity;
  END IF;
  UPDATE public.products
    SET current_stock = current_stock + CASE WHEN _type = 'in' THEN _quantity ELSE -_quantity END
    WHERE id = _product_id RETURNING * INTO p;
  INSERT INTO public.stock_movements (product_id, quantity, movement_type, reason, created_by)
  VALUES (_product_id, _quantity, _type, _reason, auth.uid());
  RETURN p;
END;
$$;
