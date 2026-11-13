# S2-T3: عقد بيانات القياس (محرك التحليل ↔ Backend ↔ Frontend)

**المسؤولين:** يزان + جنى · **النسخة:** `0.2-draft` · **الحالة:** قرارات يزان + حد `low_snr` + ملاحظات مراجعته الخمس (2026-11-13) مطبّقة بالكود. موافقة مشروطة، بانتظار المراجعة الأخيرة.
بدها مراجعة مشتركة قبل `1.0`.

يزان بيعرّف الخوارزمية والقياسات والـ scoring. جنى بتعرّف كيف بتوصل البيانات وكيف بترجع.
ما بنغيّر الحقول بدون ما نحكي لبعض.

## 1. شكل الربط

```
Frontend ──GET /api/candidates?ra&dec&radius──▶ Backend ──EngineRequest──▶ Engine (مكتبة Python، يزان)
         ◀──────── CandidateList (JSON) ───────         ◀── list[Candidate] ──
```

| الملف | شو فيه |
|---|---|
| [`backend/app/services/engine.py`](../backend/app/services/engine.py) | المدخلات (`EngineRequest`، `EngineFrame`، `KnownObject`) والحدود الزمنية |
| [`backend/app/schemas/candidate.py`](../backend/app/schemas/candidate.py) | المخرجات (`Candidate`، `Detection`، `QualityFlag`) والقواعد كـ validation |
| [`candidate.schema.json`](candidate.schema.json) | نفس المخرجات كـ JSON Schema. `test_json_schema_file_matches_pydantic_model` بيفشل إذا صار قديم |
| [`examples/candidate.example.json`](examples/candidate.example.json) | مثال من بيانات حقيقية (فيستا، QR3، 2026-07-13) |
| [`backend/tests/test_candidate_contract.py`](../backend/tests/test_candidate_contract.py) | اختبارات القواعد |

## 2. المدخلات: شو بيعطي الـ Backend للمحرك

**القاعدة:** المحرك **ما بيتصل** بـ IRSA ولا Horizons ولا Gaia. الـ backend بينزّل الصور وبيحضّر المواقع المتوقعة،
فالتحليل بينعاد بنفس المدخلات وبدون إنترنت.

`EngineRequest`: `ra_deg`، `dec_deg`، `radius_deg`، `frames`، `known_objects`.

**`EngineFrame`** (صورة وحدة):

| الحقل | الشرح |
|---|---|
| `observation_id` | نفس الـ id بالـ API، مثلاً `2026W29_1A_0138_4D2` |
| `fits_path` | ملف FITS الأصلي: `IMAGE`، `FLAGS`، `VARIANCE`، `ZODI`، `EPSF`، `WCS-WAVE` |
| `obs_time` | UTC، منتصف التعريض |
| `band`، `wavelength_um`، `bandwidth_um` | الـ band، والطول الموجي عند الهدف (CWAVE، وإلا WCS-WAVE) |
| `release`، `processing_version` | DR1/QR3، و `l2b-v27-…` ([data-releases.md](data-releases.md)) |

المحرك بيقرأ من الـ FITS الأصلي، **مش من صور PNG تبعت العرض**.

**`KnownObject`** (موقع متوقع لجسم معروف بوقت معيّن):

| الحقل | الشرح |
|---|---|
| `object_id`، `name` | مثلاً `3i-atlas` |
| `ra_deg`، `dec_deg` | الموقع المتوقع |
| `epoch_utc` | الوقت اللي الموقع صحيح فيه (منتصف التعريض) |
| `source` | `JPL_HORIZONS` (أجسام النظام الشمسي) · `GAIA_DR3` (نجوم ضمن نطاقه) · `LITERATURE` (مثل WISE 0855) |
| `uncertainty_arcsec` | إذا متوفرة |

التطابق مع جسم معروف **لحاله مش دليل كافي** على صحة الـ detection.

## 3. المخرجات: `Candidate`

### Detection لكل صورة
كل مرشّح فيه قائمة `detections`، **وحدة لكل observation**:
`observation_id`، `observation_time`، `band`، `wavelength_um`، `bandwidth_um`، `ra_deg`، `dec_deg`،
`snr`، `flux`، `flux_error`، `flux_unit`، `quality_flags`.

### SNR
- **لكل detection** (لأن قوة الجسم بتختلف من صورة لصورة).
- **ملخص على مستوى المرشّح:** `median_snr` و `min_snr`، محسوبين من **نفس** الـ detections اللي إلها `snr`
  (القيم `null` بتنشال من الحساب). إذا المحرك تركهم `null` الكود بيحسبهم، وإذا عبّاهم بقيم مختلفة الكود بيرفض.
  ممنوع متوسط لحاله يخبّي detection ضعيف.
- إذا مش موثوق: `null`.
- **حد `low_snr` (يزان، مبدئي):** `SNR < 5` ← الكود بيضيف `low_snr` للـ detection **تلقائياً**، والقيمة الأصلية بتضل.
  `< 3` ضعيف كتير ومش كشف موثوق لحاله · `3–5` هامشي وبدّه أدلة إضافية · `≥ 5` إشارة قوية بس **مش إثبات**.
  detection ضعيف ما بيرفض المرشّح. لازم نجرّب الحد على بيانات SPHEREx الحقيقية (`LOW_SNR_THRESHOLD` بـ `candidate.py`).

### Quality flags (قائمة ثابتة، الكود بيرفض أي قيمة غيرها)

| Flag | متى |
|---|---|
| `near_transient_pixels` | المصدر أو منطقة قياسه قريبة من بكسلات TRANSIENT |
| `saturated` | بكسلات مشبّعة بمنطقة القياس |
| `edge_of_image` | قريب من حافة الصورة أو منطقة ناقصة |
| `mixed_pipeline` | البيانات من نسخ معالجة ممكن ما تكون متوافقة |
| `extended_source` | مصدر ممتد مش نقطي (مثل 3I/ATLAS) |
| `low_snr` | الـ SNR تحت حد الجودة المعتمد |
| `poor_wcs` | الـ WCS مش موثوق كفاية |
| `high_background` | الخلفية مأثّرة على القياس بشكل واضح |
| `insufficient_epochs` | التعريضات المستقلة مش كفاية للاستنتاج |
| `photometry_failed` | قياس السطوع فشل أو مش موثوق |

- الـ flag **تحذير، مش رفض تلقائي**. منحتفظ فيه ومنوضّح تأثيره.
- ما منستعمل `cosmic_ray` بدل `near_transient_pixels`: مش كل TRANSIENT سببه أشعة كونية.
- **`mixed_pipeline`:** إذا البيانات فعلاً مش متوافقة، **ما منقارنها كمياً أصلاً**. `EngineRequest` **بيرفض**
  صور من أكثر من pipeline (`l2b-vNN`، و `l2b_retry-v27` = `v27`)، **وبيرفض أي صورة نسختها مش معروفة**، فالـ backend لازم يقسم الطلب. الـ flag لحاله مش كفاية.

### الأطوال الموجية
- **سلسلة السطوع الزمنية بـ band وحدة بس** (D6 مع D6، ممنوع D4 مع D6). الكود بيرفض `brightness` إذا الـ detections
  اللي إلها flux من أكثر من band، و `brightness.band` بيقول أي band.
- تحليل متعدد النطاقات (لون، خصائص طيفية) بيكون منفصل، وكل قياس محفوظ مع `band` و `wavelength_um` و `bandwidth_um`.
- التداخل بين النطاقات **لحاله مش كافي** للدمج. لازم نتأكد من الاستجابة الطيفية والمعايرة.

### Score
- **هلّق `null`** لحد ما نوثّق المنهجية.
- لاحقاً: من 0 لـ 1 (الكود بيرفض غير هيك). بيرتّب المرشّحين حسب قوة الأدلة اللي بتستاهل مراجعة.
- **0.9 ما بتعني احتمال 90%**، ولا بتعني اكتشاف. ممنوع تنحسب من الـ SNR لحاله، ولازم العوامل تكون واضحة.

### الوحدات والـ photometry
- البكسلات MJy/sr. `flux` و `flux_error` **µJy** (`flux_unit: "uJy"`) بعد التحويل بخريطة الـ solid angle.
  ممكن يكونوا `null` (ما انقاسوا)، بس إذا في `flux` بمرشّح حقيقي (`is_mock: false`) الكود بيرفض أي وحدة غير `uJy`.
- PSF photometry (أداة SPHEREx المبنية على Tractor) للمصادر النقطية. الـ aperture (2 / 2.5 / 3 px + annulus) تجربة بس.
  الأجسام الممتدة بدها تحليل خاص.

### قواعد عامة
- **الوقت UTC، منتصف التعريض.** الكود بيفرضها على `observation_time` و `EngineFrame.obs_time` و `KnownObject.epoch_utc`:
  وقت **بدون timezone بينرفض** (ما منفترض إنه UTC)، ووقت بـ offset تاني **بيتحوّل لـ UTC** بشكل صريح.
- **`observation_ids` = معرّفات الـ detections بالضبط:** detection وحدة لكل observation، بدون تكرار. إذا انحذفت بتنشتق من الـ detections.
- **`flux_error` بدون `flux` ممنوع.** وبمرشّح حقيقي، وجود `flux` أو `flux_error` بيفرض `flux_unit: "uJy"`.
- **`is_mock`:** `true` يعني **القياسات** مش من المحرك (وضع mock أو مثال للعقد). الصور والـ observation ids ممكن يكونوا
  حقيقيين، مثل مثال فيستا. `delta_ra_arcsec` على السما (× cos Dec).
- القيم الناقصة `null`، ممنوع نخترع.
- `status`: `pending_validation` / `known_object` / `artifact` / `rejected`. **ما في "discovered"**.

## 4. الأداء (أرقام أولية للتجربة، مش حدود علمية)

| الحالة | السلوك |
|---|---|
| طلب لحد 3 صور، متوقع يخلص بـ 60 ثانية | تنفيذ مباشر |
| أكثر من 3 صور، أو أطول | Background job: الـ API بيرجّع `job_id` والواجهة بتتابع الحالة |
| حد الـ worker | 180 ثانية |

الثوابت بـ `engine.py`: `DIRECT_MAX_FRAMES`، `DIRECT_TARGET_SECONDS`، `WORKER_MAX_SECONDS`.
تحميل الصور مسؤولية الـ backend. لازم نقيس على صور حقيقية قبل ما نثبّت الأرقام.

## 5. شو ضل قبل `1.0`

- [x] تحديث `candidate.py` و `candidate.schema.json` (2026-11-13)
- [x] مثال JSON من بيانات حقيقية + اختبارات validation
- [x] مراجعة يزان الأولى (موافقة مشروطة) + إصلاح النقاط الخمس: pipeline غير معروف، UTC، flux_error، observation_ids، اختبار الـ schema
- [ ] **المراجعة الأخيرة** واعتماد `1.0`
- [ ] الـ background jobs و `job_id` بالـ API (لسّا مش مبنية، بنبنيها لما يجهز المحرك)
- [x] صور من pipeline وحدة بكل طلب: `EngineRequest` بيرفض الخلط (الـ backend بيقسم الطلب لما نربط المحرك)
- [x] حد الـ `low_snr` = 5 (مبدئي، يزان 2026-11-13)
- [ ] تجربة حد الـ `low_snr` على بيانات SPHEREx الحقيقية
