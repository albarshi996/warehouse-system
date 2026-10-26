-- ═══════════════════════════════════════════════════════════════════════════
--  أبوابُ كتابة المحلات (§5) — إنشاءُ المنشأة والمحل وإسنادُ العضويّة، مخوَّلةً.
--  لا INSERT مباشرٌ لدور الويب (018)؛ الكتابةُ بابُها دالّةٌ تتحقّق ثمّ تكتب.
-- ═══════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION create_organization(p_id text, p_name text) RETURNS text AS $$
BEGIN
  IF is_manager() IS NOT TRUE THEN RAISE EXCEPTION 'غير مخوَّل: إنشاءُ المنشأة للمديرين.'; END IF;
  IF btrim(coalesce(p_id, '')) = '' THEN RAISE EXCEPTION 'منشأة بلا معرّف.'; END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN RAISE EXCEPTION 'منشأة بلا اسم.'; END IF;
  IF EXISTS (SELECT 1 FROM organizations WHERE id = p_id) THEN RETURN p_id; END IF; -- القفز
  INSERT INTO organizations (id, name_ar) VALUES (p_id, p_name);
  RETURN p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION create_shop(p_id text, p_org text, p_name text, p_code text DEFAULT '') RETURNS text AS $$
BEGIN
  IF is_manager() IS NOT TRUE THEN RAISE EXCEPTION 'غير مخوَّل: إنشاءُ المحل للمديرين.'; END IF;
  IF btrim(coalesce(p_id, '')) = '' THEN RAISE EXCEPTION 'محل بلا معرّف.'; END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN RAISE EXCEPTION 'محل بلا اسم.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_org) THEN
    RAISE EXCEPTION 'منشأة غير موجودة: %.', p_org; -- بدل خطأ FK الخام
  END IF;
  IF EXISTS (SELECT 1 FROM shops WHERE id = p_id) THEN RETURN p_id; END IF;
  INSERT INTO shops (id, org_id, name_ar, code) VALUES (p_id, p_org, p_name, coalesce(p_code, ''));
  RETURN p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- إسنادُ عضويّة — upsert: يُضاف ويُحدَّث دورُه وحالتُه. التعطيلُ بـactive=false
-- لا بحذفٍ (يبقى الأثرُ المرجعيّ). «يُضاف ولا يُنتزع» بروح حارس الأدوار.
CREATE OR REPLACE FUNCTION set_shop_membership(
  p_user text, p_shop text, p_role text DEFAULT 'staff', p_active boolean DEFAULT true
) RETURNS void AS $$
BEGIN
  IF is_manager() IS NOT TRUE THEN RAISE EXCEPTION 'غير مخوَّل: إسنادُ العضويّة للمديرين.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE uid = p_user) THEN RAISE EXCEPTION 'مستخدم غير موجود: %.', p_user; END IF;
  IF NOT EXISTS (SELECT 1 FROM shops WHERE id = p_shop) THEN RAISE EXCEPTION 'محل غير موجود: %.', p_shop; END IF;

  INSERT INTO shop_memberships (user_uid, shop_id, shop_role, active)
    VALUES (p_user, p_shop, coalesce(nullif(p_role, ''), 'staff'), coalesce(p_active, true))
  ON CONFLICT (user_uid, shop_id)
    DO UPDATE SET shop_role = EXCLUDED.shop_role, active = EXCLUDED.active;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


REVOKE ALL ON FUNCTION create_organization(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_shop(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_shop_membership(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_organization(text, text) TO web_user;
GRANT EXECUTE ON FUNCTION create_shop(text, text, text, text) TO web_user;
GRANT EXECUTE ON FUNCTION set_shop_membership(text, text, text, boolean) TO web_user;


INSERT INTO schema_migrations (version) VALUES ('020-org-shops-write')
  ON CONFLICT (version) DO NOTHING;
