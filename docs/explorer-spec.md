# صفحة Explorer (`/explore`): المطلوب من سديل

هاد الملف بيوصف أداة الـ blink بالزبط، حسب الباك إند الموجود ([api-contract.md](api-contract.md))
وتصاميم بتول (ستايل SKYTRACE: خلفية فضاء غامقة، بنفسجي، أزرار pill).

**تقسيم الفرونت:** مشروع Next.js واحد جوّا `frontend/`.
| الصفحة | مين |
|---|---|
| `/` Home | بتول |
| `/explore` Explorer | سديل |
| Navbar + الألوان + الخطوط (مشتركين) | يتفقوا مين، مرة وحدة |

---

## 1. الفكرة بجملة
المستخدم بيختار مكان بالسماء، فبنجيبله كل صور SPHEREx لهالمكان، وبيقلّب بينهم بسرعة. اللي بيتحرك أو بيتغيّر سطوعه بيبيّن.

## 2. شكل الصفحة

```
┌─────────────────────────────────────────────────────────────┐
│ SKYTRACE        Home   Explorer                 [MOCK DATA] │  ← Navbar (+ شارة إذا mock)
├──────────────────┬──────────────────────────────────────────┤
│ 1. اختار مكان     │ 3. الـ Blink Viewer                       │
│ ┌──────────────┐ │ ┌──────────────────────────────────────┐ │
│ │ Vesta  ☄ ast │ │ │                                      │ │
│ │ Mira   ★ var │ │ │          [ الصورة 1 من 3 ]            │ │
│ │ ...          │ │ │                +  (crosshair)        │ │
│ └──────────────┘ │ │                                      │ │
│ أو: RA [    ]    │ └──────────────────────────────────────┘ │
│     Dec[    ]    │  ◀  ▶  ⏯   سرعة: ──●──   ☐ Difference      │
│     [ Search ]   │  2025-08-14 02:10 UTC · D3 · 2.04 µm · QR2 │
│                  │  level2_..._spx.fits   (NASA/IPAC IRSA)   │
│ 2. النتائج        │                                          │
│ Band: D1 … D6    │ إعدادات: Stretch [asinh▾]  Size [300″▾]   │
│ ☑ Visit 1 (May)  │                                          │
│ ☑ Visit 2 (Nov)  │ ⚠ الأطوال الموجية مختلفة بين الصور…       │
│ ☐ Visit 3 (Apr)  │                                          │
└──────────────────┴──────────────────────────────────────────┘
```
على الموبايل: الأقسام فوق بعض (1 ← 2 ← 3).

## 3. المتطلبات خطوة خطوة

### القسم 1: اختيار المكان
- [ ] `GET /api/targets`: بطاقة لكل هدف فيها `name` وشارة `type` (asteroid / comet / brown_dwarf / star / variable) و `description`.
- [ ] الضغط على بطاقة بيعبّي RA/Dec وبيعمل بحث.
- [ ] إدخال يدوي: RA (0–360) و Dec (−90–90) بالدرجات، مع تحقق بالفرونت قبل الإرسال.
- [ ] رابط مشاركة: `/explore?ra=..&dec=..`. إذا الرابط فيه إحداثيات، البحث بيبلّش لحاله.

### القسم 2: النتائج
- [ ] `GET /api/search?ra=&dec=`: الأرصاد بترجع مرتّبة من الأقدم.
- [ ] **قسّميهم لزيارات:** إذا الفرق بين رصدين أكتر من 30 يوم (حسب `mjd`)، بيكونوا بزيارتين مختلفتين. SPHEREx بيزور كل مكان تقريباً كل 6 شهور.
- [ ] فلتر **Band** (D1…D6). الافتراضي: الـ band اللي إله أكتر عدد زيارات.
- [ ] الاختيار الافتراضي: **رصد واحد من كل زيارة**، من نفس الـ band. والمستخدم بيقدر يغيّر.
- [ ] إذا ما في نتايج (`observations: []`)، اعرضي: "ما في تغطية SPHEREx لهالمكان لسا". **هاد مش خطأ.**

### القسم 3: الـ Blink Viewer (أهم جزء)
- [ ] **كل الصور بنفس `ra` و `dec` و `size` و `stretch`.** هيك الباك إند بيرجّعهم على نفس الشبكة، north-up.
- [ ] **ترتيب التحميل (مهم):**
  1. حمّلي الصورة الأولى، واقري `X-Stretch-Vmin` و `X-Stretch-Vmax` من الـ headers.
  2. حمّلي باقي الصور مع `vmin` و `vmax` نفسهم.
  3. بدون هالخطوة، تغيّر السطوع (متل Mira) **ما بيبيّن**.
- [ ] **الصور لازم تنجاب بـ `fetch()`، مش `<img src>`،** لأنه بدنا نقرأ الـ headers. حوّليها لـ `URL.createObjectURL(blob)`.
- [ ] تقليب: ▶/⏸ تلقائي، وسرعة من 0.2 لـ 2 ثانية، و◀ ▶ يدوي، وأسهم الكيبورد.
- [ ] **حمّلي كل الصور قبل ما يبلّش التقليب**، عشان ما يصير flicker.
- [ ] Crosshair خفيف بالمركز (هون الهدف).
- [ ] الصور pixelated: `image-rendering: pixelated`، **بدون smoothing**.
- [ ] **تحت كل صورة (إلزامي للتحكيم):** `obs_time` (UTC) و `band` و `X-Wavelength-Um` و `release` و `source_file`، وجملة "Data: NASA/IPAC IRSA, SPHEREx".
- [ ] إعدادات: Stretch (asinh / zscale / linear) و Size (120 / 300 / 600″). أي تغيير بيعيد تحميل الصور كلها.
- [ ] **⚠ تحذير الطول الموجي:** إذا الفرق بين `X-Wavelength-Um` للصور أكتر من 0.05 µm، اعرضي:
      "الصور مأخوذة بأطوال موجية مختلفة. فرق السطوع ممكن يكون من هيك، مش تغيّر حقيقي."
- [ ] *(إضافة قوية)* **Difference mode:** اطرحي صورتين ببعض على `<canvas>`. اللي ما تغيّر بيختفي، واللي تحرّك بيبيّن كنقطة بيضا وسودا.

## 4. حالات التحميل والأخطاء

### التحميل
- **Mock:** كل شي فوري.
- **Real:** البحث بياخد 5–15 ثانية، وكل صورة **5–30 ثانية أول مرة** وبعدها ~0.1 ثانية.
  - [ ] Loading لكل صورة لحالها ("2 من 4 جاهزين").
  - [ ] لا تبعتي أكتر من 3 طلبات صور بنفس الوقت.
  - [ ] timeout بالفرونت 60 ثانية للصورة.
  - [ ] إذا المستخدم غيّر المكان، الغي الطلبات القديمة (`AbortController`).

### الأخطاء
كل خطأ بيرجع بالشكل `{"error": {"code", "message"}}`. **اعتمدي على `code`، مش على `message`:**
| `code` | شو تعرضي |
|---|---|
| `BAD_REQUEST` | الـ `message` (بيحكي أي parameter غلط) |
| `NOT_FOUND` | "الرصد مش موجود". غالباً لازم بحث من جديد |
| `NO_COVERAGE` | شيلي هالصورة من التقليب، واكتبي "هالصورة ما بتغطي المكان" |
| `UPSTREAM_ERROR` | "أرشيف ناسا بطيء أو مش متاح هلأ" + زر **Retry** |
| `INTERNAL_ERROR` | "صار خطأ" + زر Retry |

## 5. الصدق العلمي (معيار تحكيم)
- [ ] `GET /api/health`: إذا `data_source == "mock"`، اعرضي شارة **"MOCK DATA"** واضحة.
- [ ] ممنوع أي نص بيحكي "اكتشفنا" أو "Planet X found". منحكي "استكشف" و"قارن".
- [ ] Barnard's Star و WISE 0855 بيتحركوا **أقل من بكسل** بين الزيارات. اكتبي هالشي بوصف الهدف، لأنه هيك بتكون الحدود الحقيقية للتلسكوب.
- [ ] **بالـ real mode:** `wavelength_um` بنتايج البحث بيكون `null`. القيمة الحقيقية بتيجي مع الصورة بـ `X-Wavelength-Um`.

## 6. الإعداد التقني
```bash
# frontend/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```
تشغيل الباك إند (mock):
```bash
cd backend && uvicorn app.main:app --reload --port 8000
```
CORS مفتوح لـ `http://localhost:3000`، والـ headers المطلوبة مسموحة.

### الـ Types (TypeScript)، منسوخة من العقد
```ts
export type TargetType = "asteroid" | "comet" | "brown_dwarf" | "star" | "variable";

export interface Target {
  id: string; name: string; type: TargetType;
  ra: number; dec: number; description: string;
}

export interface Observation {
  id: string;
  target_id: string | null;
  obs_time: string;               // ISO-8601 UTC
  mjd: number;
  wavelength_um: number | null;   // null in real-mode search results
  wavelength_range_um?: [number, number] | null;
  band: string;                   // "D1".."D6"
  release: string;                // "QR2" | "QR3"
  source_file: string;
  image_url: string;              // relative: prefix with API base URL
  footprint?: { ra: number; dec: number; radius_deg: number } | null;
}

export interface ApiError { error: { code: "BAD_REQUEST" | "NOT_FOUND" | "NO_COVERAGE"
  | "UPSTREAM_ERROR" | "NOT_IMPLEMENTED" | "INTERNAL_ERROR"; message: string } }

export interface BlinkFrame {
  obs: Observation;
  url: string;                    // blob URL
  wavelengthUm: number | null;    // from X-Wavelength-Um
  vmin: number; vmax: number;     // from X-Stretch-*
}
```

### أهم دالة: تحميل صورة مع الـ headers
```ts
const API = process.env.NEXT_PUBLIC_API_BASE_URL!;

export async function loadFrame(obs: Observation, p: {
  ra: number; dec: number; size: number; stretch: string; vmin?: number; vmax?: number;
}, signal?: AbortSignal): Promise<BlinkFrame> {
  const q = new URLSearchParams({ ra: String(p.ra), dec: String(p.dec),
    size: String(p.size), stretch: p.stretch });
  if (p.vmin !== undefined && p.vmax !== undefined) {
    q.set("vmin", String(p.vmin)); q.set("vmax", String(p.vmax));
  }
  const res = await fetch(`${API}${obs.image_url}?${q}`, { signal });
  if (!res.ok) throw (await res.json()) as ApiError;
  const wl = res.headers.get("X-Wavelength-Um");
  return {
    obs,
    url: URL.createObjectURL(await res.blob()),
    wavelengthUm: wl ? Number(wl) : null,
    vmin: Number(res.headers.get("X-Stretch-Vmin")),
    vmax: Number(res.headers.get("X-Stretch-Vmax")),
  };
}

// الأولى بتحدد الـ stretch، والباقي بيستعملوه
export async function loadBlink(list: Observation[], base: { ra: number; dec: number; size: number; stretch: string }) {
  const first = await loadFrame(list[0], base);
  const rest = await Promise.allSettled(
    list.slice(1).map(o => loadFrame(o, { ...base, vmin: first.vmin, vmax: first.vmax })));
  return [first, ...rest.flatMap(r => r.status === "fulfilled" ? [r.value] : [])];
}
```
*(النسخة النهائية لازم تحدّ الطلبات المتوازية لـ 3، وتعرض الصور اللي فشلت بدل ما تتجاهلها.)*

## 7. Checklist التسليم
- [ ] Vesta بالـ mock: الكويكب بيتحرك بوضوح بين 3 صور.
- [ ] Mira بالـ mock: السطوع بيقلّ (بس إذا الـ vmin/vmax مشترك).
- [ ] المصدر والتاريخ والطول الموجي ظاهرين تحت كل صورة.
- [ ] شارة MOCK DATA ظاهرة بالـ mock، ومختفية بالـ real.
- [ ] نقطة ما فيها تغطية: رسالة واضحة، مش crash.
- [ ] الباك إند مطفي: رسالة خطأ واضحة.
- [ ] شغّال على عرض موبايل (375px).
- [ ] نفس ألوان وخطوط صفحة بتول.
