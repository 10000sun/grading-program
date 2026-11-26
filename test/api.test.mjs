import assert from 'node:assert';
import { createRequire } from 'node:module';
import { onRequest } from '../src/api.js';
const env = { DB: createRequire(import.meta.url)('./d1shim.js')() };
const call = async (method, route, body) => {
  const r = await onRequest({ request: new Request('http://x/api/' + route, { method, body: body && JSON.stringify(body) }), env, params: { route: [route] } });
  return [r.status, await r.json()];
};

assert.deepEqual(await call('GET', 'version'), [200, { v: 0 }]);
assert.equal((await call('GET', 'state'))[1].config, null);

const mkQ = (n) => ({ n, type: 'short', pts: 5, ans: '정답', half: '', wrong: '' });
const cfg = { version: 9, subjects: [{ id: 'art', name: '그림', group: 'select', alias: [], questions: [1, 2, 3].map(mkQ) }] };
assert.deepEqual(await call('POST', 'op', { type: 'setConfig', config: cfg }), [200, { v: 1 }]);
await call('POST', 'op', { type: 'putAnswers', rows: [{ name: '김봉팔', subject: 'art', answers: { 1: '5', 13: '사전-윤서' } }, { name: '서지안', subject: 'art', answers: { 1: '4' } }] });
await call('POST', 'op', { type: 'putAnswers', rows: [{ name: '김봉팔', subject: 'art', answers: { 1: '3' } }] }); // 같은 응시자·영역은 덮어쓰기
await call('POST', 'op', { type: 'setManual', name: '김봉팔', subject: 'art', n: 12, pts: 5 });
let [, s] = await call('GET', 'state');
assert.equal(s.config.version, 9);
assert.deepEqual(s.students['김봉팔'].answers.art, { 1: '3' });
assert.equal(Object.keys(s.students).length, 2);
assert.equal(s.manual['김봉팔'].art[12], 5);
assert.equal(s.ver, 4);
assert.equal((await call('GET', 'version'))[1].v, 4);

await call('POST', 'op', { type: 'setManual', name: '김봉팔', subject: 'art', n: 12, pts: null });
await call('POST', 'op', { type: 'delStudent', name: '서지안' });
[, s] = await call('GET', 'state');
assert.deepEqual(s.manual, {});
assert.deepEqual(Object.keys(s.students), ['김봉팔']);
await call('POST', 'op', { type: 'clearAll' });
assert.deepEqual((await call('GET', 'state'))[1].students, {});

// 잘못된 입력은 400이고 버전이 오르지 않음
const v0 = (await call('GET', 'version'))[1].v;
for (const op of [{ type: 'nope' }, { type: 'putAnswers', rows: [{ name: '', subject: 'art', answers: {} }] }, { type: 'putAnswers', rows: [{ name: 'a', subject: '../x', answers: {} }] },
  { type: 'setManual', name: 'a', subject: 'art', n: 1, pts: 999 }, { type: 'setConfig', config: {} }]) assert.equal((await call('POST', 'op', op))[0], 400);
assert.equal((await call('GET', 'version'))[1].v, v0);
assert.equal((await call('GET', 'nope'))[0], 404);
// 정답 설정 검증: HTML 특수문자, 잘못된 구조는 거부
for (const bad of [{ ...cfg, subjects: [{ ...cfg.subjects[0], name: '<img src=x onerror=alert(1)>' }] }, { ...cfg, subjects: [{ ...cfg.subjects[0], name: "a'b" }] },
  { ...cfg, subjects: [{ ...cfg.subjects[0], questions: [{ ...mkQ(2) }] }] }, // 문항 번호 ≠ 순서
  { ...cfg, subjects: [{ ...cfg.subjects[0], questions: [{ ...mkQ(1), type: 'x' }] }] }, { ...cfg, subjects: [{ ...cfg.subjects[0], questions: [{ ...mkQ(1), pts: '5" onfocus="x' }] }] },
  { ...cfg, version: 'v' }]) assert.equal((await call('POST', 'op', { type: 'setConfig', config: bad }))[0], 400);

// 부분 수정(setQ/appendQ): 서로 다른 문항을 따로 고쳐도 덮어쓰지 않음, 추가는 이어 붙임
await call('POST', 'op', { type: 'setQ', subject: 'art', n: 1, field: 'ans', value: '재팡' });
await call('POST', 'op', { type: 'setQ', subject: 'art', n: 2, field: 'pts', value: 7 });
await call('POST', 'op', { type: 'appendQ', subject: 'art', n: 1, field: 'ans', raw: '유재팡' });
await call('POST', 'op', { type: 'appendQ', subject: 'art', n: 3, field: 'half', raw: '반' });
const qs = (await call('GET', 'state'))[1].config.subjects[0].questions;
assert.deepEqual([qs[0].ans, qs[1].pts, qs[2].half, qs[2].ans], ['재팡,유재팡', 7, '반', '정답']);
for (const op of [{ type: 'setQ', subject: 'art', n: 1, field: 'type', value: 'nope' }, { type: 'setQ', subject: 'art', n: 9, field: 'ans', value: 'x' }, { type: 'setQ', subject: 'art', n: 1, field: 'n', value: 3 },
  { type: 'setQ', subject: 'art', n: 1, field: 'pts', value: 999 }, { type: 'appendQ', subject: 'art', n: 1, field: 'type', raw: 'x' }, { type: 'appendQ', subject: 'zzz', n: 1, field: 'ans', raw: 'x' }]) assert.equal((await call('POST', 'op', op))[0], 400);

// 객체 키로 쓰면 깨지는 이름은 거부 (state() 전체가 500이 되는 것을 방지)
for (const name of ['__proto__', 'constructor', 'toString']) assert.equal((await call('POST', 'op', { type: 'putAnswers', rows: [{ name, subject: 'art', answers: {} }] }))[0], 400);
assert.equal((await call('GET', 'state'))[0], 200);

// 병합: core.mergeInto와 같은 결과여야 함
await call('POST', 'op', { type: 'putAnswers', rows: [{ name: '빡통', subject: 'art', answers: { 1: 'a' } }, { name: '빡통', subject: 'history', answers: { 1: 'x' } }, { name: '김빡통', subject: 'history', answers: { 1: 'y' } }, { name: '옛', subject: 'art', answers: { 1: 'z' } }] });
await call('POST', 'op', { type: 'setManual', name: '빡통', subject: 'art', n: 12, pts: 3 });
await call('POST', 'op', { type: 'setManual', name: '빡통', subject: 'history', n: 26, pts: 1 });
await call('POST', 'op', { type: 'merge', from: '옛', to: '빡통' }); // 옛 → 빡통 (art 겹침: 빡통 유지)
await call('POST', 'op', { type: 'merge', from: '빡통', to: '김빡통' });
const [, m] = await call('GET', 'state');
assert.deepEqual(Object.keys(m.students), ['김빡통']);
assert.deepEqual(m.students['김빡통'].answers, { history: { 1: 'y' }, art: { 1: 'a' } });
assert.deepEqual(m.manual, { 김빡통: { art: { 12: 3 } } });
assert.deepEqual(m.alias, { 옛: '김빡통', 빡통: '김빡통' });
assert.equal((await call('POST', 'op', { type: 'merge', from: 'a', to: 'a' }))[0], 400);
await call('POST', 'op', { type: 'clearAll' });
assert.deepEqual((await call('GET', 'state'))[1].alias, {});

// 캠프 수동 지정: 저장, 해제, 병합 때 이전, 삭제 때 정리
await call('POST', 'op', { type: 'putAnswers', rows: [{ name: '가', subject: 'art', answers: { 1: '1' } }, { name: '나', subject: 'art', answers: { 1: '2' } }] });
await call('POST', 'op', { type: 'setCamp', name: '가', camp: '여백' });
await call('POST', 'op', { type: 'setCamp', name: '나', camp: '나래' });
assert.deepEqual((await call('GET', 'state'))[1].campOf, { 가: '여백', 나: '나래' });
await call('POST', 'op', { type: 'setCamp', name: '나', camp: null });
await call('POST', 'op', { type: 'merge', from: '가', to: '다' });
assert.deepEqual((await call('GET', 'state'))[1].campOf, { 다: '여백' });
assert.equal((await call('POST', 'op', { type: 'setCamp', name: '', camp: '여백' }))[0], 400);
await call('POST', 'op', { type: 'delStudent', name: '다' });
assert.deepEqual((await call('GET', 'state'))[1].campOf, {});
await call('POST', 'op', { type: 'clearAll' });

const pre = await onRequest({ request: new Request('http://x/api/op', { method: 'OPTIONS' }), env, params: { route: ['op'] } });
assert.equal(pre.status, 204);
assert.equal(pre.headers.get('access-control-allow-origin'), '*');
console.log('api ok');
