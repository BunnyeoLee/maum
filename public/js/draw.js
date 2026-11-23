// 그림 그리기 스튜디오 (미술치료 캔버스)
import { api, e, $, $$, toast, modal, openSOS, state } from './core.js';

const W = 1200, H = 900;
export const PALETTE = ['#2C3440', '#6B7280', '#A3A9B0', '#FFFFFF', '#7A4A2A', '#B9804F', '#E2574C', '#F28C6B', '#F2B544', '#F7DC6F', '#9BC86B', '#3E7C6A',
  '#5DB8A6', '#7FB3D5', '#3D6FB6', '#2E3F7F', '#8E7FC6', '#C39BD3', '#F4A6C1', '#D35D8E', '#FADBD8', '#FDEBD0', '#D5F5E3', '#D6EAF8'];
const TOOLS = [
  { id: 'pencil', label: '연필', icon: '✏️', alpha: 1 },
  { id: 'brush', label: '붓', icon: '🖌️', alpha: 0.9 },
  { id: 'crayon', label: '크레파스', icon: '🖍️', alpha: 1 },
  { id: 'marker', label: '형광펜', icon: '🖊️', alpha: 0.35 },
  { id: 'fill', label: '채우기', icon: '🪣', alpha: 1 },
  { id: 'eraser', label: '지우개', icon: '🧽', alpha: 1 },
];

// ── 랜딩 화면의 작은 그림판 ──
export function mountMiniPad(el) {
  const c = $('canvas', el), ctx = c.getContext('2d');
  const reply = $('.reply', el), hint = $('.hint', el);
  const size = () => { const r = c.getBoundingClientRect(); const d = devicePixelRatio || 1; const img = c.width ? ctx.getImageData(0, 0, c.width, c.height) : null; c.width = r.width * d; c.height = r.height * d; ctx.scale(d, d); img && ctx.putImageData(img, 0, 0); };
  size(); addEventListener('resize', size);
  let color = '#3E7C6A', down = false, last = null, dist = 0;
  const msgs = {
    '#3E7C6A': '초록 한 줄. 쉬고 싶은 마음일까요?', '#F2B544': '따뜻한 빛이 번졌어요. 그 온기를 더 이어 그려 봐요.',
    '#8E7FC6': '보랏빛 마음, 말로 하기 어려운 무언가가 있나요?', '#3D6FB6': '깊은 파랑. 그 무게를 여기 잠시 내려놓아도 괜찮아요.', '#2C3440': '어두운 선도 괜찮아요. 꺼내 놓은 것만으로 한 걸음이에요.',
  };
  $$('.swatches button', el).forEach((b) => b.onclick = () => { color = b.dataset.c; $$('.swatches button', el).forEach((x) => x.classList.toggle('on', x === b)); });
  const pos = (ev) => { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  c.onpointerdown = (ev) => { down = true; last = pos(ev); c.setPointerCapture(ev.pointerId); hint.style.opacity = 0; };
  c.onpointermove = (ev) => {
    if (!down) return;
    const p = pos(ev);
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.75;
    ctx.lineWidth = 6 + Math.min(14, Math.hypot(p[0] - last[0], p[1] - last[1]) * 0.5);
    ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke();
    dist += Math.hypot(p[0] - last[0], p[1] - last[1]); last = p;
  };
  c.onpointerup = () => { down = false; if (dist > 160) { reply.textContent = msgs[color]; reply.classList.add('on'); } };
}

// ── 본 스튜디오 ──
export function mountStudio(root, task) {
  root.innerHTML = `
    <div class="prompt-card"><span class="e">${task.icon}</span><div><b>${e(task.title)}</b><div>${e(task.prompt)}</div>
      <div class="tiny">잘 그리려고 하지 않아도 돼요. 떠오르는 대로 그려 주세요. <span class="timer" id="timer">00:00</span></div></div></div>
    <div class="studio">
      <div class="tools" role="toolbar" aria-label="그리기 도구">
        ${TOOLS.map((t) => `<button data-tool="${t.id}" class="${t.id === 'pencil' ? 'on' : ''}" aria-label="${t.label}"><span>${t.icon}</span>${t.label}</button>`).join('')}
        <hr><button id="undo" aria-label="되돌리기"><span>↶</span>되돌리기</button><button id="redo" aria-label="다시하기"><span>↷</span>다시</button>
        <button id="clear" aria-label="전체 지우기"><span>🗑️</span>새로</button>
      </div>
      <div class="canvas-wrap" id="cw"><canvas id="cDraw" width="${W}" height="${H}"></canvas><canvas id="cLive" width="${W}" height="${H}"></canvas><canvas class="guide" id="cGuide" width="${W}" height="${H}"></canvas></div>
      <div class="side">
        <div class="panel"><div class="small muted" style="margin-bottom:8px">색</div>
          <div class="palette">${PALETTE.map((c, i) => `<button data-c="${c}" style="background:${c}" class="${i === 0 ? 'on' : ''}" aria-label="색 ${c}"></button>`).join('')}</div>
          <label class="row small" style="margin-top:10px">직접 고르기 <input type="color" id="picker" value="#2C3440" style="width:44px;height:30px;border:0;background:none"></label>
          <div class="small muted" style="margin:12px 0 2px">굵기 <span id="sizeV">12</span></div>
          <input type="range" class="range" id="size" min="2" max="80" value="12">
        </div>
        <div class="panel">
          <button class="btn block" id="finish">다 그렸어요</button>
          <div class="row" style="margin-top:8px"><button class="btn soft sm" id="download" style="flex:1">내 기기에 저장</button><button class="btn soft sm" id="draft" style="flex:1">임시 저장</button></div>
          <p class="tiny" style="margin:10px 0 0">'다 그렸어요'를 누르면 몇 가지 질문 후 상담 선생님에게 전달돼요.</p>
        </div>
      </div>
    </div>`;

  const cDraw = $('#cDraw', root), cLive = $('#cLive', root), cGuide = $('#cGuide', root);
  const dctx = cDraw.getContext('2d', { willReadFrequently: true }), lctx = cLive.getContext('2d'), gctx = cGuide.getContext('2d');
  drawGuide(gctx, task.guide || (task.id === 'mandala' ? 'mandala' : null));
  const S = { tool: 'pencil', color: '#2C3440', size: 12, undo: [], redo: [], down: false, pts: [], opened: Date.now(), started: null,
    meta: { strokes: 0, erases: 0, undos: 0, clears: 0, colors: new Set(), tools: new Set() } };

  const timer = setInterval(() => {
    if (!document.body.contains(root)) return clearInterval(timer);
    const s = Math.floor((Date.now() - S.opened) / 1000);
    $('#timer', root).textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);

  const snapshot = () => { S.undo.push(dctx.getImageData(0, 0, W, H)); if (S.undo.length > 25) S.undo.shift(); S.redo = []; };
  const toolDef = () => TOOLS.find((t) => t.id === S.tool);
  const pos = (ev) => { const r = cDraw.getBoundingClientRect(); return { x: (ev.clientX - r.left) * (W / r.width), y: (ev.clientY - r.top) * (H / r.height), p: ev.pressure && ev.pointerType !== 'mouse' ? ev.pressure : 0.6 }; };

  $$('[data-tool]', root).forEach((b) => b.onclick = () => { S.tool = b.dataset.tool; $$('[data-tool]', root).forEach((x) => x.classList.toggle('on', x === b)); });
  const setColor = (c) => { S.color = c; $$('.palette button', root).forEach((x) => x.classList.toggle('on', x.dataset.c === c)); };
  $$('.palette button', root).forEach((b) => b.onclick = () => { setColor(b.dataset.c); if (S.tool === 'eraser') $('[data-tool="pencil"]', root).click(); });
  $('#picker', root).oninput = (ev) => setColor(ev.target.value);
  $('#size', root).oninput = (ev) => { S.size = Number(ev.target.value); $('#sizeV', root).textContent = S.size; };
  $('#undo', root).onclick = () => { if (!S.undo.length) return; S.redo.push(dctx.getImageData(0, 0, W, H)); dctx.putImageData(S.undo.pop(), 0, 0); S.meta.undos++; };
  $('#redo', root).onclick = () => { if (!S.redo.length) return; S.undo.push(dctx.getImageData(0, 0, W, H)); dctx.putImageData(S.redo.pop(), 0, 0); };
  $('#clear', root).onclick = () => { snapshot(); dctx.clearRect(0, 0, W, H); S.meta.clears++; };

  cDraw.parentElement.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const p = pos(ev);
    S.started ||= Date.now();
    S.meta.tools.add(S.tool);
    if (S.tool === 'fill') { snapshot(); floodFill(dctx, cGuide, p.x | 0, p.y | 0, S.color); S.meta.colors.add(S.color); S.meta.strokes++; return; }
    snapshot();
    cDraw.parentElement.setPointerCapture(ev.pointerId);
    S.down = true; S.pts = [p];
    if (S.tool === 'eraser') S.meta.erases++; else { S.meta.strokes++; S.meta.colors.add(S.color); }
    cLive.style.opacity = toolDef().alpha;
    dot(p);
  });
  cDraw.parentElement.addEventListener('pointermove', (ev) => {
    if (!S.down) return;
    const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
    evs.forEach((ce) => { const p = pos(ce); seg(S.pts[S.pts.length - 1], p); S.pts.push(p); });
  });
  const up = () => {
    if (!S.down) return;
    S.down = false;
    if (S.tool !== 'eraser' && S.tool !== 'crayon') {
      dctx.save(); dctx.globalAlpha = toolDef().alpha; dctx.drawImage(cLive, 0, 0); dctx.restore();
      lctx.clearRect(0, 0, W, H);
    }
  };
  cDraw.parentElement.addEventListener('pointerup', up);
  cDraw.parentElement.addEventListener('pointercancel', up);

  function width(p) { return S.tool === 'brush' ? S.size * (0.35 + p.p * 1.1) : S.tool === 'pencil' ? Math.max(1.5, S.size * 0.45) : S.tool === 'marker' ? S.size * 1.6 : S.size; }
  function dot(p) {
    if (S.tool === 'crayon') return crayon(p, p);
    const ctx = S.tool === 'eraser' ? dctx : lctx;
    ctx.save();
    if (S.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = S.color; ctx.beginPath(); ctx.arc(p.x, p.y, width(p) / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function seg(a, b) {
    if (S.tool === 'crayon') return crayon(a, b);
    const ctx = S.tool === 'eraser' ? dctx : lctx;
    ctx.save();
    if (S.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; } else ctx.strokeStyle = S.color;
    ctx.lineCap = S.tool === 'marker' ? 'square' : 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = S.tool === 'eraser' ? S.size * 1.5 : width(b);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
  }
  function crayon(a, b) {
    const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), r = S.size / 2;
    dctx.save(); dctx.fillStyle = S.color;
    const dsz = Math.max(2, r * 0.32);
    for (let i = 0; i <= d; i += 1.2) {
      const x = a.x + ((b.x - a.x) * i) / d, y = a.y + ((b.y - a.y) * i) / d;
      for (let k = 0; k < Math.max(6, r * 2.2); k++) {
        const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
        dctx.globalAlpha = 0.35 + Math.random() * 0.55;
        dctx.fillRect(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, dsz, dsz);
      }
    }
    dctx.restore();
  }

  function exportPng() {
    const o = document.createElement('canvas'); o.width = W; o.height = H;
    const x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(cDraw, 0, 0); x.drawImage(cGuide, 0, 0);
    return o.toDataURL('image/png');
  }
  function metrics() {
    const sw = 160, sh = 120, o = document.createElement('canvas'); o.width = sw; o.height = sh;
    const x = o.getContext('2d'); x.drawImage(cDraw, 0, 0, sw, sh);
    const d = x.getImageData(0, 0, sw, sh).data;
    let n = 0, sx = 0, sy = 0, minx = sw, miny = sh, maxx = -1, maxy = -1, dark = 0, warm = 0, cool = 0, red = 0;
    for (let i = 0; i < sw * sh; i++) {
      const a = d[i * 4 + 3]; if (a < 40) continue;
      const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx, s = mx ? (mx - mn) / mx : 0;
      if (v > 0.95 && s < 0.06) continue; // 흰색 칠은 제외
      let h = 0; if (mx !== mn) { h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h = (h * 60 + 360) % 360; }
      const px = i % sw, py = (i / sw) | 0;
      n++; sx += px; sy += py; minx = Math.min(minx, px); maxx = Math.max(maxx, px); miny = Math.min(miny, py); maxy = Math.max(maxy, py);
      if (v < 0.3 || (s < 0.15 && v < 0.5)) dark++;
      else if (s >= 0.15) { if (h < 70 || h > 320) warm++; if (h >= 150 && h <= 280) cool++; if ((h < 15 || h > 345) && s > 0.45) red++; }
    }
    const f = (k) => (n ? +(k / n).toFixed(3) : 0);
    return {
      duration: Math.round((Date.now() - S.opened) / 1000), drawTime: S.started ? Math.round((Date.now() - S.started) / 1000) : 0,
      strokes: S.meta.strokes, erases: S.meta.erases, undos: S.meta.undos, clears: S.meta.clears,
      colors: [...S.meta.colors], tools: [...S.meta.tools],
      coverage: +(n / (sw * sh)).toFixed(3), bboxRatio: n ? +(((maxx - minx + 1) * (maxy - miny + 1)) / (sw * sh)).toFixed(3) : 0,
      center: n ? { x: +(sx / n / sw).toFixed(3), y: +(sy / n / sh).toFixed(3) } : null,
      darkRatio: f(dark), warmRatio: f(warm), coolRatio: f(cool), redRatio: f(red),
    };
  }
  const isEmpty = () => metrics().coverage < 0.002;

  $('#download', root).onclick = () => { const a = document.createElement('a'); a.href = exportPng(); a.download = `마음결_${task.title}_${new Date().toISOString().slice(0, 10)}.png`; a.click(); };
  $('#draft', root).onclick = async (ev) => {
    if (isEmpty()) return toast('아직 아무것도 그려지지 않았어요.');
    ev.target.disabled = true;
    try { await api('/drawings', { body: { task_id: task.id, image: exportPng(), meta: metrics(), pdi: {}, submit: false } }); toast('나의 그림첩에 저장했어요.', 'ok'); }
    catch (err) { toast(err.message); } finally { ev.target.disabled = false; }
  };
  $('#finish', root).onclick = () => {
    if (isEmpty()) return toast('한 줄이라도 괜찮아요. 무언가를 그려 주세요.');
    const image = exportPng(), meta = metrics();
    askPdi(task, image, meta);
  };
}

function askPdi(task, image, meta) {
  const m = modal(`<h3>그림에게 말을 걸어 볼까요?</h3>
    <p class="muted small">정답은 없어요. 떠오르는 대로 답해 주세요. 건너뛰어도 괜찮아요.</p>
    <img src="${image}" alt="방금 그린 그림" class="drawing-big" style="max-height:240px;object-fit:contain;margin-bottom:16px">
    <form id="pdiForm">${task.pdi.map((p) => `<label class="field"><span>${e(p.q)}</span>${p.type === 'choice'
      ? `<div class="seg">${p.options.map((o) => `<label><input type="radio" name="${p.id}" value="${e(o)}"><span>${e(o)}</span></label>`).join('')}</div>`
      : `<textarea class="input" name="${p.id}" rows="2" maxlength="1000"></textarea>`}</label>`).join('')}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn soft" data-close>더 그릴래요</button><button class="btn" id="pdiSend">상담 선생님에게 보내기</button></div>
    </form>`, { wide: true });
  $('#pdiForm', m.el).onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target), pdi = {};
    task.pdi.forEach((p) => { const v = fd.get(p.id); if (v) pdi[p.id] = String(v).trim(); });
    $('#pdiSend', m.el).disabled = true;
    try {
      const r = await api('/drawings', { body: { task_id: task.id, image, meta, pdi, submit: true } });
      m.close();
      location.hash = `#/gallery/${r.id}?new=1`;
      if (r.sos) setTimeout(() => openSOS({ auto: true, level: r.risk }), 400);
    } catch (err) { toast(err.message); $('#pdiSend', m.el).disabled = false; }
  };
}

function drawGuide(g, type) {
  g.clearRect(0, 0, W, H);
  if (type === 'mandala') {
    g.strokeStyle = '#B9C6C1'; g.lineWidth = 3;
    const cx = W / 2, cy = H / 2;
    [400, 300, 200, 110, 40].forEach((r) => { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); });
    g.lineWidth = 2; g.setLineDash([6, 8]);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40); g.lineTo(cx + Math.cos(a) * 400, cy + Math.sin(a) * 400); g.stroke(); }
    g.setLineDash([]);
  }
  if (type === 'split') {
    g.strokeStyle = '#B9C6C1'; g.lineWidth = 3; g.setLineDash([14, 12]);
    g.beginPath(); g.moveTo(W / 2, 20); g.lineTo(W / 2, H - 20); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#A9B6B1'; g.font = '28px sans-serif'; g.fillText('화면 안의 나', 30, 50); g.fillText('화면 밖의 나', W / 2 + 30, 50);
  }
}

function floodFill(ctx, guideCanvas, x0, y0, hex) {
  const comp = document.createElement('canvas'); comp.width = W; comp.height = H;
  const c = comp.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.drawImage(ctx.canvas, 0, 0); c.drawImage(guideCanvas, 0, 0);
  const src = c.getImageData(0, 0, W, H).data;
  const img = ctx.getImageData(0, 0, W, H), out = img.data;
  const i0 = (y0 * W + x0) * 4, tr = src[i0], tg = src[i0 + 1], tb = src[i0 + 2];
  const fr = parseInt(hex.slice(1, 3), 16), fg = parseInt(hex.slice(3, 5), 16), fb = parseInt(hex.slice(5, 7), 16);
  if (Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) < 6) return;
  const tol = 60, seen = new Uint8Array(W * H), stack = [x0, y0];
  const match = (i) => Math.abs(src[i] - tr) + Math.abs(src[i + 1] - tg) + Math.abs(src[i + 2] - tb) <= tol;
  while (stack.length) {
    const y = stack.pop(); let x = stack.pop();
    while (x >= 0 && !seen[y * W + x] && match((y * W + x) * 4)) x--;
    x++;
    let up = false, dn = false;
    while (x < W && !seen[y * W + x] && match((y * W + x) * 4)) {
      const p = y * W + x; seen[p] = 1; out[p * 4] = fr; out[p * 4 + 1] = fg; out[p * 4 + 2] = fb; out[p * 4 + 3] = 255;
      if (y > 0) { const q = p - W; if (!seen[q] && match(q * 4)) { if (!up) { stack.push(x, y - 1); up = true; } } else up = false; }
      if (y < H - 1) { const q = p + W; if (!seen[q] && match(q * 4)) { if (!dn) { stack.push(x, y + 1); dn = true; } } else dn = false; }
      x++;
    }
  }
  // 경계의 안티앨리어싱 틈을 메우기 위해 한 픽셀 확장
  const grow = new Uint8Array(seen);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x; if (seen[p]) continue;
    if ((seen[p - 1] || seen[p + 1] || seen[p - W] || seen[p + W]) && Math.abs(src[p * 4] - tr) + Math.abs(src[p * 4 + 1] - tg) + Math.abs(src[p * 4 + 2] - tb) <= 420) { grow[p] = 1; out[p * 4] = fr; out[p * 4 + 1] = fg; out[p * 4 + 2] = fb; out[p * 4 + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
}
