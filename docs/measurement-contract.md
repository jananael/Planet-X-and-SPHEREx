# S2-T3: عقد بيانات القياس (محرك التحليل ↔ Backend ↔ Frontend)

**المسؤولين:** يزان + جنى · **النسخة:** `0.1-draft` · **الحالة:** مسودة، بدها موافقة يزان

يزان بيعرّف الخوارزمية والقياسات والـ scoring. جنى بتعرّف كيف بتوصل البيانات وكيف بترجع.
لما نتفق، بنغيّر النسخة لـ `1.0` وما بنغيّر الحقول بدون ما نحكي لبعض.

## 1. شكل الربط

```
Frontend ──GET /api/candidates?ra&dec&radius──▶ Backend ──EngineRequest──▶ Engine (مكتبة Python، يزان)
         ◀──────── CandidateList (JSON) ───────         ◀── list[Candidate] ──
```

- المحرك **مكتبة Python جوّا الريبو** (قرار يزان)، مش خدمة منفصلة.
- الواجهة بالكود: [`backend/app/services/engine.py`](../backend/app/services/engine.py) (`DetectionEngine.detect(request)`).
- شكل الـ Candidate: [`backend/app/schemas/candidate.py`](../backend/app/schemas/candidate.py)، وكـ JSON Schema:
  [`candidate.schema.json`](candidate.schema.json). في اختبار بيتأكد إن الملفين متطابقين.

## 2. شو بيعطي الـ Backend للمحرك (`EngineRequest`)

| الحقل | النوع | الشرح |
|---|---|---|
| `ra_deg`, `dec_deg` | float | النقطة اللي سأل عنها المستخدم (ICRS) |
| `radius_deg` | float | نصف قطر البحث |
| `frames` | list[EngineFrame] | كل الصور اللي بتغطي النقطة، مرتبة بالوقت |
| `known_objects` | list[dict] | اختياري: مواقع متوقعة لأجسام معروفة (Horizons / Gaia) لكل وقت رصد |

كل `EngineFrame`:

| الحقل | الشرح |
|---|---|
| `observation_id` | نفس الـ id بالـ API، مثلاً `2025W19_1B_0241_1D1` |
| `fits_path` | ملف FITS الأصلي من IRSA (cutout): `IMAGE`، `FLAGS`، `VARIANCE`، `ZODI`، `EPSF`، `WCS-WAVE` |
| `obs_time` | UTC، منتصف التعريض |
| `band` | D1..D6 |
| `release`, `processing_version` | DR1/QR3، و `l2b-v27-…`. التوافق حسب الـ pipeline، مش الاسم ([data-releases.md](data-releases.md)) |
| `wavelength_um`, `bandwidth_um` | عند بكسل الهدف (CWAVE، وإلا WCS-WAVE) |
| `pixel_scale_arcsec` | 6.15 |

**مهم:** المحرك بيقرأ من الـ FITS الأصلي، **مش من صور الـ PNG** تبعت العرض (هدول فيهم تصليح وstretch).

## 3. شو بيرجّع المحرك (`Candidate`)

الحقول موجودة بالـ schema. القواعد:

| الموضوع | القاعدة |
|---|---|
| **الوحدات** | البكسلات MJy/sr. `flux` و `flux_error` **µJy** (`flux_unit: "uJy"`) بعد التحويل بخريطة الـ solid angle. ممنوع نجمع MJy/sr كـ flux |
| **الـ photometry** | PSF (أداة SPHEREx المبنية على Tractor) للمصادر النقطية. الـ aperture (2 / 2.5 / 3 px + annulus) تجربة بس. الأجسام الممتدة (3I/ATLAS) بدها تحليل خاص |
| **الوقت** | UTC، منتصف التعريض، بـ `Z` |
| **الموقع** | `delta_ra_arcsec` على السما (مضروب بـ cos Dec). `position_angle_deg` من الشمال للشرق |
| **القيم الناقصة** | `null`، ممنوع نخترع قيم. `score` بيضل `null` لحد ما نوثّق الطريقة |
| **TRANSIENT** | ما منصلّحها. بتضل mask، وإذا المرشّح قريب منها: `"near_transient_pixels"` بـ `quality_flags` |
| **الحالة** | `pending_validation` / `known_object` / `artifact` / `rejected`. **ما في "discovered"** |
| **المصدر** | `engine_version` = نسخة المحرك. `is_mock: false` |

حقول جديدة للمحرك (موجودة بالـ schema وفاضية هلّق):

| الحقل | النوع | مثال |
|---|---|---|
| `snr` | float \| null | `12.4` |
| `quality_flags` | list[str] | `["near_transient_pixels", "saturated", "mixed_pipeline"]` |
| `evidence` | dict | `{"aperture_px": 2.5, "chi2": 1.1, "n_frames": 3}`، شكله حر ويزان بيحدده |

## 4. أخطاء وأداء

- إذا ما لقى شي: بيرجّع `[]`، مش exception.
- إذا في exception: الـ backend بيرجّع `INTERNAL_ERROR` (500) للواجهة.
- لحد ما يجهز المحرك: وضع mock بيرجّع مرشحين تجريبيين (`is_mock: true`)، والوضع الحقيقي بيرجّع 501.

## 5. أسئلة ليزان (لازم نتفق عليها)

1. **`snr`:** لكل مرشّح بس، ولا كمان لكل `Detection` (لكل صورة)؟
2. **`quality_flags`:** شو القائمة الثابتة للقيم؟ بنقترح: `near_transient_pixels`، `saturated`، `edge_of_image`، `mixed_pipeline`، `extended_source`.
3. **`score`:** شو مداه (0–1؟) وشو بيعني؟
4. **الأجسام المعروفة:** بتحتاج `known_objects` بالمدخلات، ولا المحرك بيسأل Horizons لحاله؟
5. **الوقت:** قديش مسموح ياخد المحرك لكل طلب؟ (الصور الحقيقية بتاخد 5–30 ثانية لكل وحدة)
6. **نطاق الطول الموجي:** بتقارن صور من نطاقات مختلفة، ولا بس اللي بتتداخل نطاقاتها؟
