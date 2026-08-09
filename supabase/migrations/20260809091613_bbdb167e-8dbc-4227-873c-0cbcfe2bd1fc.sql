
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_challan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_stock(uuid, integer, public.movement_type, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_challan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, integer, public.movement_type, text) TO authenticated;
