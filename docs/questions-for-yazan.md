# أسئلة ليزن (وفريق العلم: تقوى، حنين)

الهدف إنه نثبّت العقد ([api-contract.md](api-contract.md)) قبل ما نبني `RealSource`.
جنب كل سؤال كاتبين **شو افترضنا بالـ mock (v0)**. إذا الجواب بيغيّر شكل الـ JSON، منعمل `v1`.

## أسئلة الـ brief (الأولوية)

### 1. الأهداف النهائية للديمو
- **افترضنا:** خمس أهداف، كل واحد من نوع: `vesta` (asteroid)، `12p-pons-brooks` (comet)،
  `wise-0855-0714` (brown_dwarf)، `barnards-star` (star)، `mira` (variable).
- ❓ هاي الأهداف منطقية؟ بسبب حد الـ ~6″/pixel، WISE 0855 و Barnard's Star بالكاد بيتحركوا خلال 6 شهور.
  منخليهم كمثال صريح على حدود الدقة، ولا منشيلهم؟
- ❓ أي كويكب ومذنب **فعلياً** إلهم تغطية SPHEREx بصورتين أو أكتر قريبين بالوقت؟ (إحداثياتهم بالـ mock تقريبية، مش ephemeris)

### 2. الطول الموجي المتغير داخل الصورة
- **افترضنا:** `wavelength_um` = الطول الموجي **بمركز الـ cutout**، و `band` = رقم الـ detector (`D1`…`D6`).
- ❓ منحسبه من الـ spectral WCS بالـ pixel الوسطي؟ أي HDU / keywords؟
- ❓ لما نقارن تاريخين، منشترط إنه الفرق بالطول الموجي أقل من قيمة معينة (مثلاً ±0.05 µm)؟
  ولا منعرض أي شي ومنكتب الفرق؟

### 3. مخرجات Candidate Detection
- **افترضنا:** لسا ما في endpoint إلها.
- ❓ شو الشكل؟ مقترح:
  `{ "observation_ids": [...], "ra", "dec", "delta_ra_arcsec", "delta_dec_arcsec", "delta_mag", "score", "method" }`
- ❓ بتنحسب مسبقاً (ملف JSON) ولا live لكل طلب؟

### 4. الـ Release
- **افترضنا:** `release: "QR2"` لكل الأرصاد.
- ❓ QR2 ولا أحدث؟ وشو اسم الـ collection بالـ SIA2 بالزبط؟

## أسئلة تقنية للـ RealSource

### 5. البحث (SIA2)
- **افترضنا:** `footprint` دائرة نصف قطرها 1.75° (تقريب للـ detector الـ 3.5°×3.5°).
- ❓ منرجّع الـ footprint الحقيقي كـ polygon (`s_region`)؟ الفرونت بيستفيد منه لرسم التغطية.
- ❓ شو الـ `id` تبع الرصد؟ `obs_publisher_did` ولا اسم الملف؟ (لازم يكون URL-safe أو منعمله encode)

### 6. الـ Cutout والـ stretch
- **افترضنا:** `size` بالـ arcsec (default 300″، حوالي 49 px)، و `stretch` واحد من asinh / zscale / linear،
  والـ PNG north-up / east-left.
- ❓ IRSA Cutout Service بيرجّع FITS مع WCS؟ ولا منحتاج نعمل reprojection عشان الصور تتطابق بالـ blink؟
- ❓ منطرح الـ background (zodiacal light كبير بالـ IR) قبل الـ stretch؟
- ❓ default الـ size المناسب للكويكبات مقابل الأقزام البنية؟

### 7. الأداء
- ❓ قديش بياخد cutout واحد من IRSA؟ إذا أكتر من ثانيتين بنحتاج cache على الديسك.

### 8. حقول ممكن نحتاجها
- ❓ `flux` / `mag` للهدف بكل رصد (لعرض منحنى الضوء للـ variable)؟
- ❓ `pm_ra` / `pm_dec` للأهداف البطيئة، عشان الفرونت يرسم سهم الحركة المتوقعة؟

---

## الأسئلة المفتوحة الأخيرة (2026-11-13)

✅ **يزان جاوب على السبعة (2026-11-13).** القرارات بـ [science-findings.md](science-findings.md) (قسم 4ب).
الأسئلة الأصلية:

1. **خلط الإصدارات:** منسمح نقارن صورة DR1 مع صورة QR3 بنفس الـ blink (الواجهة بتحذّر بس)، ولا منمنعها؟
2. **نصوص القصص:** مراجعة علمية لـ `frontend/lib/stories.ts` (Vesta، Mira، Barnard's Star).
3. **WISE 0855:** فتحناه على D6 (4.42–5.00 µm). صح؟ ومن وين ناخد proper motion دقيق (ما في Gaia)؟
4. **TRANSIENT:** منصلّح pixels الـ TRANSIENT بالعرض. بس بالـ difference ممكن تكون هي الإشارة اللي بدنا ياها. نخليها ولا لا؟
5. **3I/ATLAS:** منعتمده كهدف بالديمو إذا بيّن بالصور؟
6. **محرك الكشف:** رح يكون مكتبة Python منستدعيها، ولا ملف JSON جاهز بشكل الـ Candidate بالعقد؟
7. **الـ photometry:** أي طريقة (aperture بأي نصف قطر؟) وأي وحدة لـ `flux` (MJy/sr ولا µJy)؟

