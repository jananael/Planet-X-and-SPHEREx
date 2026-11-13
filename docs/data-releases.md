# S2-T1: إصدارات بيانات SPHEREx المعتمدة (DR1 + QR3)

**المسؤولة:** جنى · **الحالة:** ✅ متحقق منه على بيانات حقيقية (2026-11-13) · **مراجعة علمية:** يزان

## القرار

بنستخدم إصدارين من IRSA مع بعض:

| الإصدار | الـ collection بـ IRSA | الفترة (من الكاش عنا) | المحتوى |
|---|---|---|---|
| **DR1** | `spherex_dr1` | 2025-05-05 → 2026-05-14 | Surveys 1–2، معاد معالجتهم (بدل QR2) |
| **QR3** | `spherex_qr3` | 2026-07-04 → 2026-09-22 | Quick Release 3 |

- **QR2 ما عاد موجود.** IRSA شالته وحطت DR1 مكانه، والكاش القديم تبعه بـ `*-qr2-era`.
- الفترتين **ما بيتداخلوا**، فما في صورة مكررة بين الإصدارين. البحث بيسأل الاثنين وبيدمج النتائج.

## الدليل إنهم متوافقين

فحصنا 1,344 رصد حقيقي بالكاش (4 مواقع بالسما، منها Mira و Barnard و WISE 0855)، و8 cutouts كاملة:

| الفحص | DR1 | QR3 | النتيجة |
|---|---|---|---|
| نسخة الـ pipeline من اسم الملف | `l2b-v27` (984) + `l2b_retry-v27` (7) | `l2b-v27` (353) | ✅ نفس النسخة |
| `VERSION` بالـ FITS header | `7.0.5` | `7.0.5` | ✅ نفس الـ software |
| `BUNIT` | `MJy / sr` | `MJy / sr` | ✅ نفس الوحدة |
| معايرة الطول الموجي | نفس ملفات `spectral_wcs_D1..D6` | نفسها | ✅ |
| مقياس البكسل | 6.15″ | 6.15″ | ✅ |

**تأكيد علمي (يزان):** DR1 أعاد معالجة Surveys 1–2 بنفس الـ pipeline والمعايرة تبعت QR3، فالخلط مسموح.
المهم نقارن **نسخة الـ pipeline والمعايرة**، مش اسم الإصدار.

## القاعدة بالكود

- الـ backend بيرجّع `release` (DR1/QR3) و `processing_version` (مثلاً `l2b-v27-2026-228`) مع كل رصد.
- الواجهة (`mixedPipelines()` بـ `frontend/lib/observations.ts`) **بتحذّر بس إذا اختلف `l2b-vNN`**.
  إذا النسخة مش معروفة، بترجع تقارن أسماء الإصدارات.
- **ملفات `l2b_retry-v27`:** IRSA أعادت تشغيل 7 ملفات DR1 فصار اسمها مختلف. قبل كانت تعطي تحذير غلط،
  هلّق بتنحسب `l2b-v27` (اتصلّح 2026-11-13، وفي اختبار بالـ backend وبالـ frontend).
- الكاش بيحفظ الـ cutout حسب الـ processing version، فإذا IRSA أعادت المعالجة بيتحمّل الملف الجديد.

## شو بيكسر التوافق (لازم ننتبه)

1. **إصدار جديد بـ `l2b-v28`** أو أعلى: الواجهة بتحذّر لحالها. لازم نسأل يزان إذا بنسمح بالخلط.
2. **`VERSION` بالـ header بيختلف** وهو بنفس `l2b-vNN`: هلّق ما منفحصه بالكود (كلهم 7.0.5).
3. **ملفات المعايرة** (`spectral_wcs_*`) بتتحدث: لازم نرجع ننزّلها بـ `scripts/download_spectral_wcs.py`.

## دليل البحث (2026-11-13، IRSA الحقيقي)

```
RUN_NETWORK_TESTS=1 pytest -v -k network tests/test_real_source.py
test_network_search_returns_each_release[DR1] PASSED
test_network_search_returns_each_release[QR3] PASSED
test_network_search_and_cutout PASSED
3 passed in 123.59s
```

- بحث حقيقي عند Mira: كل release رجّع أكثر من 50 رصد، وكل رصد فيه `id`، و `source_file` (`.fits`)،
  و `archive_id` (`ivo://irsa.ipac/spherex_dr1?…` أو `spherex_qr3?…`)، و `processing_version` (`v27`).
- اختبارات بدون شبكة لكل release (`test_real_observation_has_release_version_archive_id_and_bandwidth[DR1/QR3]`):
  الـ release، والـ observation id، واسم الملف، والـ archive id، والـ processing version بيضلوا من البحث لحد هيدرز الصورة.
- حصر المشاهدات الكامل للأهداف الستة: [observation-inventory.md](observation-inventory.md). تحقق تقوى من نتائج الأرشيف لسّا مطلوب.

## القيود المعروفة

- **QR2 انشال من IRSA** واستبدله DR1. منبحثش فيه، والكاش القديم تبعه محفوظ بـ `*-qr2-era`.
- **QR3 بيغطي بس 2026-07-04 → 2026-09-22.** أهداف ما إلها زيارة بهالفترة (WISE 0855، 3I/ATLAS) إلها DR1 بس.
- **7 ملفات DR1 معاد تشغيلها** (`l2b_retry-v27`): نفس الـ pipeline، والكود بيتعامل معها.
- إذا release وحدة فشلت، النتيجة بترجع من الثانية بس **ما بتنحفظ بالكاش** (عشان ما نخزّن نتيجة ناقصة).
- البحث والـ cutouts بطيئين (5–30 ثانية للصورة)، وفي retries وكاش 24 ساعة للبحث.

## كيف تعيدي الفحص

```bash
cd backend
DATA_SOURCE=real C:/Users/moham/.venvs/planetx/Scripts/python -m uvicorn --app-dir . app.main:app --port 8000
# ابحثي عن أي هدف، وبعدين شوفي الـ processing_version بالكاش:
grep -o "l2b[a-z_]*-v[0-9]*" .cache/search/*.json | sort | uniq -c
```
