# نشر SKYTRACE

جزئين: **الباك إند** (FastAPI، بورت 8000) و**الفرونت** (Next.js، بورت 3000). الفرونت بيحكي مع الباك إند
عن طريق `NEXT_PUBLIC_API_BASE_URL`.

## تشغيل كل شي محلياً بـ Docker

```bash
docker compose up --build
```

بعدها افتح http://localhost:3000. الافتراضي بيانات تجريبية (mock). للبيانات الحقيقية:

```bash
DATA_SOURCE=real docker compose up --build
```

> ما جربنا الـ Docker على جهازنا لأنه مش منزّل. **للتسليم منستعمل Render + Vercel بدون Docker** (تحت).

## الإعدادات

| المتغير | وين | الافتراضي | شو بيعمل |
|---|---|---|---|
| `DATA_SOURCE` | باك إند | `mock` | `real` = صور SPHEREx حقيقية من IRSA |
| `CORS_ORIGINS` | باك إند | `http://localhost:3000,...` | عنوان موقع الفرونت (مفصولة بفاصلة) |
| `CACHE_DIR` | باك إند | `backend/.cache` | مكان الكاش (بحث، صور، ملفات المعايرة) |
| `PORT` | باك إند (Docker) | `8000` | البورت |
| `NEXT_PUBLIC_API_BASE_URL` | فرونت (وقت الـ build) | `http://localhost:8000` | عنوان الباك إند |
| `NEXT_PUBLIC_SITE_URL` | فرونت (وقت الـ build) | `http://localhost:3000` | عنوان الموقع (للـ metadata) |

قيم `NEXT_PUBLIC_*` بتنحط **وقت البناء**: إذا تغيّر عنوان الباك إند لازم نعيد بناء الفرونت.

## قبل العرض بالبيانات الحقيقية

IRSA أحياناً بطيء أو بيرجّع 503، وأول تحميل لكل صورة بياخد 5 لـ 30 ثانية. عشان هيك منسخّن الكاش مسبقاً:

```bash
cd backend
python scripts/download_spectral_wcs.py   # ملفات المعايرة CWAVE/CBAND (~33 MB لكل detector)
python scripts/prefetch_demo.py           # صور أهداف الديمو
```

بالـ Docker: شغّلهم جوا الكونتينر (`docker compose exec api python scripts/prefetch_demo.py`)، والكاش بينحفظ
بالـ volume `skytrace-cache` وما بيروح لما نعيد التشغيل.

## النشر للتسليم: Render (الباك إند، مجاني) + Vercel (الفرونت، مجاني)

بدون Docker: نفس الأوامر اللي جربناها على الجهاز. الإعدادات بـ [`render.yaml`](../render.yaml).

**1. الباك إند على Render**
1. Render → **New → Blueprint** → اختاري الريبو `Planet-X-and-SPHEREx`. بيقرأ `render.yaml` لحاله:
   - build: `pip install -r backend/requirements.txt`
   - start: `uvicorn --app-dir backend app.main:app --host 0.0.0.0 --port $PORT`
   - `DATA_SOURCE=real`، `WARM_ON_START=true`، Python 3.12.
2. `CORS_ORIGINS` بيضل فاضي لحد ما نعرف عنوان Vercel (خطوة 3).
3. بعد ما يخلص: `https://<اسم-الخدمة>.onrender.com/api/health` لازم يرجّع `"data_source":"real"`.

**2. الفرونت على Vercel**
1. Vercel → **Add New → Project** → الريبو → **Root Directory = `frontend`** (Next.js بيتعرّف لحاله).
2. Environment Variables:
   - `NEXT_PUBLIC_API_BASE_URL` = عنوان Render (بدون `/` بالآخر)
   - `NEXT_PUBLIC_SITE_URL` = عنوان Vercel نفسه (بعد أول نشر، وبعدين Redeploy)
3. Deploy.

**3. ربطهم**
- على Render: `CORS_ORIGINS` = عنوان Vercel بالضبط (مثلاً `https://skytrace.vercel.app`)، وبعدين Manual Deploy.
- لو بدنا روابط الـ preview تبعت Vercel كمان: `CORS_ORIGIN_REGEX` = `^https://skytrace.*\.vercel\.app$`.

**حدود Render المجاني (لازم نعرفها قبل العرض)**
- **بينام بعد ~15 دقيقة** بدون زوار، وأول طلب بعدها بياخد **حوالي دقيقة** ليصحى.
- **بيمسح الكاش** لما ينام أو يعيد التشغيل. لهيك `WARM_ON_START=true`: لما يصحى بيحمّل صور الأهداف والقصص ورحلات
  فيستا و 3I/ATLAS بالخلفية (بتبيّن بالـ log كـ `== (4) Vesta ...`).
- **قبل العرض بـ 10 دقائق:** افتحي `/api/health` ليصحى، واستني لحد ما الـ log يخلّص التسخين.
- اختياري: خدمة "ping" مجانية (مثلاً cron-job.org أو UptimeRobot) تفتح `/api/health` كل 10 دقائق، عشان ما ينام.

## الاستضافة

- **الباك إند** بيحتاج سيرفر Python دائم مع ديسك للكاش (مثلاً Render، Railway، Fly.io، أو VPS). الكاش
  ممكن يكبر لمئات الـ MB.
- **الفرونت** ممكن ينحط على Vercel أو أي استضافة Node، مع `NEXT_PUBLIC_API_BASE_URL` = عنوان الباك إند.
- لا تنسى تحط عنوان الفرونت الحقيقي بـ `CORS_ORIGINS`، وإلا المتصفح رح يرفض الطلبات.

## فحص سريع بعد النشر

```bash
curl https://API/api/targets          # لازم يرجع 6 أهداف (mock) أو أهداف الديمو (real)
```
