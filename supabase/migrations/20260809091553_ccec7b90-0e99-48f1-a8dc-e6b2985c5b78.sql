
-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin','sales','warehouse','accounts');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "roles readable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE requested public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  BEGIN
    requested := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'sales');
  EXCEPTION WHEN others THEN requested := 'sales';
  END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, requested)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- CUSTOMERS
CREATE TYPE public.customer_type AS ENUM ('retail','wholesale','distributor');
CREATE TYPE public.customer_status AS ENUM ('lead','active','inactive');

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mobile text NOT NULL,
  email text,
  business_name text,
  gst_number text,
  customer_type public.customer_type NOT NULL DEFAULT 'retail',
  address text,
  status public.customer_status NOT NULL DEFAULT 'lead',
  follow_up_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers readable" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales manage customers" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  note text NOT NULL,
  next_follow_up date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followups readable" ON public.follow_ups FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales manage followups" ON public.follow_ups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'admin'));

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text NOT NULL UNIQUE,
  category text,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  current_stock integer NOT NULL DEFAULT 0,
  min_stock_alert integer NOT NULL DEFAULT 0,
  location text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products readable" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "warehouse manage products" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TYPE public.movement_type AS ENUM ('in','out');
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  movement_type public.movement_type NOT NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movements readable" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "warehouse add movements" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin'));

-- CHALLANS
CREATE TYPE public.challan_status AS ENUM ('draft','confirmed','cancelled');
CREATE SEQUENCE public.challan_seq START 1001;

CREATE TABLE public.challans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number text NOT NULL UNIQUE DEFAULT ('CH-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.challan_seq')::text, 5, '0')),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_quantity integer NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  status public.challan_status NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challans TO authenticated;
GRANT ALL ON public.challans TO service_role;
ALTER TABLE public.challans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challans readable" ON public.challans FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales manage challans" ON public.challans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER challans_touch BEFORE UPDATE ON public.challans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.challan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id uuid NOT NULL REFERENCES public.challans(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challan_items TO authenticated;
GRANT ALL ON public.challan_items TO service_role;
ALTER TABLE public.challan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challan items readable" ON public.challan_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales manage challan items" ON public.challan_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'admin'));

-- INVOICES
CREATE TYPE public.invoice_status AS ENUM ('unpaid','paid','cancelled');
CREATE SEQUENCE public.invoice_seq START 5001;
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE DEFAULT ('INV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 5, '0')),
  challan_id uuid REFERENCES public.challans(id) ON DELETE SET NULL,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_percent numeric(5,2) NOT NULL DEFAULT 18,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'unpaid',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices readable" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "accounts manage invoices" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'accounts') OR public.has_role(auth.uid(),'admin'));

-- CONFIRM CHALLAN (atomic stock deduction)
CREATE OR REPLACE FUNCTION public.confirm_challan(_challan_id uuid)
RETURNS public.challans LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ch public.challans;
  it record;
  available integer;
BEGIN
  IF NOT (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only sales or admin users can confirm a challan';
  END IF;

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

-- ADJUST STOCK helper
CREATE OR REPLACE FUNCTION public.adjust_stock(_product_id uuid, _quantity integer, _type public.movement_type, _reason text)
RETURNS public.products LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products;
BEGIN
  IF NOT (public.has_role(auth.uid(),'warehouse') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only warehouse or admin users can adjust stock';
  END IF;
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

-- DEMO DATA
INSERT INTO public.products (name, sku, category, unit_price, current_stock, min_stock_alert, location) VALUES
('Basmati Rice 25kg','SKU-RICE-25','Grocery',2150.00,140,20,'Warehouse A'),
('Refined Sunflower Oil 15L','SKU-OIL-15','Grocery',1780.00,64,15,'Warehouse A'),
('Detergent Powder 5kg','SKU-DET-05','Home Care',480.00,210,40,'Warehouse B'),
('Toothpaste 200g (Case of 24)','SKU-TP-24','Personal Care',1320.00,18,25,'Warehouse B'),
('Steel Water Bottle 1L','SKU-BTL-1L','Utensils',260.00,320,50,'Warehouse C'),
('LED Bulb 9W (Pack of 10)','SKU-LED-10','Electrical',640.00,9,20,'Warehouse C');

INSERT INTO public.customers (name, mobile, email, business_name, gst_number, customer_type, address, status, follow_up_date, notes) VALUES
('Rahul Mehta','9876543210','rahul@sharmatraders.in','Sharma Traders','27AABCU9603R1ZM','wholesale','12 MG Road, Pune, MH','active', CURRENT_DATE + 3,'Buys rice and oil monthly.'),
('Anita Desai','9812345678','anita@desaistores.com','Desai Stores','24AAACD1234E1Z5','retail','7 Station Road, Surat, GJ','lead', CURRENT_DATE + 1,'Requested price list.'),
('Vikram Singh','9900112233','vikram@northdist.in','North Distributors','07AAGCN4567P1Z2','distributor','221 Karol Bagh, New Delhi','active', CURRENT_DATE + 10,'Large volume distributor.'),
('Priya Nair','9745001122','priya@nairmart.in','Nair Mart',NULL,'retail','Kochi, KL','inactive', NULL,'Dormant since last quarter.');
