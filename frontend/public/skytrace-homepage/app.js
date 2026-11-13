const canvas = document.querySelector('#stars');
const ctx = canvas.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches;
let width, height, stars, frame;
const target = { x: 0, y: 0, scroll: window.scrollY };
const camera = { ...target };
let lastTime = 0;
let elapsed = 0;
const wrap = (value, size) => ((value % size) + size) % size;
function resize() {
  width = document.documentElement.clientWidth;
  height = document.documentElement.scrollHeight;
  document.querySelector('.cosmos').style.height = `${height}px`;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * ratio; canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  let seed = 231;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  stars = Array.from({ length: Math.floor(width * height / 4600) }, () => {
    const depth = .2 + random() * .8;
    return { x: random() * width, y: random() * height, depth,
      r: .25 + depth * .9, phase: random() * Math.PI * 2,
      speed: random() * .00045 + .00015 };
  });
  draw();
}
function draw() {
  ctx.clearRect(0, 0, width, height);
  for (const star of stars) {
    const alpha = .18 + (Math.sin(elapsed * star.speed + star.phase) + 1) * .28;
    // Nearby stars respond more; scroll offsets soften the page's natural motion.
    const x = wrap(star.x - camera.x * 30 * star.depth + elapsed * .00065 * star.depth, width);
    const y = wrap(star.y - camera.y * 20 * star.depth + camera.scroll * .24 * star.depth, height);
    ctx.fillStyle = `rgba(174,218,242,${alpha})`;
    ctx.beginPath(); ctx.arc(x, y, star.r, 0, Math.PI * 2); ctx.fill();
  }
}
function animate(time) {
  const delta = lastTime ? Math.min(time - lastTime, 64) : 0;
  lastTime = time;
  elapsed += delta;
  moveScout(delta);
  const ease = 1 - Math.exp(-delta / 150);
  camera.x += (target.x - camera.x) * ease;
  camera.y += (target.y - camera.y) * ease;
  camera.scroll += (target.scroll - camera.scroll) * ease;
  draw();
  frame = requestAnimationFrame(animate);
}
window.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  target.x = event.clientX / window.innerWidth * 2 - 1;
  target.y = event.clientY / window.innerHeight * 2 - 1;
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { target.x = target.y = 0; });
window.addEventListener('blur', () => { target.x = target.y = 0; });
window.addEventListener('scroll', () => { target.scroll = window.scrollY; }, { passive: true });
const motionButton = document.querySelector('.motion-toggle');
function syncMotion() {
  document.body.classList.toggle('paused', paused);
  motionButton.setAttribute('aria-pressed', String(paused));
  motionButton.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
  motionButton.title = paused ? 'Play animation' : 'Pause animation';
  motionButton.textContent = paused ? '▷' : 'Ⅱ';
  cancelAnimationFrame(frame);
  lastTime = 0;
  if (!paused && !document.hidden) frame = requestAnimationFrame(animate); else draw();
}
motionButton.addEventListener('click', () => { paused = !paused; syncMotion(); });
reducedMotion.addEventListener('change', event => { paused = event.matches; syncMotion(); });
document.addEventListener('visibilitychange', syncMotion);
window.addEventListener('resize', resize);
window.addEventListener('load', resize);
resize(); syncMotion();
// Random telescope flight stays in the right-hand corridor, clear of Earth and text.
const scout = document.querySelector('.small-telescope');
const hero = document.querySelector('.hero');
const earthOrbit = document.querySelector('.earth-orbit');
let flight;
function resetFlight() {
  const heroBox = hero.getBoundingClientRect();
  const copyBox = document.querySelector('.hero-copy').getBoundingClientRect();
  const radius = Math.hypot(scout.offsetWidth, scout.offsetHeight) / 2 + 8;
  const orbitStyle = getComputedStyle(earthOrbit);
  const earthSize = parseFloat(orbitStyle.width);
  const earth = {
    x: hero.clientWidth - parseFloat(orbitStyle.right) - earthSize / 2,
    y: parseFloat(orbitStyle.top) + earthSize / 2,
    radius: earthSize * .455 + radius + 12
  };
  const obstacles = [];
  document.querySelectorAll('.hero-copy h1, .hero-copy p, .explore-button, .site-header .brand').forEach(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    for (const box of range.getClientRects()) {
      obstacles.push({left:box.left-heroBox.left-radius, right:box.right-heroBox.left+radius,
        top:box.top-heroBox.top-radius, bottom:box.bottom-heroBox.top+radius});
    }
  });
  const bounds = { left: Math.max(radius+10, hero.clientWidth*.76), right: hero.clientWidth-radius-10,
    top: Math.max(120+radius, copyBox.top-heroBox.top-110), bottom: copyBox.top-heroBox.top+30 };
  const safe = p => p.x >= bounds.left && p.x <= bounds.right && p.y >= bounds.top && p.y <= bounds.bottom
    && Math.hypot(p.x-earth.x, p.y-earth.y) > earth.radius
    && !obstacles.some(box => p.x>box.left && p.x<box.right && p.y>box.top && p.y<box.bottom);
  const sample = () => ({ x: bounds.left + Math.random() * (bounds.right - bounds.left), y: bounds.top + Math.random() * (bounds.bottom - bounds.top) });
  const pick = from => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const point = sample();
      if (!safe(point)) continue;
      if (from && !Array.from({length: 21}, (_, i) => ({x: from.x + (point.x-from.x)*i/20, y: from.y + (point.y-from.y)*i/20})).every(safe)) continue;
      if (!from || Math.hypot(point.x-from.x, point.y-from.y) > 22) return point;
    }
    return from;
  };
  // Prefer a starting position near Earth, then fall back to any safe point.
  const initial = {x: Math.min(bounds.right, hero.clientWidth * .84), y: bounds.bottom - 10};
  const start = safe(initial) ? initial : pick(null);
  flight = start ? { from: start, to: pick(start), progress: 0, duration: 3500 + Math.random()*2500, pick, safe } : null;
  scout.style.visibility = flight ? 'visible' : 'hidden';
  if (flight) { planFlight(); renderFlight(start, flight.angleFrom); }
}
function renderFlight(point, angle) {
  scout.style.left = `${point.x - scout.offsetWidth/2}px`;
  scout.style.top = `${point.y - scout.offsetHeight/2}px`;
  scout.style.transform = `rotate(${angle}deg)`;
}
function planFlight() {
  flight.to = flight.pick(flight.from);
  flight.angleFrom = flight.angleTo ?? -10;
  flight.angleTo = -18 + Math.random() * 24;
  const midpoint = {x: (flight.from.x + flight.to.x)/2, y: (flight.from.y + flight.to.y)/2};
  flight.control = midpoint;
  // Try a different curve each leg, checking the whole arc against the safe zone.
  for (let i = 0; i < 80; i++) {
    const control = {x: midpoint.x + (Math.random()-.5)*100, y: midpoint.y + (Math.random()-.5)*70};
    const clear = Array.from({length: 41}, (_, j) => {
      const t = j/40, u = 1-t;
      return {x: u*u*flight.from.x + 2*u*t*control.x + t*t*flight.to.x,
        y: u*u*flight.from.y + 2*u*t*control.y + t*t*flight.to.y};
    }).every(flight.safe);
    if (clear) { flight.control = control; break; }
  }
  const distance = Math.hypot(flight.to.x-flight.from.x, flight.to.y-flight.from.y);
  flight.duration = Math.max(6500, Math.min(12000, distance/(12+Math.random()*10)*1000));
  flight.progress = 0;
}
function moveScout(delta) {
  if (!flight) return;
  flight.progress = Math.min(1, flight.progress + delta/flight.duration);
  const t = flight.progress * flight.progress * (3 - 2 * flight.progress), u = 1-t;
  renderFlight({
    x: u*u*flight.from.x + 2*u*t*flight.control.x + t*t*flight.to.x,
    y: u*u*flight.from.y + 2*u*t*flight.control.y + t*t*flight.to.y
  }, flight.angleFrom + (flight.angleTo-flight.angleFrom)*t);
  if (flight.progress === 1) {
    flight.from = flight.to;
    planFlight();
  }
}
window.addEventListener('resize', resetFlight);
window.addEventListener('load', resetFlight);
document.fonts.ready.then(resetFlight);
resetFlight();
// Scroll-linked fade: reverse gradually when returning toward the hero.
const missionSection = document.querySelector('.mission');
let missionFadeFrame = 0;
function updateMissionFade() {
  missionFadeFrame = 0;
  const rect = missionSection.getBoundingClientRect();
  const viewport = window.innerHeight;
  const progress = Math.max(0, Math.min(1, (viewport * .85 - rect.top) / (viewport * .5)));
  const eased = progress * progress * (3 - 2 * progress);
  missionSection.style.setProperty('--mission-opacity', String(eased));
  missionSection.style.setProperty('--mission-offset', `${(1-eased)*45}px`);
}
function scheduleMissionFade() {
  if (!missionFadeFrame) missionFadeFrame = requestAnimationFrame(updateMissionFade);
}
missionSection.classList.add('mission-reveal');
window.addEventListener('scroll', scheduleMissionFade, {passive:true});
window.addEventListener('resize', scheduleMissionFade);
window.addEventListener('load', scheduleMissionFade);
updateMissionFade();