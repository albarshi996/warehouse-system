-- ═══════════════════════════════════════════════════════════════════════════
--  أدوارُ اعتماد المستندات وإنجازها — **ملفٌّ مولَّد، لا يُحرَّر بيد**
--  المصدر: firestore.rules  ·  المولّد: node scripts/gen-doc-roles.mjs
--  والحارس: src/services/documents/docRolesSql.test.js (يُسقط npm test عند الانحراف)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS doc_type_roles (
  doc_type       text PRIMARY KEY,
  approve_roles  text[] NOT NULL,
  complete_roles text[] NOT NULL
);
ALTER TABLE doc_type_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_type_roles_read ON doc_type_roles;
CREATE POLICY doc_type_roles_read ON doc_type_roles FOR SELECT TO web_user USING (signed_in());
GRANT SELECT ON doc_type_roles TO web_user;

-- ★ يُستبدل كاملًا في كلّ توليد: نوعٌ حُذف من القواعد يجب أن يختفي هنا أيضًا،
--   وإلّا بقي دورٌ يعتمد مستندًا لم يعد له وجود.
TRUNCATE doc_type_roles;
INSERT INTO doc_type_roles (doc_type, approve_roles, complete_roles) VALUES
  ('ADJ', ARRAY['finance_manager', 'warehouse_manager']::text[], ARRAY['warehouse_manager', 'finance_manager']::text[]),
  ('CC', ARRAY['inventory_auditor', 'warehouse_manager']::text[], ARRAY['inventory_auditor', 'warehouse_manager']::text[]),
  ('CN', ARRAY['finance_manager', 'warehouse_manager']::text[], ARRAY['finance_manager', 'warehouse_manager']::text[]),
  ('CRN', ARRAY['sales_supervisor', 'warehouse_manager', 'return_manager']::text[], ARRAY['sales_rep', 'sales_supervisor']::text[]),
  ('CTR', ARRAY['warehouse_manager', 'labor_supervisor']::text[], ARRAY['labor_supervisor', 'warehouse_manager']::text[]),
  ('DLV', ARRAY['department_user', 'warehouse_manager']::text[], ARRAY['purchase_officer', 'warehouse_manager']::text[]),
  ('DMG', ARRAY['qc_inspector', 'warehouse_manager']::text[], ARRAY['return_manager', 'warehouse_manager']::text[]),
  ('DN', ARRAY['warehouse_manager']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('GP', ARRAY['gate_officer', 'warehouse_manager']::text[], ARRAY['gate_officer', 'warehouse_manager']::text[]),
  ('GRN', ARRAY['qc_inspector', 'warehouse_manager']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('INV', ARRAY['finance_manager', 'warehouse_manager']::text[], ARRAY['finance_manager', 'warehouse_manager']::text[]),
  ('IPO', ARRAY['finance_manager', 'warehouse_manager']::text[], ARRAY['purchase_officer', 'warehouse_manager']::text[]),
  ('IPR', ARRAY['finance_manager', 'warehouse_manager']::text[], ARRAY['purchase_officer', 'warehouse_manager']::text[]),
  ('MIS', ARRAY['executive_chef', 'warehouse_manager']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('PACK', ARRAY['qc_inspector', 'warehouse_manager']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('PICK', ARRAY['warehouse_manager']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('PO', ARRAY['warehouse_manager', 'finance_manager']::text[], ARRAY['purchase_officer', 'warehouse_manager']::text[]),
  ('POD', ARRAY['warehouse_manager', 'fleet']::text[], ARRAY['fleet', 'warehouse_manager']::text[]),
  ('PR', ARRAY['warehouse_manager', 'purchase_officer']::text[], ARRAY['purchase_officer', 'warehouse_manager']::text[]),
  ('PRC', ARRAY['executive_chef', 'warehouse_manager']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('PRO', ARRAY['executive_chef', 'warehouse_manager']::text[], ARRAY['executive_chef', 'warehouse_manager']::text[]),
  ('PUTAWAY', ARRAY['warehouse_manager', 'inventory_auditor']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('PV', ARRAY['finance_manager', 'warehouse_manager']::text[], ARRAY['treasury', 'warehouse_manager']::text[]),
  ('QC', ARRAY['qc_inspector', 'warehouse_manager']::text[], ARRAY['qc_inspector', 'warehouse_manager']::text[]),
  ('RCP', ARRAY['finance_manager', 'warehouse_manager']::text[], ARRAY['treasury', 'finance_manager', 'warehouse_manager']::text[]),
  ('RCV', ARRAY['sales_supervisor', 'finance_manager', 'warehouse_manager']::text[], ARRAY['sales_supervisor', 'finance_manager', 'warehouse_manager']::text[]),
  ('RET', ARRAY['qc_inspector', 'warehouse_manager']::text[], ARRAY['return_manager', 'warehouse_manager']::text[]),
  ('RFQ', ARRAY['finance_manager', 'warehouse_manager']::text[], ARRAY['purchase_officer', 'warehouse_manager']::text[]),
  ('SO', ARRAY['warehouse_manager']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('SPV', ARRAY['finance_manager', 'warehouse_manager']::text[], ARRAY['treasury', 'finance_manager', 'warehouse_manager']::text[]),
  ('SRN', ARRAY['qc_inspector', 'warehouse_manager']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('TDR', ARRAY['warehouse_manager']::text[], ARRAY['warehouse_manager']::text[]),
  ('TR', ARRAY['warehouse_manager']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('TRC', ARRAY['warehouse_manager']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('TRN', ARRAY['warehouse_manager']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('VCD', ARRAY['sales_supervisor', 'warehouse_manager']::text[], ARRAY['sales_rep', 'sales_supervisor']::text[]),
  ('VCR', ARRAY['sales_supervisor', 'warehouse_manager', 'return_manager']::text[], ARRAY['sales_rep', 'sales_supervisor']::text[]),
  ('VCS', ARRAY['sales_rep', 'sales_supervisor']::text[], ARRAY['sales_rep', 'sales_supervisor']::text[]),
  ('VLD', ARRAY['warehouse_manager', 'sales_supervisor']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('VRT', ARRAY['warehouse_manager', 'sales_supervisor']::text[], ARRAY['storekeeper', 'warehouse_manager']::text[]),
  ('VSI', ARRAY['sales_rep', 'sales_supervisor']::text[], ARRAY['sales_rep', 'sales_supervisor']::text[]),
  ('VSR', ARRAY['sales_supervisor', 'warehouse_manager']::text[], ARRAY['sales_supervisor', 'warehouse_manager']::text[]);

INSERT INTO schema_migrations (version) VALUES ('010-doc-roles')
  ON CONFLICT (version) DO NOTHING;
