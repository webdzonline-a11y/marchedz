# نشر Marché DZ على الإنترنت / Deployment

## لماذا لا يعمل على Vercel؟
Vercel مخصّص للمواقع الثابتة والدوال المؤقتة (serverless). هذا المتجر **خادم Node.js دائم التشغيل** يحتاج إلى:
- قاعدة بيانات SQLite تُحفظ على **قرص دائم** (في Vercel يُمسح القرص بعد كل طلب)،
- حفظ الصور والإيصالات المرفوعة،
- مهام خلفية: إلغاء الطلبات المعلّقة المنتهية وتحرير المخزون، ومزامنة الشحنات.

لذلك نشر Vercel مجلد `public` فقط كصفحات ثابتة: `{{JSONLD}}` تظهر كما هي، وكل طلبات `/api` ترجع 404، فتظهر صفحة «الصفحة غير موجودة».
الحل: انشر المشروع على منصّة تشغّل خادمًا دائمًا مع **قرص دائم** باستعمال ملف `Dockerfile` الجاهز.

> المجلد `/data` يجب أن يكون **Volume / Disk دائم**: فيه قاعدة البيانات والإيصالات والنسخ الاحتياطية والصور المرفوعة. بدونه تضيع كل البيانات عند كل إعادة نشر.

---

## الخيار 1 — Railway (الأسهل، ≈ 5$ شهريًا)
1. ارفع المشروع إلى GitHub (نفس المستودع الذي ربطته بـ Vercel يكفي).
2. ادخل إلى railway.com ← **New Project** ← **Deploy from GitHub repo** ← اختر المستودع. سيكتشف `Dockerfile` تلقائيًا.
3. من الخدمة: **Settings ← Volumes ← Add Volume**، واجعل **Mount path = `/data`**.
4. من **Variables** أضف:
   - `ADMIN_EMAIL` = بريدك
   - `ADMIN_PASSWORD` = كلمة مرور قوية (تُستعمل عند أول تشغيل فقط)
   - (اختياري للبريد) `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
5. **Settings ← Networking ← Generate Domain** لتحصل على رابط https، أو اربط نطاقك الخاص.
6. افتح `https://رابطك/admin` وسجّل الدخول.

## الخيار 2 — Render
1. render.com ← **New ← Blueprint** ← اختر المستودع؛ سيقرأ ملف `render.yaml` (خدمة Docker + قرص 1GB على `/data`).
2. أدخل قيم `ADMIN_EMAIL` و `ADMIN_PASSWORD` عند الطلب.
3. ملاحظة: القرص الدائم في Render يتطلّب خطة مدفوعة (Starter). الخطة المجانية تمسح البيانات وتنام بعد الخمول.

## الخيار 3 — خادم VPS خاص (Hetzner / Contabo / DigitalOcean …)
```bash
# على الخادم (Ubuntu) بعد تثبيت Docker
git clone <your-repo> marche-dz && cd marche-dz
docker build -t marche-dz .
docker run -d --name marche-dz --restart unless-stopped \
  -p 3000:3000 -v marche_data:/data \
  -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='StrongPass#2026' \
  marche-dz
```
ثم ضع أمامه **Caddy** أو **Nginx** لتفعيل HTTPS، مثلًا بـ Caddy:
```
votre-domaine.dz {
  reverse_proxy 127.0.0.1:3000
}
```
بدون Docker: `npm ci --omit=dev` ثم `NODE_ENV=production DATA_DIR=/var/lib/marche UPLOADS_DIR=/var/lib/marche/uploads node server/index.js` تحت systemd أو pm2.

---

## متغيّرات مهمّة
| المتغيّر | القيمة في Docker | الوظيفة |
|---|---|---|
| `NODE_ENV` | `production` | كوكيز آمنة + HSTS، وإخفاء رموز التحقق التجريبية |
| `DATA_DIR` | `/data` | قاعدة البيانات، الإيصالات، النسخ الاحتياطية |
| `UPLOADS_DIR` | `/data/uploads` | صور المنتجات والتصنيفات والشعار المرفوعة من لوحة التحكم (صور المنتجات التجريبية مضمّنة في الصورة) |
| `PORT` | تضبطه المنصّة تلقائيًا | منفذ HTTP |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | حساب المدير الأول (عند أول تشغيل فقط) |
| `SMTP_*` | — | إرسال رموز تأكيد البريد واستعادة كلمة المرور |

## بعد النشر مباشرة
1. غيّر كلمة مرور المدير إن استعملت الافتراضية، واحذف أو عدّل الحساب التجريبي `demo@marchedz.dz`.
2. أدخل أسعار الشحن، وبيانات CCP، وسعر الدولار من لوحة التحكم.
3. اضبط SMTP حتى يستطيع العملاء تأكيد البريد واستعادة كلمة المرور.
4. خذ نسخة احتياطية من **Admin ← النسخ الاحتياطية**، وانسخ مجلد `/data` دوريًا خارج الخادم.
