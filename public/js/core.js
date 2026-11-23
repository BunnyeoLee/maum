// 공통 도구: API 호출, 이스케이프, 토스트, 모달, 실시간 연결, SOS
export const state = { user: null, devMail: false, ai: false, tests: null, categories: null, tasks: null, listeners: {} };

export async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
    });
  } catch {
    throw new Error('서버에 연결할 수 없어요. 인터넷 연결과 서버 실행 상태를 확인한 뒤 새로고침해 주세요.');
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    if (res.status === 401 && state.user) { state.user = null; location.hash = '#/'; }
    if (!isJson) throw new Error(`서버가 응답하지 않아요 (오류 ${res.status}). 서버가 꺼져 있거나 잠든 상태일 수 있어요. 터미널에서 npm start 로 서버를 켠 뒤 새로고침해 주세요.`);
    throw new Error(data.error || `요청을 처리하지 못했어요 (오류 ${res.status}).`);
  }
  return data;
}

export const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const riskPill = (r, label) => `<span class="pill r${r}">${e(label ?? ['안정', '관심', '위험', '긴급'][r])}</span>`;
export const fmtTime = (s) => (s ? s.replace(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d).*/, '$2월 $3일 $4:$5').replace(/^0/, '') : '');

export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toastRoot').appendChild(el);
  setTimeout(() => el.remove(), type === 'alert' ? 8000 : 3200);
}

export function modal(html, { wide = false, onClose } = {}) {
  const root = $('#modalRoot');
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (ev) => ev.key === 'Escape' && close();
  bg.addEventListener('click', (ev) => { if (ev.target === bg || ev.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', esc);
  root.appendChild(bg);
  const f = bg.querySelector('input, textarea, button:not([data-close])');
  f && f.focus();
  return { el: bg.firstElementChild, close };
}

export function confirmBox(title, body, okLabel = '확인') {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(`<h3>${e(title)}</h3><p class="muted">${body}</p><div class="row" style="justify-content:flex-end;margin-top:18px">
      <button class="btn soft" data-close>취소</button><button class="btn" id="cbOk">${e(okLabel)}</button></div>`, { onClose: () => !done && resolve(false) });
    $('#cbOk', m.el).onclick = () => { done = true; m.close(); resolve(true); };
  });
}

// 실시간 이벤트
let es = null;
export function on(evt, fn) { (state.listeners[evt] ||= new Set()).add(fn); return () => state.listeners[evt].delete(fn); }
export function connectStream() {
  if (es) es.close();
  es = new EventSource('/api/stream');
  ['message', 'alert', 'session', 'drawing', 'drawing-ai', 'drawing-interpreted'].forEach((evt) =>
    es.addEventListener(evt, (ev) => { const d = JSON.parse(ev.data); (state.listeners[evt] || []).forEach((fn) => fn(d)); }));
}
export function disconnectStream() { if (es) es.close(); es = null; }

export function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
  } catch {}
}

// SOS 안내 창
export function openSOS({ auto = false, level = 3 } = {}) {
  const youth = ['elem', 'middle', 'high'].includes(state.user?.grp);
  const m = modal(`<div class="sos-modal">
    <h2>${auto ? '지금 많이 힘드시죠' : '도움을 요청해 줘서 고마워요'}</h2>
    <p>${auto ? '방금 들려준 마음이 걱정돼요. 당신은 혼자가 아니에요. ' : ''}지금 바로 이야기할 수 있는 곳이 있어요. 모든 전화는 24시간, 무료예요.</p>
    <div class="calls">
      <a class="call main" href="tel:109"><b>109</b><span>자살예방 상담전화<br><small>전화가 어렵다면 109로 문자를 보내세요</small></span></a>
      ${youth ? '<a class="call" href="tel:1388"><b>1388</b><span>청소년 상담전화 (문자·카카오톡 가능)</span></a>' : ''}
      <a class="call" href="tel:15770199"><b>1577-0199</b><span>정신건강 위기상담</span></a>
      <a class="call" href="tel:119"><b>119 · 112</b><span>지금 위험한 상황이라면 바로 신고하세요</span></a>
    </div>
    <div class="row" style="margin-bottom:16px">
      <button class="btn coral" id="sosNotify">마음결 상담 선생님에게 알리기</button>
      <a class="btn ghost" href="#/chat" data-close>채팅 상담 시작하기</a>
      <a class="btn soft" href="#/safety" data-close>나의 안전계획 보기</a>
    </div>
    <div class="ground"><b>지금, 잠깐 함께 숨 쉬어요.</b><br>
      눈에 보이는 것 5가지, 들리는 소리 4가지, 몸에 닿는 감촉 3가지를 천천히 떠올려 보세요. 그리고 숨을 4초 들이마시고, 6초 내쉬어요.</div>
    <p class="tiny" style="margin-top:14px">${auto && level >= 2 ? '마음결 상담 선생님에게 알림이 전달되었어요. 곧 연락드릴게요.' : '위 버튼을 누르면 마음결 상담 선생님에게 바로 알려져요.'}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn soft sm" data-close>닫기</button></div></div>`);
  $('#sosNotify', m.el).onclick = async (ev) => {
    ev.target.disabled = true;
    try { await api('/sos', { body: { message: auto ? '자동 감지 후 도움 요청' : '' } }); ev.target.textContent = '알렸어요. 곧 연락드릴게요'; toast('상담 선생님에게 알렸어요.', 'ok'); }
    catch (err) { ev.target.disabled = false; toast(err.message); }
  };
}

export const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#DCEBE5"/><circle cx="44" cy="22" r="7" fill="#F2B544"/><path d="M14 46c6-16 18-24 34-24-4 14-16 24-34 24z" fill="#3E7C6A"/><path d="M14 46c10-6 18-12 26-20" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;

export function sparkline(values, { w = 220, h = 48, min = 1, max = 5, color = '#3E7C6A' } = {}) {
  if (!values.length) return '';
  const pts = values.map((v, i) => [values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 8) + 4, h - 4 - ((v - min) / (max - min || 1)) * (h - 8)]);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="최근 추이"><polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p) => p.join(',')).join(' ')}"/>${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${color}"/>`).join('')}</svg>`;
}

export const fmtPhone = (p) => String(p || '').replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
