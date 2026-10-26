-- ═══════════════════════════════════════════════════════════════════════════
--  المنشأةُ والمحلات والعضويّات (§5) — الهيكلُ متعدّدُ المحلات، وصلاحيّةٌ مقيَّدةٌ
--  بالعضويّة: الموظّفُ يرى محلَّه وحده، والمديرُ يرى الكلّ.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ★★★ هذه أوّلُ صلاحيّةٍ **صفًّا صفًّا بالنطاق** في القاعدة (لا «كلُّ مصادَقٍ
--      يرى»): محلٌّ لا يراه إلّا أعضاؤه والمديرُ. والنطاقُ يُحسب بدوالّ
--      `SECURITY DEFINER` تتجاوز RLS لقراءة العضويّة — فلا تتعاود السياسةُ على
--      نفسها (نظيرُ `my_role()` في 006).
--
--  ⚠️ لا كتابةَ ويبٍ هنا (قراءةٌ فقط)؛ الإسنادُ خطوةٌ تالية ببابها ونقضِها.
-- ═══════════════════════════════════════════════════════════════════════════


CREATE TABLE organizations (
  id         text PRIMARY KEY CHECK (btrim(id) <> ''),
  name_ar    text NOT NULL CHECK (btrim(name_ar) <> ''),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  extra      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE shops (
  id         text PRIMARY KEY CHECK (btrim(id) <> ''),
  org_id     text NOT NULL REFERENCES organizations (id),
  code       text NOT NULL DEFAULT '',
  name_ar    text NOT NULL CHECK (btrim(name_ar) <> ''),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  extra      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX shops_org ON shops (org_id);
CREATE UNIQUE INDEX shops_code_unique ON shops (org_id, code) WHERE code <> '';

CREATE TABLE shop_memberships (
  user_uid   text NOT NULL REFERENCES users (uid),
  shop_id    text NOT NULL REFERENCES shops (id),
  shop_role  text NOT NULL DEFAULT 'staff',
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  extra      jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_uid, shop_id)
);
CREATE INDEX shop_memberships_shop ON shop_memberships (shop_id) WHERE active;


-- ───────────────────────────────────────────────────────────────────────────
--  دوالُّ النطاق — `SECURITY DEFINER` تتجاوز RLS لقراءة العضويّة، فلا تتعاود
--  السياسةُ على جداولها. `STABLE` تُحسب مرّةً لا لكلّ صفّ، و`search_path` مثبّت.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_shop_member(p_shop text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM shop_memberships
    WHERE user_uid = auth_uid() AND shop_id = p_shop AND active
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_org_member(p_org text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM shops s JOIN shop_memberships m ON m.shop_id = s.id
    WHERE s.org_id = p_org AND m.user_uid = auth_uid() AND m.active
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION is_shop_member(text), is_org_member(text) TO web_anon, web_user;


-- ───────────────────────────────────────────────────────────────────────────
--  RLS — القراءةُ مقيَّدةٌ بالنطاق.
--   • المنشأة: المديرُ، أو عضوُ محلٍّ فيها.
--   • المحل: المديرُ، أو عضوُه.
--   • العضويّة: المديرُ، أو صاحبُ السطر نفسُه (يرى عضويّاتِه هو).
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_read_scope ON organizations;
CREATE POLICY organizations_read_scope ON organizations
  FOR SELECT TO web_user USING (is_manager() OR is_org_member(id));
GRANT SELECT ON organizations TO web_user;

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shops_read_scope ON shops;
CREATE POLICY shops_read_scope ON shops
  FOR SELECT TO web_user USING (is_manager() OR is_shop_member(id));
GRANT SELECT ON shops TO web_user;

ALTER TABLE shop_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shop_memberships_read_self_or_manager ON shop_memberships;
CREATE POLICY shop_memberships_read_self_or_manager ON shop_memberships
  FOR SELECT TO web_user USING (is_manager() OR user_uid = auth_uid());
GRANT SELECT ON shop_memberships TO web_user;


-- ───────────────────────────────────────────────────────────────────────────
--  ★★★ الحارسُ الأخير — لا جدولَ بلا RLS.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'جداولٌ بلا RLS: % — كلُّ جدولٍ يُحرَس أو يُستثنى بقرارٍ مكتوب.', missing;
  END IF;
  RAISE NOTICE 'كلُّ جداول public محروسةٌ بـRLS بعد المحلات.';
END $$;


INSERT INTO schema_migrations (version) VALUES ('018-org-shops')
  ON CONFLICT (version) DO NOTHING;
