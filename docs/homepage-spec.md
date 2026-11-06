# صفحة Home (`/`): المطلوب من بتول

تحويل تصميمك (اللي بـ [BatoolQubaa/HomePage](https://github.com/BatoolQubaa/HomePage)) لصفحة حقيقية
جوّا مشروعنا. **اسم المشروع صار MARS.**

**تقسيم الفرونت:** مشروع Next.js واحد جوّا `frontend/`.
| الصفحة | مين |
|---|---|
| `/` Home | **بتول** |
| `/explore` Explorer (أداة الـ blink) | سديل، ومواصفاتها بـ [explorer-spec.md](explorer-spec.md) |
| Navbar + Footer + الألوان + الخطوط | مشتركين، والأفضل بتول، لأنه التصميم تصميمك |

---

## 0. قبل ما تبلّشي

1. اقبلي دعوة الـ repo: <https://github.com/jananael/Planet-X-and-SPHEREx>
2. اعملي clone وفرع:
   ```bash
   git clone https://github.com/jananael/Planet-X-and-SPHEREx.git
   cd Planet-X-and-SPHEREx
   git switch -c feat/homepage
   ```
3. **اتفقي مع سديل مين بيعمل مشروع Next.js** (`npx create-next-app@latest frontend`)، وعلى:
   App Router ولا Pages، و Tailwind ولا CSS عادي، و TypeScript (منصح فيه).
   **واحدة بس بتعمله وبترفعه أول**، والتانية بتعمل pull. هيك ما بيصير عنا مشروعين.

---

## 1. الصور (Assets)

| من تصميمك | شو تعملي فيها | وين تنحط |
|---|---|---|
| Space background / Purple Milky Way / Nebula | WebP، حوالي 1920px عرض | `frontend/public/images/bg-*.webp` |
| Earth (transparent) | WebP **مع شفافية** | `frontend/public/images/earth.webp` |
| SPHEREx Telescope (transparent) | WebP مع شفافية | `frontend/public/images/telescope.webp` |
| **SKYTRACE logo** | ❌ **لازم شعار جديد باسم MARS**، ويفضّل SVG | `frontend/public/brand/mars-logo.svg` |
| Page mockup / Assets board | مرجع للشكل بس، **ما بتنرفع** | — |

- [ ] **الحجم:** كل صورة هلأ 1.3–2MB. بعد WebP لازم تكون **أقل من 300KB**.
      (أداة سهلة: <https://squoosh.app>)
- [ ] **ملف المصادر** `frontend/public/images/CREDITS.md`، لكل صورة: من وين إجت (AI؟ أي أداة؟ ناسا؟).
      إذا صورة التلسكوب من ناسا، منكتب **"Image: NASA/JPL-Caltech"**. الحكام بيسألوا عن هالشي.
- [ ] **ممنوع شعار ناسا** (الـ meatball). منكتب اسم "NASA SPHEREx" كنص عادي، وهاد مسموح.

---

## 2. الألوان والخطوط (من تصميمك)

حطّيهم بمكان واحد (CSS variables أو Tailwind config) عشان سديل تستعملهم كمان:
```css
:root {
  --bg:        #05040f;   /* أسود فضائي */
  --bg-soft:   #0d0b1f;
  --purple:    #8b5cf6;   /* البنفسجي الأساسي ("Still." و "TRACE") */
  --purple-lt: #c4b5fd;
  --text:      #f5f3ff;
  --muted:     #a1a1b5;
  --border:    rgba(196, 181, 253, 0.35);  /* حدود الأزرار الـ pill */
}
```
*(القيم تقريبية من الصور. عدّليها لتطابق تصميمك بالزبط.)*
الخط: Sans هندسي ورفيع متل التصميم (مثلاً **Outfit** أو **Montserrat** من Google Fonts).

---

## 3. أقسام الصفحة

### Navbar (مشترك)
- [ ] يسار: شعار MARS، وبيودّي على `/`.
- [ ] يمين: **Home** و **Explorer** (`/explore`)، والصفحة الحالية تحتها خط.
- [ ] شفاف فوق الـ Hero، ولما ينزل المستخدم بتصير خلفيته غامقة.
- [ ] موبايل: قائمة ☰.

### Hero
- [ ] **طبقات** متل الـ Assets Board: خلفية فضاء، والأرض بالزاوية فوق يمين، والتلسكوب صغير جنب الأرض.
- [ ] العنوان **كنص HTML** (`<h1>`)، مش صورة:
  **The Sky Is Never Still.** وكلمة "Still." بالبنفسجي.
- [ ] تحته:
  "Beyond what the eye can see, the universe is always changing. Explore its hidden story through NASA SPHEREx."
- [ ] زر **Start Exploring →** بيودّي على `/explore`.
- [ ] مؤشر scroll (الماوس والسهم) تحت.

### Scroll animation (متل اللي رسمتيه)
- [ ] **Start:** التلسكوب صغير جنب الأرض.
- [ ] **Scrolling:** بيتحرك لليسار وبيكبر تدريجياً.
- [ ] **Arrive:** بيستقر يسار، والقسم التاني بيبيّن يمين.
- [ ] الأسهل: **Framer Motion** (`useScroll` و `useTransform`)، أو CSS scroll-driven animations.
- [ ] **`prefers-reduced-motion`:** إذا المستخدم مطفّي الحركة، اعرضي الوضع النهائي بدون animation.

### قسم "See What Time Reveals"
- [ ] سطر صغير: **POWERED BY SPHEREx**.
- [ ] العنوان: **See What Time Reveals.**
- [ ] النص (من تصميمك، مع الاسم الجديد):
  "NASA's SPHEREx observes the sky in infrared light, revealing what our eyes cannot see.
  MARS brings these observations together across time, helping you spot changes,
  investigate moving-object candidates, and uncover the stories hidden between them."
- [ ] *(إضافة قوية)* **Blink صغير حقيقي:** 3–4 صور SPHEREx حقيقية بتتقلّب لحالها كل ثانية، وتحتها
  التاريخ و"Data: NASA/IPAC IRSA".
  جنى بتجهزلك الصور كملفات PNG ثابتة من الباك إند، فصفحة Home **ما بتحتاج الباك إند يكون شغّال**.

### Footer (مشترك)
- [ ] الشعار + Home + Explorer.
- [ ] "Data: NASA SPHEREx via NASA/IPAC Infrared Science Archive (IRSA)".
- [ ] "NASA Space Apps Challenge 2026 · Planet X and SPHEREx".
- [ ] أسماء الفريق (اختياري).

---

## 4. قواعد مهمة
- [ ] **كل النصوص HTML**، بدون نص جوّا صور. هيك بتطلع واضحة، وبتنقرأ للـ SEO وقارئ الشاشة، وبتشتغل على الموبايل.
- [ ] **الصدق:** ممنوع "We found Planet X" أو "Discover new planets". منحكي "Explore" و"Spot changes" و"Investigate".
- [ ] **Responsive:** لازم تشتغل على 375px (موبايل) و 768px و 1440px.
- [ ] **الأداء:** صور WebP، و `next/image` مع `priority` لصور الـ Hero بس.
- [ ] `alt` لكل صورة: "Earth at night from orbit"، "NASA SPHEREx space telescope"…
- [ ] الصفحة **ما بتعتمد على الباك إند**: لازم تشتغل حتى لو الـ API مطفي.

---

## 5. Checklist التسليم
- [ ] شعار MARS بالـ Navbar والـ Footer.
- [ ] الـ Hero بيطابق التصميم (الطبقات والعنوان والزر).
- [ ] زر Start Exploring بيودّي على `/explore`.
- [ ] Scroll animation للتلسكوب شغّالة، وبتحترم reduced-motion.
- [ ] كل الصور WebP وأقل من 300KB، وملف `CREDITS.md` موجود.
- [ ] شغّالة على الموبايل.
- [ ] الألوان والخطوط بمكان واحد، وسديل بتستعملهم.
- [ ] `git push` + Pull Request على `main`.
