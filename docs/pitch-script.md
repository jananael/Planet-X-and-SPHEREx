# طريقة عرض السلايدات (3 دقائق + دقيقتين أسئلة)

الملف: `docs/SKYTRACE-Pitch-v4.pptx` (7 سلايدات، نفس الكلام موجود بالـ Speaker Notes).
العرض **بالإنجليزي**. كل واحد بيحكي جزء، وواحد بس بيسوق الديمو.

| # | السلايد | الوقت | مين | المعيار |
|---|---|---|---|---|
| 1 | Title & tagline | 0:00–0:15 | متحدث 1 | Presentation |
| 2 | Problem (Lina) | 0:15–0:45 | متحدث 1 | Impact |
| 3 | Solution: what is new | 0:45–1:10 | متحدث 2 | Creativity, Relevance |
| 4 | How it works + NASA data | 1:10–1:45 | متحدث 3 (العلمي) | Relevance, Validity |
| 5 | Demo (live) | 1:45–2:25 | متحدث 4 (سايق الديمو) | Validity, Presentation |
| 6 | Impact | 2:25–2:45 | متحدث 5 | Impact |
| 7 | Next steps & team | 2:45–3:00 | متحدث 1 | Validity, Impact |

## النص

**1. Title (15 ث)**
"We are Team SKYTRACE from the Ramallah local event, and our challenge is Planet X and SPHEREx.
SKYTRACE is a guided explorer of real NASA SPHEREx infrared images: you see what moves in the sky, and then you
check the evidence."

**2. Problem (30 ث)**
"Meet Lina, a physics student in Ramallah. She is an illustrative user, but her problem is real.
She hears NASA's SPHEREx is mapping the whole sky, and she wants to know one thing: did anything here move?
For one single point, Barnard's Star, there are 358 SPHEREx images in 13 months, on six detectors. Raw FITS files,
not a picture.
Why now: SPHEREx data become public within 60 days, and in 2025 the interstellar comet 3I/ATLAS crossed its sky.
And moving objects really do hide in archives: Hubble Asteroid Hunter found 1,031 uncatalogued asteroids in old images."

**3. Solution (25 ث)**
"SKYTRACE turns those files into an investigation in three steps. Choose a place or an object. Compare the real
SPHEREx images: blink, slide, or look at the difference. Then understand what you see: the object's real orbit, and
its path across the night sky, year by year.
What is new: research tools start from a catalogue. We start from a question, 'did anything move here?', and walk
anyone to the answer and its evidence."

**4. How it works (35 ث)**
"Our core data is NASA SPHEREx, from the IRSA archive: collections spherex_dr1 and spherex_qr3, 102 bands over six
detectors. Orbits come from JPL Horizons; context from AllWISE and ESA's Gaia DR3.
We find every image covering a point in a time window, cut it out, read its quality flags, and align it north-up.
Our engine finds pixel peaks with signal-to-noise of at least 5, links them across frames to see motion, and matches
them with known stars and solar-system objects. Candidates stay 'pending validation'. We never say 'discovered'."

**5. Demo (40 ث)** (لايف على الموقع)
"This is the live site, open to anyone, no login. We pick the asteroid Vesta. SKYTRACE finds the real SPHEREx images
from 13 July 2026, each with its time, band and file. 'Explain the data' shows Vesta's real orbit from JPL Horizons.
'Simple explanation' shows Vesta travelling across the real night sky, past Orion.
Working today: search, images, comparison, orbit, sky story and the candidate engine. Next: scientific review of
candidates."

مسار الديمو: Explorer ← Choose a suggested target ← (4) Vesta ← View selected images ← Explain the data ←
Simple explanation.

**6. Impact (20 ث)**
"Who benefits? University students, who can see real NASA data move without a telescope. Teachers and astronomy
clubs, who get a ready lesson. And citizen scientists, who get a guided first look before joining NASA projects.
People want to take part: NASA's Zooniverse projects have 324,000 volunteers since 2020.
Locally: SKYTRACE is free, in any browser, no login. Next: a pilot with one university astronomy class."

**7. Next & team (15 ث)**
"Next: a December pilot, validating the engine on Vesta and 3I/ATLAS, and partnering with teachers and clubs.
Our limits: candidates are not confirmed yet, and SPHEREx coverage is still filling in.
We are Jana, Sadeel, Batool, Yazan, Taqwa and Haneen. The sky is never still. Thank you."

## قبل العرض

- **قبل بـ 10 دقائق:** افتحوا https://skytrace-api-pwq3.onrender.com/api/health (السيرفر المجاني بينام، أول فتحة ~دقيقة).
  بعدين افتحوا Vesta مرة عشان الصور تتحمّل.
- **نسخة احتياطية:** تسجيل شاشة للديمو (لو النت وقع)، والملف على USB وعلى الكلاود.
- تدربوا 3 مرات مع تايمر، ووقفوا عند 3:00.
- لا تقرأوا عن السلايد. احكوا مع الحكام.

## أسئلة الحكام المتوقعة (جواب: جملة ← دليل ← رجوع للأثر، أقل من 20 ث)

| المعيار | السؤال | الجواب |
|---|---|---|
| Impact | Who will use it, and how will it reach them? | Students and teachers first, through a university class pilot; free link, no login. |
| Creativity | What exists already, and why is yours different? | IRSA has expert tools (source discovery, mosaics). We guide non-experts from a question to the evidence, with the real orbit and sky story. |
| Validity | How do you know it's right? What is real and what is mocked? | Everything on screen is real archive data; Vesta's position matches JPL Horizons; candidates stay "pending validation". |
| Relevance | Which NASA data, and what breaks without it? | SPHEREx spherex_dr1 + spherex_qr3 via IRSA, JPL Horizons, AllWISE. Without them there are no images and no orbits. |
| Presentation | Your project in one sentence? | "A guided explorer of real NASA SPHEREx images: see what moves in the sky, then check the evidence." |
| AI | How did you use AI? | AI assistants (Claude Code, Codex) helped write code and draft slides; the team checked every claim and number. |

> Lina شخصية توضيحية (illustrative)، مكتوبة هيك على السلايد. لو حد سأل، قولوا هيك بصراحة.
