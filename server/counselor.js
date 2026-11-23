// AI 상담사: 실시간 1차 상담 응대
// 우선순위: ① Claude API(ANTHROPIC_API_KEY) ② GitHub Models(Codespaces의 GITHUB_TOKEN 또는 GITHUB_MODELS_TOKEN, 무료)
//          ③ 둘 다 안 되면 내장 공감 응답(규칙 기반) — 어떤 경우에도 응답은 갑니다.
const GH_TOKEN = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN;
const GH_MODEL = process.env.AI_CHAT_MODEL || 'openai/gpt-4.1-mini';
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
let ghBroken = false; // GitHub Models 인증 실패 시 다시 시도하지 않음

const GRP = { elem: '초등학생', middle: '중학생', high: '고등학생', adult: '대학생·성인', teacher: '교사' };

function systemPrompt(user, risk) {
  const young = ['elem', 'middle'].includes(user.grp);
  return `너는 '마음결' 플랫폼의 AI 상담사야. 상대는 ${GRP[user.grp] || '성인'}이고 이름(별명)은 '${user.name}'이야.
목표: 게임·스마트폰·AI·도박 의존, 고립감·무력감·우울로 힘든 사람이 안전하게 마음을 털어놓고, 스스로 작은 변화를 찾고, 사람과 세상으로 다시 연결되도록 돕는 것.

상담 원칙
- 인간중심 상담: 판단하지 말고, 상대의 말과 감정을 구체적으로 반영(재진술)한 뒤 공감해.
- 동기강화상담: 중독·습관 이야기에는 설교하지 말고, 양가감정을 인정하고 스스로 바꾸고 싶은 이유를 묻는 열린 질문을 해.
- 한 번에 2~4문장, 질문은 한 개만. 짧고 따뜻하게. ${young ? '쉬운 낱말과 다정한 반말 섞인 존댓말("~했구나", "~해 볼까요?")을 써.' : '정중한 존댓말을 써.'}
- 진단명 붙이기, 약 처방·복용 조언, 법률·의료 판단은 하지 마. 필요하면 전문가 연결을 권해.
- 너는 AI라는 사실을 숨기지 마. 사람 상담 선생님이 곧 함께할 수 있다고 안내할 수 있어.
- 상대를 너(AI)에게 의존하게 만들지 말고, 믿을 수 있는 사람·상담 선생님·일상 활동으로 연결되도록 자연스럽게 격려해.
- 직장·학교 갈등(예: 관리자에게 인정받지 못함, 업무 과중)은 감정을 충분히 인정한 뒤, 상대가 통제할 수 있는 작은 행동이나 도움 받을 사람을 함께 찾아.

위기 대응 (가장 중요)
- 자살·자해·죽음·사라지고 싶음 같은 표현이 나오면: 다른 주제보다 안전을 먼저 다뤄. 말해 준 용기를 인정하고, "지금 스스로를 해치려는 생각이 있는지"를 직접적이고 차분하게 물어.
- 위험해 보이면 109(24시간 자살예방상담, 문자 가능), 청소년은 1388, 즉각 위험하면 119/112를 안내하고, 상담 선생님에게 이미 알림이 갔다고 알려 줘.
- 방법·수단에 대한 정보는 절대 주지 마.
${risk >= 2 ? '\n※ 방금 내담자의 말에서 위기 신호가 감지됐어. 이번 답은 반드시 안전 확인을 중심으로 해.' : ''}`;
}

async function viaClaude(sys, msgs) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 500, system: sys, messages: msgs }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
}

async function viaGitHub(sys, msgs) {
  const res = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${GH_TOKEN}`, accept: 'application/json' },
    body: JSON.stringify({ model: GH_MODEL, temperature: 0.7, max_tokens: 400, messages: [{ role: 'system', content: sys }, ...msgs] }),
  });
  if (!res.ok) {
    const t = (await res.text()).slice(0, 200);
    if (res.status === 401 || res.status === 403) ghBroken = true;
    throw new Error(`GitHub Models ${res.status}: ${t}`);
  }
  const j = await res.json();
  return (j.choices?.[0]?.message?.content || '').trim();
}

// 내장 공감 응답 (AI 연결이 없을 때) — 최근에 한 말은 반복하지 않음
const RULES = [
  [/불공평|억울|나만|일폭탄|업무가많|떠넘|동료들은/, [
    '다른 사람들은 편해 보이는데 나만 일에 파묻혀 있다고 느끼면 화도 나고 억울하죠. 그 감정은 아주 자연스러운 거예요. 요즘 맡고 있는 일 중에 가장 버거운 건 어떤 건가요?',
    '불공평하다고 느끼면서도 말 한마디 못 하고 버티는 게 더 답답하셨을 것 같아요. 만약 부담 없이 한 가지를 말할 수 있다면, 누구에게 어떤 말을 하고 싶으세요?',
  ]],
  [/인정|교장|교감|관리자|상사|평가/, [
    '애쓰고 있는데 인정받지 못한다고 느끼면 힘이 쭉 빠지죠. 그동안 누구보다 성실하게 버텨 오신 게 느껴져요. 스스로 생각하기에 요즘 가장 잘 해내고 있는 부분은 무엇인가요?',
    '윗사람의 인정이 없으면 내가 잘하고 있는지조차 흔들리게 돼요. 그 사람들에게 가장 알아줬으면 하는 건 어떤 부분인가요?',
  ]],
  [/그만두|잘릴|계약|재계약|떠나야|퇴사|자퇴/, [
    '언제 그만두게 될지 모른다는 불안을 안고 매일 버티는 건 정말 힘든 일이에요. 그 불안이 가장 크게 느껴지는 건 어떤 때인가요?',
    '앞날이 불확실하면 지금 하는 일에도 마음을 두기 어려워지죠. 그 불안이 하루 중 몸이나 잠에도 영향을 주고 있나요?',
  ]],
  [/말도못|말못|참아|참고|답답/, [
    '하고 싶은 말을 삼키며 지내면 마음이 꽉 막힌 것처럼 답답해지죠. 여기서는 마음 놓고 다 털어놓아도 괜찮아요. 가장 하고 싶었던 말은 무엇인가요?',
  ]],
  [/게임|폰|스마트폰|유튜브|쇼츠|밤새/, [
    '게임이나 스마트폰이 힘든 마음을 잠시 잊게 해 주기도 하죠. 한편으로는 줄이고 싶은 마음도 있는 것 같아요. 그만큼 하고 나면 보통 어떤 기분이 드나요?',
    '줄이고 싶은데 잘 안 되는 그 마음, 의지가 약해서가 아니라 그만큼 지쳐 있다는 신호일 수 있어요. 화면을 켜고 싶어지는 때는 주로 어떤 순간인가요?',
  ]],
  [/ai|챗봇|gpt|지피티/i, ['사람보다 AI가 편하게 느껴질 때가 있죠. 판단받지 않고 이야기할 수 있으니까요. 사람과 이야기하는 게 어렵게 느껴지기 시작한 건 언제부터였나요?']],
  [/도박|토토|베팅|카지노|빚/, ['잃은 걸 되찾고 싶은 마음과 멈추고 싶은 마음 사이에서 많이 괴로우셨을 것 같아요. 이야기해 줘서 고마워요. 지금 가장 걱정되는 건 무엇인가요? 1336(도박문제 상담)도 24시간 도움을 줄 수 있어요.']],
  [/외로|혼자|아무도|친구가없/, ['곁에 아무도 없는 것 같은 마음, 정말 쓸쓸하고 무거웠겠어요. 지금 이렇게 이야기를 꺼내 준 것도 큰 걸음이에요. 요즘 하루 중 가장 외롭게 느껴지는 시간은 언제인가요?']],
  [/불안|걱정|무서|두려/, ['불안이 계속 따라다니면 몸도 마음도 쉽게 지치죠. 그 불안이 마음속에서 어떤 말을 하는 것 같나요?']],
  [/우울|힘들|지쳐|무기력|의욕/, ['많이 지쳐 있는 게 느껴져요. 그동안 혼자 버텨 온 것만으로도 애쓰셨어요. 요즘 그나마 조금 숨 쉴 수 있는 순간이 있다면 언제인가요?']],
  [/고마|감사/, ['저도 이야기를 나눠 줘서 고마워요. 오늘 이야기하면서 마음이 조금이라도 달라진 게 있나요?']],
];
const GENERIC = [
  (u) => `${u.name} 님 이야기를 듣고 있어요. 조금 더 들려줄 수 있을까요? 그때 어떤 마음이 들었는지 궁금해요.`,
  () => '그렇게 느끼셨군요. 그 일이 지금 마음에 어떤 무게로 남아 있나요?',
  () => '말해 줘서 고마워요. 그 상황에서 가장 힘들었던 건 무엇이었나요?',
];
function fallback(text, risk, user, used = []) {
  const t = String(text).replace(/\s/g, '');
  if (risk >= 2) return '그런 마음까지 들 만큼 많이 힘들었군요. 말해 줘서 정말 고마워요. 지금 혹시 스스로를 해치려는 생각이 있나요? 위험하다고 느껴지면 지금 바로 109(24시간)나 119로 연락해 주세요. 상담 선생님에게도 알림을 보냈어요.';
  const fresh = (arr) => arr.find((x) => !used.includes(x));
  for (const [re, lines] of RULES) if (re.test(t)) { const f = fresh(lines); if (f) return f; }
  return fresh(GENERIC.map((g) => g(user))) || '천천히 이야기해 주세요. 저는 계속 여기에서 듣고 있어요. 상담 선생님도 곧 함께할 거예요.';
}

async function reply(history, user, risk) {
  // history: [{role:'user'|'assistant', content}]
  const msgs = [];
  history.slice(-20).forEach((m) => {
    if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += '\n' + m.content;
    else msgs.push({ ...m });
  });
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const last = [...msgs].reverse().find((m) => m.role === 'user')?.content || '';
  const used = history.filter((m) => m.role === 'assistant').map((m) => m.content);
  if (!msgs.length) return { text: fallback(last, risk, user, used), source: 'fallback' };
  const sys = systemPrompt(user, risk);
  try {
    if (CLAUDE_KEY) return { text: await viaClaude(sys, msgs), source: 'claude' };
    if (GH_TOKEN && !ghBroken) return { text: await viaGitHub(sys, msgs), source: 'github' };
  } catch (e) {
    console.error('[AI 상담사] 외부 AI 호출 실패 → 내장 응답 사용:', e.message);
  }
  return { text: fallback(last, risk, user, used), source: 'fallback' };
}

const provider = () => (CLAUDE_KEY ? `Claude (${CLAUDE_MODEL})` : GH_TOKEN && !ghBroken ? `GitHub Models (${GH_MODEL})` : '내장 공감 응답');
module.exports = { reply, provider };
