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

> ما جربنا الـ Docker على جهازنا لأنه مش منزّل. الملفات مكتوبة على الطريقة المعتادة، بس لازم تنجرب قبل أول نشر.

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

## الاستضافة

- **الباك إند** بيحتاج سيرفر Python دائم مع ديسك للكاش (مثلاً Render، Railway، Fly.io، أو VPS). الكاش
  ممكن يكبر لمئات الـ MB.
- **الفرونت** ممكن ينحط على Vercel أو أي استضافة Node، مع `NEXT_PUBLIC_API_BASE_URL` = عنوان الباك إند.
- لا تنسى تحط عنوان الفرونت الحقيقي بـ `CORS_ORIGINS`، وإلا المتصفح رح يرفض الطلبات.

## فحص سريع بعد النشر

```bash
curl https://API/api/targets          # لازم يرجع 6 أهداف (mock) أو أهداف الديمو (real)
```
