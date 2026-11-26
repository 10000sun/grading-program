const assert = require('assert');
require('../docs/default-config.js');
const C = require('../docs/core.js');
const cfg = structuredClone(globalThis.DEFAULT_CONFIG);
const sub = (id) => cfg.subjects.find((s) => s.id === id);

// 정답 세팅
sub('history').questions[0].ans = '3';
sub('history').questions[26].ans = '2';           // 27번(mc)
sub('history').questions[27].ans = '만해,Manhae';   // 28번 단답
sub('content').questions[7].ans = '1,3';           // 8번 복수
const camp = sub('camp');
camp.questions[5].ans = '2';   // 6번 (나래)
camp.questions[15].ans = '4';  // 16번 (공통)

// 객관식·복수·단답 정규화
assert.equal(C.grade(sub('history').questions[0], '③').ok, true);
assert.equal(C.grade(sub('history').questions[0], '3번').ok, true);
assert.equal(C.grade(sub('history').questions[0], '').ok, false);
assert.equal(C.grade(sub('content').questions[7], '③, ①').ok, true);
assert.equal(C.grade(sub('content').questions[7], '1').ok, false);
assert.equal(C.grade(sub('history').questions[27], ' manhae ').ok, true);

// 반만 인정: 정답이 아니어도 half 표기와 같으면 배점의 절반
const sq = sub('history').questions[27]; sq.half = '카모 비슷';
assert.deepEqual([C.grade(sq, '카모비슷').pts, C.grade(sq, '카모비슷').ok, C.grade(sq, 'Manhae').pts, C.grade(sq, '다른답').pts], [sq.pts / 2, false, sq.pts, 0]);

// 서술형: 수동 점수 전엔 pending
const essay = sub('history').questions[25];
assert.equal(C.grade(essay, '답').pending, true);
assert.deepEqual([C.grade(essay, '답', 1).pts, C.grade(essay, '답', 99).pts], [1, essay.pts]);

// 캠프 판별: 나래 문항만 응답 → 나래 범위(6~10)+공통(16~25)만 채점
const st = { name: 'A', answers: { camp: { 6: '2', 16: '4', 1: '' } } };
const r = C.scoreStudent(cfg, st);
assert.equal(r.camp, '나래');
assert.equal(r.subjects.camp.max, 60);
assert.equal(r.subjects.camp.score, 8);
assert.equal(Object.keys(r.subjects.camp.detail).length, 15);

// 복수 캠프 응답은 플래그
const r2 = C.scoreStudent(cfg, { name: 'B', answers: { camp: { 1: '1', 6: '2', 7: '1' } } });
assert.equal(r2.camp, '나래');
assert.ok(r2.flags[0].includes('복수 캠프'));

// 통계: 총점 순위·백분위·오답률
const stats = C.analyze(cfg, { A: st, B: { answers: { history: { 1: '3' }, camp: { 6: '1', 16: '4' } } } }, {});
assert.equal(stats.rows.length, 2);
const a = stats.rows.find((x) => x.name === 'A').res, b = stats.rows.find((x) => x.name === 'B').res;
assert.equal(a.total, 8); assert.equal(b.total, 6);
assert.equal(a.rank, 1); assert.equal(b.rank, 2);
assert.equal(a.pct, 75); assert.equal(b.pct, 25);
assert.equal(stats.questions.camp[6].wrongRate, 0.5);

// 병합: 겹치는 영역은 to 유지, 안 겹치는 영역·수동 점수는 이동, 별칭 기록
const M = { students: { 빡통: { answers: { history: { 1: 'x' }, art: { 1: 'a' } } }, 김빡통: { answers: { history: { 1: 'y' } } } }, manual: { 빡통: { art: { 12: 3 }, history: { 26: 1 } } }, alias: { 옛: '빡통' } };
assert.deepEqual(C.mergeInto(M, '빡통', '김빡통'), ['history']);
assert.deepEqual(Object.keys(M.students), ['김빡통']);
assert.deepEqual(M.students['김빡통'].answers, { history: { 1: 'y' }, art: { 1: 'a' } });
assert.deepEqual(M.manual, { 김빡통: { art: { 12: 3 } } }); // 버려진 history 답안의 수동 점수는 같이 버림
assert.deepEqual(M.alias, { 옛: '김빡통', 빡통: '김빡통' });
const R = { students: {}, manual: {}, alias: {} }; C.mergeInto(R, '없는이름', '대표'); // 존재하지 않는 이름은 별칭만 등록
assert.deepEqual([R.students, R.alias], [{}, { 없는이름: '대표' }]);
console.log('ok');

// 기본 설정 점검: 서술 외에는 정답이 모두 있고 형식이 맞아야 함
for (const s of globalThis.DEFAULT_CONFIG.subjects) for (const q of s.questions) {
  const id = s.id + ' ' + q.n;
  if (q.type !== 'essay') assert.ok(q.ans, id + ' 정답 없음');
  if (q.type === 'mc') assert.match(q.ans, /^[1-5]$/, id);
  if (q.type === 'multi') assert.match(q.ans, /^[1-5](,[1-5])+$/, id);
}
console.log('defaults ok');
