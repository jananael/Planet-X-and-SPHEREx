# أسئلة ليزن — حقول البيانات اللي مش متأكدين منها

الهدف: نثبّت شكل البيانات قبل ما نبني `RealSource`. كل سؤال فيه **الوضع الحالي بالـ mock (v0)**
عشان يكون واضح شو افترضنا. لو الجواب غيّر شكل الـ API منعمل `v1` ومنحدّث
[`api-contract.md`](api-contract.md).

## 1. الإحداثيات (`ra`, `dec`)

- **الحالي:** درجات عشرية، ICRS/J2000، مأخوذة تقريباً من اسم الكتالوج (`WISE Jhhmmss.ss±ddmmss.s`).
- ❓ أي **epoch** للموقع؟ الأهداف هاي حركتها الذاتية عالية جداً (WISE 0855 حوالي 8″/سنة، Barnard's Star حوالي 10″/سنة)،
  فالموقع بيختلف بين 2010 و 2025.
  - نخزّن موقع مرجعي واحد + `pm_ra`, `pm_dec` (mas/yr) + `epoch`؟
  - ولا موقع لكل observation؟
- ❓ بنحتاج **parallax / distance**؟

## 2. نصف قطر البحث (`radius`)

- **الحالي:** بالدرجات، default `0.1`، max `10`.
- ❓ وحدة أريح للعلماء: arcsec أو arcmin؟ وشو الـ default المعقول لـ SPHEREx (البكسل حوالي 6.2″)؟
- ❓ لازم البحث يعمل حساب للحركة الذاتية؟ (هدف حركته عالية ممكن يطلع برّا الدائرة بـ epoch تاني)

## 3. `survey`

- **الحالي:** `allwise` | `neowise` | `spherex`.
- ❓ هاي القائمة صح؟ بدنا كمان `unwise`, `catwise`, `2mass`, `gaia`؟
- ❓ AllWISE هو مزيج من epochs (2010–2011). نعتبره observation وحدة ولا نفصّل كل scan؟

## 4. `band`

- **الحالي:** WISE: `W1`, `W2`. SPHEREx: `SPHEREx-B1` … `SPHEREx-B6` (افترضنا 6 detectors).
- ❓ SPHEREx بيعطي spectral images (حوالي 102 قناة بين 0.75 و 5 µm). شو الوحدة الصح للـ `band`؟
  - رقم الـ detector؟ wavelength مركزي (µm)؟ ولا مجال `[λ_min, λ_max]`؟
- ❓ نزيد حقل `wavelength_um` رقمي عشان الفرونت يرسم spectrum / SED؟

## 5. `mjd`

- **الحالي:** رقم عشري، MJD (UTC)، قيم تقريبية (WISE حوالي 55,300 · NEOWISE حوالي 59,000 · SPHEREx حوالي 60,800+).
- ❓ الأصح MJD ولا BJD/TDB؟ لصورة co-add (مزيج من عدة exposures) شو منحط: المتوسط؟ أول وآخر؟
  (ممكن `mjd_start`/`mjd_end`)

## 6. `image_url` و `/observations/{id}/image`

- **الحالي:** placeholders من `placehold.co`. الـ endpoint بيرجّع `307` redirect للـ URL.
- ❓ من وين منجيب الصور الحقيقية؟ IRSA cutout service؟ SPHEREx archive؟
- ❓ الصيغة: PNG/JPEG جاهزة للعرض، ولا FITS ومنحوّلها بالباك اند (stretch / colormap)؟
- ❓ حجم الـ cutout (arcsec) ومقاس الصورة؟
- ❓ لو FITS: منحط رابط تاني `fits_url` للتحميل؟

## 7. الـ IDs

- **الحالي:** slugs مقروءة (`wise-0855-0714`, `wise-0855-0714-neowise-w2-2`). استبدلنا `+` بـ `p`
  (`wise-1828p2650`) عشان الـ URLs.
- ❓ نستخدم IDs الأرشيف الرسمية (مثلاً `source_id` تبع CatWISE أو `obsid` تبع SPHEREx) بدل هيك؟

## 8. حقول ناقصة يمكن نحتاجها

- ❓ `magnitude` / `flux` (+ errors) لكل observation؟
- ❓ `spectral_type` للهدف (Y4، T8، M4V…)؟
- ❓ `object_type`: brown dwarf / star / candidate؟
- ❓ وصف قصير لكل هدف للعرض بالواجهة؟

## 9. سؤال عام

- ❓ الأهداف الحالية (WISE 0855، Luhman 16، WISE 1828+2650، WISE 0350-5658، Barnard's Star)
  مناسبة للتحدي؟ في أهداف أهم لفكرة Planet X؟
