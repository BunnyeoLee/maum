// 위기 신호 감지(텍스트) · 그림 과제 정의 · 그림 지표 규칙 기반 해석

// ── 1. 텍스트 위기 신호 감지 ──────────────────────────────
// 공백·특수문자를 제거하고 비교합니다. (키워드 기반 1차 감지 — 최종 판단은 반드시 사람이 합니다)
const URGENT = [
  '죽고싶', '죽고싶어', '죽어버리', '죽을래', '죽을거', '자살', '목숨을끊', '목숨끊', '극단적선택', '뛰어내리',
  '유서', '자해', '손목을긋', '손목긋', '목을매', '목매', '약을모아', '수면제모아', '번개탄', '살기싫어서',
  '살고싶지않', '사라지고싶', '끝내고싶', '세상을떠나', '없어지고싶', 'ㅈㄱㅅㄷ', 'ㅈㅅ하고', '죽는게나아', '죽는게낫',
  '안녕히계세요마지막', '마지막인사', '오늘이마지막',
];
const WARNING = [
  '살기싫', '희망이없', '아무의미없', '버티기힘들', '견딜수없', '다포기', '포기하고싶', '쓸모없는', '없어지면',
  '외로워죽', '사는게지옥', '망했어인생', '도박빚', '빚때문에죽',
];
// 관심(1단계): 관리자 '관심' 알림만, SOS 창은 띄우지 않음
const CONCERN = ['아무도없', '아무도날', '혼자야', '숨막혀', '한심해', '내가싫어', '잠을못자', '며칠째못', '빚때문에', '학교안갔', '방밖에안나'];
// 위기 단어가 들어 있어도 위험이 아닐 수 있는 흔한 표현 (예: "배고파 죽겠다")
const BENIGN = ['배고파죽', '웃겨죽', '귀여워죽', '좋아죽', '더워죽', '추워죽', '졸려죽', '심심해죽', '자살예방', '자해하지않'];

function norm(s) { return String(s || '').toLowerCase().replace(/[\s.,!?~^"'`·…\-_()[\]]/g, ''); }

function detectText(text) {
  const t = norm(text);
  if (!t) return { level: 0, hits: [] };
  let cleaned = t;
  BENIGN.forEach((b) => { cleaned = cleaned.split(b).join(''); });
  const u = URGENT.filter((k) => cleaned.includes(k));
  if (u.length) return { level: 3, hits: u };
  const w = WARNING.filter((k) => cleaned.includes(k));
  if (w.length) return { level: 2, hits: w };
  const c = CONCERN.filter((k) => cleaned.includes(k));
  if (c.length) return { level: 1, hits: c };
  return { level: 0, hits: [] };
}

// ── 2. 그림 과제 ─────────────────────────────────────────
const COMMON_END = [
  { id: 'feel', q: '그림을 그리는 동안 어떤 기분이 들었나요?', type: 'choice', options: ['편안했어요', '즐거웠어요', '그냥 그랬어요', '답답했어요', '슬펐어요', '화가 났어요'] },
  { id: 'say', q: '이 그림이 말을 할 수 있다면, 뭐라고 말할까요?', type: 'text' },
];

const DRAW_TASKS = [
  { id: 'free', title: '지금 내 마음', icon: '🎨', group: '마음 표현', guide: 'circle-none',
    prompt: '지금 이 순간의 마음을 자유롭게 그려 보세요. 색, 선, 모양 무엇이든 괜찮아요. 잘 그릴 필요는 전혀 없어요.',
    pdi: [{ id: 'title', q: '그림에 제목을 붙인다면?', type: 'text' }, ...COMMON_END] },
  { id: 'emotion', title: '오늘의 감정 색', icon: '🌈', group: '마음 표현',
    prompt: '오늘 느낀 감정들을 색으로 표현해 보세요. 가장 큰 감정은 크게, 작은 감정은 작게 칠해요.',
    pdi: [{ id: 'main', q: '가장 크게 칠한 색은 어떤 감정인가요?', type: 'text' }, { id: 'want', q: '내일은 어떤 색을 더 많이 칠하고 싶나요?', type: 'text' }, ...COMMON_END] },
  { id: 'house', title: '집 (HTP)', icon: '🏠', group: '집-나무-사람 검사',
    prompt: '집을 한 채 그려 주세요. 어떤 집이든 괜찮아요.',
    pdi: [
      { id: 'who', q: '이 집에는 누가 살고 있나요?', type: 'text' },
      { id: 'mood', q: '이 집의 분위기는 어떤가요?', type: 'choice', options: ['따뜻해요', '평범해요', '쓸쓸해요', '무서워요'], signals: { '쓸쓸해요': 1, '무서워요': 2 } },
      { id: 'need', q: '이 집에 필요한 것이 있다면 무엇일까요?', type: 'text' }, ...COMMON_END] },
  { id: 'tree', title: '나무 (HTP)', icon: '🌳', group: '집-나무-사람 검사',
    prompt: '나무를 한 그루 그려 주세요.',
    pdi: [
      { id: 'age', q: '이 나무는 몇 살쯤 되었나요?', type: 'text' },
      { id: 'health', q: '이 나무는 건강한가요?', type: 'choice', options: ['아주 건강해요', '보통이에요', '조금 아파요', '죽어가고 있어요'], signals: { '조금 아파요': 1, '죽어가고 있어요': 2 } },
      { id: 'need', q: '이 나무에게 필요한 것은 무엇일까요?', type: 'text' }, ...COMMON_END] },
  { id: 'person', title: '사람 (HTP)', icon: '🧍', group: '집-나무-사람 검사',
    prompt: '사람을 한 명 그려 주세요. 막대 인물이 아닌 온전한 사람으로 그려 주세요.',
    pdi: [
      { id: 'who', q: '이 사람은 누구인가요? 몇 살인가요?', type: 'text' },
      { id: 'doing', q: '이 사람은 지금 무엇을 하고 있나요?', type: 'text' },
      { id: 'feeling', q: '이 사람의 기분은 어떤가요?', type: 'choice', options: ['행복해요', '평온해요', '지쳐 있어요', '슬퍼요', '화나 있어요', '두려워요'], signals: { '지쳐 있어요': 1, '슬퍼요': 1, '두려워요': 1 } },
      { id: 'wish', q: '이 사람이 가장 원하는 것은 무엇일까요?', type: 'text' }, ...COMMON_END] },
  { id: 'pitr', title: '빗속의 사람', icon: '☔', group: '스트레스·대처',
    prompt: '비가 내리는 날, 빗속에 있는 사람을 그려 주세요.',
    pdi: [
      { id: 'protect', q: '이 사람은 비를 피할 수 있는 무언가(우산, 비옷, 지붕 등)를 가지고 있나요?', type: 'choice', options: ['네, 충분히 있어요', '조금 있어요', '아무것도 없어요'], signals: { '아무것도 없어요': 1 } },
      { id: 'rain', q: '비는 얼마나 세게 내리고 있나요?', type: 'choice', options: ['보슬비', '보통 비', '폭우', '폭풍우'], signals: { '폭풍우': 1 } },
      { id: 'feeling', q: '비를 맞고 있는 이 사람의 기분은?', type: 'text' },
      { id: 'stop', q: '이 비는 언제쯤 그칠까요? 그친 뒤엔 어떻게 될까요?', type: 'text' }, ...COMMON_END] },
  { id: 'kfd', title: '동적 가족화 (KFD)', icon: '👨‍👩‍👧', group: '관계',
    prompt: '나를 포함한 가족 모두가 무언가를 하고 있는 모습을 그려 주세요. 막대 인물이 아닌 사람으로 그려 주세요.',
    pdi: [
      { id: 'members', q: '그림 속 사람들은 각각 누구이고, 무엇을 하고 있나요?', type: 'text' },
      { id: 'close', q: '그림에서 나와 가장 가까운 사람은 누구인가요?', type: 'text' },
      { id: 'atmos', q: '이 가족의 분위기는 어떤가요?', type: 'choice', options: ['화목해요', '평범해요', '서로 멀어요', '긴장돼요'], signals: { '서로 멀어요': 1, '긴장돼요': 1 } }, ...COMMON_END] },
  { id: 'screen', title: '화면 안의 나, 화면 밖의 나', icon: '🪟', group: '디지털 회복', guide: 'split',
    prompt: '왼쪽에는 스마트폰·게임·AI 속에 있는 나를, 오른쪽에는 화면 밖 세상에 있는 나를 그려 보세요.',
    pdi: [
      { id: 'inside', q: '화면 안의 나는 무엇을 얻고 있나요?', type: 'text' },
      { id: 'outside', q: '화면 밖의 나에게 필요한 것은 무엇일까요?', type: 'text' },
      { id: 'prefer', q: '지금 더 편안하게 느껴지는 쪽은?', type: 'choice', options: ['화면 안', '화면 밖', '둘 다 비슷해요', '둘 다 힘들어요'], signals: { '둘 다 힘들어요': 1 } }, ...COMMON_END] },
  { id: 'lmt', title: '풍경 구성', icon: '🏞️', group: '마음 표현',
    prompt: '강, 산, 논밭, 길, 집, 나무, 사람, 꽃, 동물, 돌을 차례로 넣어 하나의 풍경을 만들어 보세요. 마지막에 원하는 것을 더해도 좋아요.',
    pdi: [{ id: 'season', q: '이 풍경의 계절과 시간은 언제인가요?', type: 'text' }, { id: 'me', q: '이 풍경 속에서 나는 어디에 있고 싶나요?', type: 'text' }, ...COMMON_END] },
  { id: 'mandala', title: '만다라 색칠', icon: '🔆', group: '마음 안정', guide: 'mandala',
    prompt: '원 안을 마음 가는 대로 무늬와 색으로 채워 보세요. 천천히, 호흡에 맞춰 그리면 마음이 차분해져요.',
    pdi: COMMON_END },
  { id: 'future', title: '세상 밖으로 나온 나', icon: '🌅', group: '디지털 회복',
    prompt: '1년 뒤, 조금 더 건강해진 내가 세상 속에서 무엇을 하고 있을지 그려 보세요.',
    pdi: [{ id: 'step', q: '그 모습이 되기 위해 이번 주에 할 수 있는 아주 작은 일 하나는?', type: 'text' }, { id: 'helper', q: '그 길에서 나를 도와줄 사람이나 것은?', type: 'text' }, ...COMMON_END] },
];

// ── 3. 그림 지표 기반 해석 (가설 수준의 참고 소견) ───────────
function analyzeDrawing(task, meta, pdi) {
  const m = meta || {};
  const notes = []; // 상담자용
  const gentle = []; // 내담자용
  let risk = 0;
  const cov = Number(m.coverage) || 0;
  const dark = Number(m.darkRatio) || 0;
  const warm = Number(m.warmRatio) || 0;
  const cool = Number(m.coolRatio) || 0;
  const bbox = Number(m.bboxRatio) || 0;
  const cx = m.center ? m.center.x : 0.5, cy = m.center ? m.center.y : 0.5;

  if (cov < 0.03 && (m.strokes || 0) < 8) notes.push('필압·획 수가 매우 적고 화면 사용이 적음 → 저항, 에너지 저하 또는 과제 회피 가능성');
  if (bbox > 0 && bbox < 0.12) notes.push('그림 크기가 매우 작음 → 위축감, 낮은 자기상, 불안 가능성');
  if (bbox > 0.85 && cov > 0.45) notes.push('화면 대부분을 채움 → 높은 에너지·표현 욕구 또는 충동성·감정 압도 가능성');
  if (cy > 0.7) notes.push('그림이 하단에 치우침 → 우울감, 안정 욕구, 현실 지향 가능성');
  if (cy < 0.3) notes.push('그림이 상단에 치우침 → 이상·공상 지향 또는 현실 회피 가능성');
  if (cx < 0.3) notes.push('왼쪽 치우침 → 과거 지향·내향성 가능성');
  if (cx > 0.7) notes.push('오른쪽 치우침 → 미래 지향·외향성 가능성');
  if (dark > 0.6) { notes.push(`어두운 색 비율 높음(${Math.round(dark * 100)}%) → 우울감·무거운 정서 신호 가능성`); risk = Math.max(risk, 1); }
  if ((m.colors || []).length <= 1 && cov > 0.02) notes.push('단색 사용 → 정서 표현 위축 또는 단순 선호');
  if ((m.erases || 0) + (m.undos || 0) > 25) notes.push('지우기·되돌리기가 매우 잦음 → 완벽주의, 자기비판, 불안 가능성');
  if ((m.clears || 0) >= 2) notes.push('전체 지우기 반복 → 좌절감 또는 자기 표현에 대한 부담감');
  if ((m.duration || 0) > 0 && m.duration < 40) notes.push('매우 짧은 소요 시간 → 동기 저하 또는 과제 거부 가능성');
  if (m.redRatio > 0.35) notes.push(`빨간색 비중 높음(${Math.round(m.redRatio * 100)}%) → 분노·흥분·강한 에너지 표현 가능성`);
  if (warm > 0.5) gentle.push('따뜻한 색이 많이 담겨 있어요. 마음속 따뜻한 에너지가 느껴져요.');
  if (cool > 0.5) gentle.push('차분한 색이 많아요. 고요함이나 쉼이 필요한 마음일 수도 있어요.');
  if (dark > 0.6) gentle.push('어두운 색이 많이 쓰였어요. 요즘 마음이 무거웠다면, 그 마음을 그림으로 꺼낸 것만으로도 큰 용기예요.');

  // 사후질문 신호
  const pdiFlags = [];
  (task?.pdi || []).forEach((p) => {
    const ans = pdi?.[p.id];
    if (p.signals && ans && p.signals[ans]) { pdiFlags.push(`"${p.q}" → ${ans}`); risk = Math.max(risk, p.signals[ans] >= 2 ? 1 : risk); }
  });
  if (pdiFlags.length >= 2) risk = Math.max(risk, 1);
  if (pdiFlags.length) notes.push('사후질문 주의 응답: ' + pdiFlags.join(' / '));
  const textAll = Object.values(pdi || {}).join(' ');
  const t = detectText(textAll);
  if (t.level) { risk = Math.max(risk, t.level); notes.push(`사후질문 답변에서 위기 표현 감지: ${t.hits.join(', ')}`); }

  if (!gentle.length) gentle.push('마음을 그림으로 표현해 주셔서 고마워요. 상담사 선생님이 그림을 천천히 살펴보고 이야기를 건넬게요.');
  if (!notes.length) notes.push('특이 지표 없음 — 그림 내용과 사후질문 답변을 중심으로 해석하세요.');
  return {
    risk,
    counselor: notes,
    client: gentle,
    disclaimer: '자동 지표 해석은 그림 그리기 과정의 수치에 근거한 가설이며, 반드시 상담자가 그림 내용·맥락·면담과 함께 종합적으로 판단해야 합니다.',
  };
}

module.exports = { detectText, DRAW_TASKS, analyzeDrawing };
