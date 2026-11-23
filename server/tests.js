// 심리검사 정의와 채점 규칙
// risk: 0 안정 · 1 관심 · 2 위험(SOS 안내 + 관리자 알림) · 3 긴급(SOS 즉시 + 관리자 긴급 알림)
// ※ 모든 검사는 선별(스크리닝) 도구이며 진단 도구가 아닙니다.

const sum = (a) => a.reduce((s, v) => s + (Number(v) || 0), 0);
const ALL = ['elem', 'middle', 'high', 'adult', 'teacher'];
const TEEN_UP = ['middle', 'high', 'adult', 'teacher'];

const O4_PHQ = [
  { label: '전혀 없음', value: 0 }, { label: '며칠 동안', value: 1 },
  { label: '1주일 이상', value: 2 }, { label: '거의 매일', value: 3 },
];
const O4_AGREE = [
  { label: '전혀 그렇지 않다', value: 1 }, { label: '그렇지 않다', value: 2 },
  { label: '그렇다', value: 3 }, { label: '매우 그렇다', value: 4 },
];
const YESNO = [{ label: '아니요', value: 0 }, { label: '예', value: 1 }];

const TESTS = [
  {
    id: 'child_weather', title: '마음 날씨 체크', short: '어린이용 마음 상태 살펴보기',
    category: 'mood', groups: ['elem'], icon: '🌤️', minutes: 3, standardized: false,
    source: '마음결 자체 개발 문항(비표준화, 참고용)',
    instruction: '요즘 나의 마음은 어떤 날씨일까요? 솔직하게 골라 주세요. 정답은 없어요.',
    options: [{ label: '아니에요', value: 0 }, { label: '가끔 그래요', value: 1 }, { label: '자주 그래요', value: 2 }],
    items: [
      '요즘 슬프거나 울고 싶을 때가 있어요', '재미있던 놀이가 재미없어졌어요', '학교(또는 학원)에 가기 싫어요',
      '친구들과 함께 있어도 혼자인 것 같아요', '잠이 잘 안 오거나 무서운 꿈을 자주 꿔요', '화가 나서 참기 어려울 때가 많아요',
      '스마트폰이나 게임을 못 하면 짜증이 많이 나요', '나는 잘하는 게 하나도 없는 것 같아요',
      '배나 머리가 아프다고 느낄 때가 많아요', '내가 없어지면 좋겠다는 생각이 들어요',
    ],
    score(a) {
      const s = sum(a);
      let level = 'sunny', label = '맑음', risk = 0;
      if (s >= 13) { level = 'rain'; label = '비'; risk = 1; } else if (s >= 7) { level = 'cloud'; label = '구름'; }
      if (a[9] >= 1) risk = a[9] >= 2 ? 3 : 2;
      const summary = s >= 13
        ? '요즘 마음에 비가 많이 내리고 있어요. 혼자 참지 말고 믿을 수 있는 어른이나 상담 선생님에게 꼭 이야기해 주세요.'
        : s >= 7 ? '마음에 구름이 조금 끼어 있어요. 힘든 점을 그림이나 이야기로 나눠 보면 한결 가벼워질 수 있어요.'
          : '마음이 대체로 맑아요! 지금처럼 좋아하는 것들을 소중히 해요.';
      return { score: s, level, levelLabel: label, risk, summary, flags: a[9] >= 1 ? ['안전 문항(10번) 응답'] : [] };
    },
  },
  {
    id: 'phq9', title: '우울 선별 검사 (PHQ-9)', short: '지난 2주간의 우울감 살펴보기',
    category: 'mood', groups: TEEN_UP, icon: '🌧️', minutes: 3, standardized: true,
    source: 'Patient Health Questionnaire-9 (Kroenke, Spitzer & Williams, 2001) 한국어판 · 공개 사용',
    instruction: '지난 2주 동안, 다음과 같은 문제들로 얼마나 자주 불편을 겪으셨나요?',
    options: O4_PHQ,
    items: [
      '일을 하는 것에 대한 흥미나 재미가 거의 없음', '가라앉은 느낌, 우울감 혹은 절망감',
      '잠들기 어렵거나 자꾸 깨어남, 혹은 너무 많이 잠', '피곤함, 기력이 저하됨', '식욕 저하 혹은 과식',
      '내 자신이 실패자로 여겨지거나, 자신과 가족을 실망시켰다고 느낌',
      '책·영상 보기 같은 일상적인 일에 집중하기 어려움',
      '다른 사람들이 눈치 챌 정도로 말과 행동이 느려짐, 혹은 너무 안절부절못해 가만히 있을 수 없음',
      '차라리 죽는 것이 낫겠다고 생각하거나, 어떻게든 자해를 하려고 생각함',
    ],
    score(a) {
      const s = sum(a);
      const bands = [[4, 'none', '정상 범위'], [9, 'mild', '가벼운 우울'], [14, 'moderate', '중간 정도 우울'], [19, 'modsev', '중간~심한 우울'], [27, 'severe', '심한 우울']];
      const [, level, label] = bands.find((b) => s <= b[0]);
      let risk = s >= 15 ? 2 : s >= 10 ? 1 : 0;
      const flags = [];
      if (a[8] >= 1) { risk = Math.max(risk, a[8] >= 2 ? 3 : 2); flags.push('9번(자살·자해 사고) 문항 양성'); }
      const summary = {
        none: '현재 우울 증상은 정상 범위에 있어요. 지금의 생활 리듬을 잘 지켜 주세요.',
        mild: '가벼운 우울감이 보여요. 충분한 수면, 햇빛 쬐기, 가벼운 산책 같은 작은 돌봄이 도움이 돼요.',
        moderate: '중간 정도의 우울감이 있어요. 혼자 버티기보다 상담을 통해 마음을 나눠 보시길 권해요.',
        modsev: '우울감이 꽤 깊어요. 전문 상담이나 정신건강의학과 진료를 받아 보시길 권해요.',
        severe: '우울감이 매우 깊은 상태예요. 가능한 빨리 전문가의 도움을 받으세요. 당신은 도움받을 자격이 있어요.',
      }[level];
      return { score: s, level, levelLabel: label, risk, summary, flags, followUp: a[8] >= 1 ? 'cssrs' : null };
    },
  },
  {
    id: 'gad7', title: '불안 선별 검사 (GAD-7)', short: '지난 2주간의 걱정과 긴장 살펴보기',
    category: 'mood', groups: TEEN_UP, icon: '🌀', minutes: 2, standardized: true,
    source: 'Generalized Anxiety Disorder-7 (Spitzer et al., 2006) 한국어판 · 공개 사용',
    instruction: '지난 2주 동안, 다음과 같은 문제들로 얼마나 자주 불편을 겪으셨나요?',
    options: O4_PHQ,
    items: [
      '초조하거나 불안하거나 조마조마하게 느낀다', '걱정하는 것을 멈추거나 조절할 수가 없다',
      '여러 가지 것들에 대해 걱정을 너무 많이 한다', '편하게 있기가 어렵다',
      '너무 안절부절못해서 가만히 있기가 힘들다', '쉽게 짜증이 나거나 쉽게 성을 낸다',
      '마치 끔찍한 일이 생길 것처럼 두렵게 느껴진다',
    ],
    score(a) {
      const s = sum(a);
      const [, level, label] = [[4, 'none', '최소 불안'], [9, 'mild', '가벼운 불안'], [14, 'moderate', '중간 정도 불안'], [21, 'severe', '심한 불안']].find((b) => s <= b[0]);
      const risk = s >= 15 ? 1 : 0;
      const summary = {
        none: '불안 수준이 낮아요. 마음이 비교적 편안한 상태예요.',
        mild: '가벼운 불안이 있어요. 호흡 명상이나 걱정 일기 쓰기가 도움이 될 수 있어요.',
        moderate: '불안이 일상에 영향을 주고 있을 수 있어요. 상담을 통해 불안을 다루는 방법을 함께 찾아봐요.',
        severe: '불안이 많이 높아요. 전문가와 상담해 보시길 권해요.',
      }[level];
      return { score: s, level, levelLabel: label, risk, summary, flags: [] };
    },
  },
  {
    id: 'k6', title: '심리적 고통·무력감 척도 (K-6)', short: '지난 한 달간 지치고 무력한 느낌',
    category: 'mood', groups: TEEN_UP, icon: '🍂', minutes: 2, standardized: true,
    source: 'Kessler Psychological Distress Scale K6 (Kessler et al., 2002) 한국어판',
    instruction: '지난 30일 동안, 다음과 같은 느낌을 얼마나 자주 느끼셨나요?',
    options: [{ label: '전혀', value: 0 }, { label: '조금', value: 1 }, { label: '가끔', value: 2 }, { label: '자주', value: 3 }, { label: '항상', value: 4 }],
    items: ['신경이 예민하다고 느꼈다', '절망적이라고 느꼈다', '안절부절못하거나 초조하다고 느꼈다',
      '너무 우울해서 어떤 것으로도 기운이 나지 않는다고 느꼈다', '모든 일이 힘들다고 느꼈다', '자신이 쓸모없는 사람이라고 느꼈다'],
    score(a) {
      const s = sum(a);
      const level = s >= 13 ? 'high' : s >= 8 ? 'mid' : 'low';
      const label = { high: '심한 심리적 고통', mid: '중간 정도 고통', low: '낮음' }[level];
      const risk = s >= 13 ? 2 : s >= 8 ? 1 : 0;
      const summary = {
        low: '심리적 고통이 낮은 편이에요.',
        mid: '지치고 무력한 느낌이 쌓이고 있어요. 쉼과 회복의 시간을 꼭 챙겨 주세요.',
        high: '심리적 고통이 매우 큰 상태예요. 혼자 감당하지 마시고 상담사와 이야기를 나눠 주세요.',
      }[level];
      return { score: s, level, levelLabel: label, risk, summary, flags: [] };
    },
  },
  {
    id: 'smartphone', title: '스마트폰 과의존 척도', short: '스마트폰 사용 조절과 영향',
    category: 'addiction', groups: ALL, icon: '📱', minutes: 2, standardized: true,
    source: '한국지능정보사회진흥원(NIA) 스마트폰 과의존 척도(2016) 자기보고형',
    instruction: '평소 나의 스마트폰 사용과 가장 가까운 것을 골라 주세요.',
    options: O4_AGREE,
    items: [
      '스마트폰 이용시간을 줄이려 할 때마다 실패한다', '스마트폰 이용시간을 조절하는 것이 어렵다',
      '적절한 스마트폰 이용시간을 지키는 것이 어렵다', '스마트폰이 옆에 있으면 다른 일에 집중하기 어렵다',
      '스마트폰 생각이 머리에서 떠나지 않는다', '스마트폰을 이용하고 싶은 충동을 강하게 느낀다',
      '스마트폰 이용 때문에 건강에 문제가 생긴 적이 있다', '스마트폰 이용 때문에 가족과 심하게 다툰 적이 있다',
      '스마트폰 이용 때문에 친구·동료 관계에서 심한 갈등을 경험한 적이 있다',
      '스마트폰 때문에 학업이나 업무 수행에 어려움이 있다',
    ],
    score(a, user) {
      const s = sum(a);
      const adult = ['adult', 'teacher'].includes(user?.grp);
      const [hi, pot] = adult ? [29, 24] : [31, 23];
      const level = s >= hi ? 'high' : s >= pot ? 'potential' : 'normal';
      const label = { high: '과의존 고위험', potential: '잠재적 위험', normal: '일반 사용자' }[level];
      const summary = {
        normal: '스마트폰을 스스로 조절하며 사용하고 있어요.',
        potential: '조절력이 조금씩 약해지고 있어요. 사용 시간 기록, 알림 끄기, 잠들기 1시간 전 내려놓기를 시도해 보세요.',
        high: '스마트폰 사용이 일상과 관계에 큰 영향을 주고 있어요. 스마트쉼센터(1599-0075) 상담이나 마음결 상담사와의 대화를 권해요.',
      }[level];
      return { score: s, level, levelLabel: label, risk: level === 'high' ? 1 : 0, summary, flags: [], note: `기준: ${adult ? '성인' : '청소년'} 절단점 (고위험 ${hi}점↑, 잠재적 ${pot}점↑)` };
    },
  },
  {
    id: 'game', title: '게임 과몰입 선별 (IGDS9-SF)', short: '지난 1년간의 게임 이용 패턴',
    category: 'addiction', groups: ALL, icon: '🎮', minutes: 3, standardized: true,
    source: 'Internet Gaming Disorder Scale–Short Form (Pontes & Griffiths, 2015) 기반 한국어 문항',
    instruction: '지난 12개월 동안의 게임 이용을 떠올리며 답해 주세요.',
    options: [{ label: '전혀 아니다', value: 1 }, { label: '드물게', value: 2 }, { label: '가끔', value: 3 }, { label: '자주', value: 4 }, { label: '매우 자주', value: 5 }],
    items: [
      '게임을 하지 않을 때도 게임 생각에 사로잡혀 있었다', '게임을 줄이거나 못 하게 되면 짜증, 불안, 슬픔을 느꼈다',
      '만족감을 얻기 위해 점점 더 오랜 시간 게임을 해야 했다', '게임 시간을 조절하거나 줄이려 했지만 계속 실패했다',
      '게임 때문에 이전에 즐기던 취미나 활동에 흥미를 잃었다', '문제가 생기는 것을 알면서도 게임을 계속했다',
      '게임 시간에 대해 가족이나 주변 사람에게 거짓말을 한 적이 있다',
      '우울, 불안, 죄책감 같은 감정에서 벗어나려고 게임을 했다',
      '게임 때문에 중요한 관계, 학업, 일의 기회를 위태롭게 하거나 잃었다',
    ],
    score(a) {
      const s = sum(a);
      const severe = a.filter((v) => v === 5).length;
      const level = severe >= 5 || s >= 36 ? 'high' : s >= 24 ? 'caution' : 'normal';
      const label = { high: '게임 과몰입 고위험', caution: '주의 필요', normal: '건강한 이용' }[level];
      const summary = {
        normal: '게임을 건강하게 즐기고 있어요.',
        caution: '게임이 감정 조절이나 일상에 영향을 주기 시작했어요. 게임 외에 즐거움을 주는 활동을 하나씩 늘려 보세요.',
        high: '게임 이용이 삶의 여러 영역에 어려움을 주고 있어요. 혼자 끊으려 애쓰기보다 상담을 통해 함께 계획을 세워요.',
      }[level];
      return { score: s, level, levelLabel: label, risk: level === 'high' ? 1 : 0, summary, flags: severe ? [`'매우 자주' 응답 ${severe}개`] : [], note: 'DSM-5 기준 9개 중 5개 이상 \'매우 자주\' 또는 총점 36점↑를 고위험으로 봅니다(플랫폼 참고 구간).' };
    },
  },
  {
    id: 'gambling', title: '도박 문제 선별 (PGSI)', short: '온라인 도박·확률형 아이템·토토 등',
    category: 'addiction', groups: TEEN_UP, icon: '🎲', minutes: 2, standardized: true,
    source: 'Problem Gambling Severity Index (Ferris & Wynne, 2001) 한국어판',
    instruction: '지난 12개월 동안을 떠올려 주세요. (온라인 카지노, 불법 스포츠 토토, 사다리·그래프 게임, 확률형 아이템 구매 등 돈이나 재화를 거는 모든 활동 포함)',
    options: [{ label: '전혀 없음', value: 0 }, { label: '가끔', value: 1 }, { label: '자주', value: 2 }, { label: '거의 항상', value: 3 }],
    items: [
      '잃어도 괜찮다고 생각한 금액보다 더 많은 돈을 건 적이 있다', '같은 흥분을 느끼기 위해 더 많은 돈을 걸어야 했다',
      '잃은 돈을 되찾으려고 다른 날 다시 도박을 한 적이 있다', '도박을 하기 위해 돈을 빌리거나 물건을 판 적이 있다',
      '나에게 도박 문제가 있다고 느낀 적이 있다', '도박 때문에 스트레스나 불안 같은 건강 문제가 생겼다',
      '다른 사람이 나의 도박을 비난하거나 문제가 있다고 말했다', '도박 때문에 나나 가족이 경제적 문제를 겪었다',
      '도박하는 방식이나 그 결과에 대해 죄책감을 느낀 적이 있다',
    ],
    score(a) {
      const s = sum(a);
      const level = s >= 8 ? 'problem' : s >= 3 ? 'moderate' : s >= 1 ? 'low' : 'none';
      const label = { problem: '문제성 도박', moderate: '중위험', low: '저위험', none: '문제 없음' }[level];
      const summary = {
        none: '도박과 관련된 문제가 보이지 않아요.',
        low: '약간의 위험 신호가 있어요. 돈을 거는 활동은 금액과 시간을 미리 정하고 지켜 주세요.',
        moderate: '도박으로 인한 어려움이 생기고 있어요. 한국도박문제예방치유원(1336) 상담을 권해요.',
        problem: '도박이 삶에 큰 피해를 주고 있을 수 있어요. 빚이나 죄책감을 혼자 짊어지지 말고 1336 또는 상담사와 꼭 이야기해 주세요.',
      }[level];
      return { score: s, level, levelLabel: label, risk: s >= 8 ? 2 : s >= 3 ? 1 : 0, summary, flags: [] };
    },
  },
  {
    id: 'ai', title: 'AI 의존 자가점검', short: 'AI 챗봇·생성형 AI와의 관계 돌아보기',
    category: 'addiction', groups: ALL, icon: '🤖', minutes: 2, standardized: false,
    source: '마음결 자체 개발 문항(비표준화, 참고용) — 행동중독 핵심 요소(조절 실패·현저성·대인관계 대체·기능 저하) 기반',
    instruction: 'AI 챗봇이나 생성형 AI를 사용하는 나의 모습과 가까운 것을 골라 주세요.',
    options: O4_AGREE,
    items: [
      '고민이 생기면 사람보다 AI에게 먼저 털어놓는다', 'AI와 대화하지 못하면 불안하거나 허전하다',
      'AI와 대화하는 시간이 계획보다 길어지는 일이 잦다', 'AI가 사람보다 나를 더 잘 이해한다고 느낀다',
      'AI와 대화하느라 잠, 식사, 공부나 일을 미룬 적이 있다', '스스로 생각해 보기 전에 과제나 판단을 AI에게 맡긴다',
      'AI 사용을 줄이려 했지만 잘 되지 않았다', '가족이나 친구와의 대화가 AI와의 대화보다 귀찮게 느껴진다',
      'AI 없이 스스로 생각하거나 결정하는 것이 두렵다', 'AI 사용 때문에 주변 사람과 갈등이 생긴 적이 있다',
    ],
    score(a) {
      const s = sum(a);
      const level = s >= 29 ? 'high' : s >= 21 ? 'caution' : 'healthy';
      const label = { high: '의존 경향 높음', caution: '주의 필요', healthy: '건강한 활용' }[level];
      const summary = {
        healthy: 'AI를 도구로서 건강하게 활용하고 있어요.',
        caution: 'AI가 사람과의 관계나 스스로 생각하는 시간을 조금씩 대신하고 있어요. 하루 한 번, 사람에게 먼저 말 걸어 보기를 해 봐요.',
        high: 'AI에 마음을 많이 기대고 있어요. 외로움이 그 뒤에 있지는 않은지, 상담사와 함께 천천히 살펴봐요.',
      }[level];
      return { score: s, level, levelLabel: label, risk: level === 'high' ? 1 : 0, summary, flags: [] };
    },
  },
  {
    id: 'lonely', title: '고립감·은둔 척도', short: '외로움과 사회적 고립 살펴보기',
    category: 'relation', groups: ALL, icon: '🏝️', minutes: 2, standardized: true,
    source: 'UCLA 외로움 척도 3문항판 (Hughes et al., 2004) + 은둔 보조문항(비채점)',
    instruction: '평소 나의 모습과 가장 가까운 것을 골라 주세요.',
    options: [{ label: '거의 그렇지 않다', value: 1 }, { label: '가끔 그렇다', value: 2 }, { label: '자주 그렇다', value: 3 }],
    items: [
      '함께할 사람이 없다고 느끼는 경우가 얼마나 자주 있나요?', '소외되었다고 느끼는 경우가 얼마나 자주 있나요?',
      '다른 사람들로부터 고립되었다고 느끼는 경우가 얼마나 자주 있나요?',
      { text: '[보조] 최근 6개월 동안, 꼭 필요한 일 외에는 거의 집 밖에 나가지 않았다', options: YESNO, scored: false },
      { text: '[보조] 최근 6개월 동안, 가족 외의 사람과 직접 만나 대화한 적이 거의 없다', options: YESNO, scored: false },
    ],
    score(a) {
      const s = sum(a.slice(0, 3));
      const hikiko = (a[3] || 0) + (a[4] || 0);
      const level = s >= 6 ? 'high' : 'low';
      const label = level === 'high' ? (hikiko >= 2 ? '높은 고립감 + 은둔 신호' : '높은 고립감') : '고립감 낮음';
      const summary = level === 'high'
        ? (hikiko >= 2 ? '외로움이 크고, 바깥과의 연결도 많이 줄어든 상태예요. 아주 작은 한 걸음부터 함께해요. 쉼터의 "세상 밖으로 작은 걸음" 미션을 추천해요.'
          : '외로움을 자주 느끼고 있어요. 연결은 작은 인사 한마디에서 시작돼요.')
        : '사람들과의 연결감을 비교적 잘 유지하고 있어요.';
      return { score: s, level, levelLabel: label, risk: level === 'high' && hikiko >= 2 ? 1 : 0, summary, flags: hikiko >= 2 ? ['은둔 보조문항 2개 모두 예'] : [] };
    },
  },
  {
    id: 'rses', title: '자아존중감 척도 (RSES)', short: '나를 바라보는 마음',
    category: 'relation', groups: TEEN_UP, icon: '🌱', minutes: 2, standardized: true,
    source: 'Rosenberg Self-Esteem Scale (Rosenberg, 1965) 한국어판 · 공개 사용',
    instruction: '평소 나 자신에 대해 느끼는 것과 가장 가까운 것을 골라 주세요.',
    options: O4_AGREE,
    items: [
      '나는 대체로 나 자신에 만족한다', { text: '때때로 나는 내가 전혀 쓸모없다고 생각한다', reverse: true },
      '나는 좋은 점을 많이 가지고 있다고 느낀다', '나는 다른 사람들만큼 일을 잘할 수 있다',
      { text: '나는 자랑할 것이 별로 없다고 느낀다', reverse: true }, { text: '나는 가끔 내가 쓸모없는 사람이라고 느낀다', reverse: true },
      '나는 적어도 다른 사람만큼 가치 있는 사람이라고 느낀다', { text: '나는 나 자신을 좀 더 존중할 수 있으면 좋겠다', reverse: true },
      { text: '대체로 나는 실패한 사람이라고 느끼는 편이다', reverse: true }, '나는 나 자신에 대해 긍정적인 태도를 가지고 있다',
    ],
    score(a, _u, def) {
      const s = a.reduce((t, v, i) => t + (def.items[i].reverse ? 5 - v : v), 0);
      const level = s >= 30 ? 'high' : s >= 20 ? 'mid' : 'low';
      const label = { high: '건강한 자존감', mid: '보통', low: '낮은 자존감' }[level];
      const summary = {
        high: '자신을 존중하고 아끼는 마음이 건강해요.',
        mid: '스스로를 대하는 마음이 흔들릴 때가 있어요. 하루 하나씩 "오늘 잘한 일"을 적어 보세요.',
        low: '스스로를 많이 낮게 보고 있어요. 그 마음이 어디서 왔는지 상담에서 함께 살펴봐요. 당신은 존재만으로 소중해요.',
      }[level];
      return { score: s, level, levelLabel: label, risk: level === 'low' ? 1 : 0, summary, flags: [] };
    },
  },
  {
    id: 'cssrs', title: '안전 확인 문항 (C-SSRS 선별)', short: '지금 나의 안전을 확인해요',
    category: 'safety', groups: TEEN_UP, icon: '🕊️', minutes: 2, standardized: true,
    source: 'Columbia-Suicide Severity Rating Scale 선별판 (Posner et al.) 한국어 문항',
    instruction: '어려운 질문일 수 있어요. 솔직한 답이 당신을 지키는 데 도움이 됩니다. 답변은 안전을 위해서만 사용돼요.',
    options: YESNO,
    items: [
      '지난 한 달 동안, 죽었으면 좋겠다거나 잠들어서 깨어나지 않았으면 좋겠다고 바란 적이 있나요?',
      '지난 한 달 동안, 실제로 스스로 목숨을 끊는 생각을 한 적이 있나요?',
      { text: '그 방법에 대해 생각해 본 적이 있나요?', showIf: { item: 1, min: 1 } },
      { text: '그 생각을 실제로 행동에 옮길 의도가 있었나요?', showIf: { item: 1, min: 1 } },
      { text: '구체적인 계획을 세웠거나, 계획을 실행하려고 한 적이 있나요?', showIf: { item: 1, min: 1 } },
      '지금까지 스스로 목숨을 끊기 위해 무언가를 하거나, 시작했다가 멈추거나, 준비한 적이 있나요?',
      { text: '그 일이 최근 3개월 이내였나요?', showIf: { item: 5, min: 1 } },
    ],
    score(a) {
      const v = (i) => Number(a[i]) || 0;
      let risk = 0, level = 'none', label = '현재 위험 신호 없음';
      if (v(0)) { risk = 1; level = 'low'; label = '낮은 위험'; }
      if (v(1) || v(2) || (v(5) && !v(6))) { risk = 2; level = 'moderate'; label = '중간 위험'; }
      if (v(3) || v(4) || v(6)) { risk = 3; level = 'high'; label = '높은 위험'; }
      const s = a.reduce((t, x) => t + (Number(x) || 0), 0);
      const summary = {
        none: '현재 뚜렷한 위험 신호는 보이지 않아요. 힘든 마음이 들 때는 언제든 이야기해 주세요.',
        low: '많이 지쳐 있는 마음이 느껴져요. 그 마음을 혼자 품지 않도록 상담사와 함께 나눠 봐요.',
        moderate: '지금 많이 힘드시죠. 당신의 안전이 가장 중요해요. 지금 바로 상담사 또는 109와 이야기해 주세요.',
        high: '당신의 안전이 걱정돼요. 지금 바로 109(24시간)에 전화하거나, 위험하다면 119로 연락해 주세요. 상담사도 곧 연락드릴게요.',
      }[level];
      return { score: s, level, levelLabel: label, risk, summary, flags: risk >= 2 ? ['자살위험 선별 양성'] : [] };
    },
  },
];

const CATEGORIES = {
  mood: { label: '마음 상태', desc: '우울·불안·무력감' },
  addiction: { label: '디지털·행동 중독', desc: '스마트폰·게임·도박·AI' },
  relation: { label: '관계와 나', desc: '고립감·자존감' },
  safety: { label: '안전 확인', desc: '지금의 안전 점검' },
};

function normItems(def) {
  return def.items.map((it) => (typeof it === 'string' ? { text: it } : it));
}

function publicDefs(grp) {
  return TESTS.filter((t) => !grp || t.groups.includes(grp)).map((t) => ({
    id: t.id, title: t.title, short: t.short, category: t.category, icon: t.icon, minutes: t.minutes,
    standardized: t.standardized, source: t.source, instruction: t.instruction,
    items: normItems(t).map((it) => ({ text: it.text, options: it.options || t.options, showIf: it.showIf || null, scored: it.scored !== false })),
  }));
}

function scoreTest(id, answers, user) {
  const def = TESTS.find((t) => t.id === id);
  if (!def) throw new Error('알 수 없는 검사입니다.');
  const items = normItems(def);
  if (!Array.isArray(answers) || answers.length !== items.length) throw new Error('응답 개수가 맞지 않습니다.');
  const clean = items.map((it, i) => {
    if (it.showIf && !((Number(answers[it.showIf.item]) || 0) >= it.showIf.min)) return 0;
    const opts = it.options || def.options;
    const v = Number(answers[i]);
    if (!opts.some((o) => o.value === v)) throw new Error(`${i + 1}번 문항 응답이 올바르지 않습니다.`);
    return v;
  });
  const r = def.score(clean, user, { items });
  return { def, answers: clean, ...r };
}

module.exports = { TESTS, CATEGORIES, publicDefs, scoreTest };
