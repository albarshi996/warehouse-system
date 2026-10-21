# ═══════════════════════════════════════════════════════════════════════════
#  حاويةُ المزامنة — Node + عميلُ psql، ولا شيءَ غيرَهما
# ═══════════════════════════════════════════════════════════════════════════
#
#  ★ لا سائقَ `pg`: المزامنةُ تولّد SQL وتمرّره إلى `psql`، تمامًا كما يفعل
#    `scripts/pg-import.mjs`. فلا تبعيّةَ جديدةً في `package.json`، ونمطُ
#    الكتابة واحدٌ في الأداتين.
#
#  ★★ والصورةُ تُبنى من جذر المستودع (`context: ..`) لأنّ المزامنة تقرأ
#     `firestore.rules` — وهي مصدرُ المسارات و«الملحقة-فقط». وقراءتُها من
#     الملفّ الحيّ تعني أنّ مجموعةً تُضاف غدًا تدخل الخطّةَ بلا تعديلِ كود.
# ═══════════════════════════════════════════════════════════════════════════
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# الحزمُ أوّلًا كي تُخزَّن طبقتُها ولا تُعاد عند كلّ تغييرِ كود.
COPY package.json package-lock.json ./
# firebase وحدَها هي المطلوبة وقتَ التشغيل؛ والباقي أدواتُ بناءٍ للبوّابة.
RUN npm ci --omit=dev --ignore-scripts

COPY firestore.rules ./firestore.rules
COPY scripts/firestore-serialize.mjs ./scripts/firestore-serialize.mjs
COPY db/sync ./db/sync

# مستخدمٌ غيرُ جذرٍ — الحاويةُ تقرأ سحابةً وتكتب قاعدةً، ولا تحتاج جذرًا.
USER node

CMD ["node", "db/sync/sync.mjs"]
