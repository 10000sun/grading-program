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

const cfg = { version: 9, subjects: [{ id: 'art', questions: [] }] };
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
console.log('api ok');
