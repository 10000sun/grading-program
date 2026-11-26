// D1 기반 API (src/worker.js가 /api/* 요청에 사용). 로그인 없음: 누구나 읽기/쓰기. 바인딩 이름은 DB.
// shortcut: 쓰기 인증이 없어 누구나 삭제/덮어쓰기 가능, 필요해지면 ADMIN_TOKEN 헤더 검사를 op 앞에 추가.
// CORS 전체 허용: GitHub Pages(github.io) 사이트에서도 이 API를 쓰도록 함
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
const bad = (m) => Object.assign(new Error(m), { status: 400 });

let ready;
const init = (db) => (ready ||= db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)'),
  db.prepare('CREATE TABLE IF NOT EXISTS answers (name TEXT, subject TEXT, data TEXT, PRIMARY KEY (name, subject))'),
  db.prepare('CREATE TABLE IF NOT EXISTS alias (src TEXT PRIMARY KEY, dst TEXT)'),
  db.prepare('CREATE TABLE IF NOT EXISTS camp_of (name TEXT PRIMARY KEY, camp TEXT)'),
  db.prepare('CREATE TABLE IF NOT EXISTS manual (name TEXT, subject TEXT, q INTEGER, pts REAL, PRIMARY KEY (name, subject, q))'),
]).catch((e) => { ready = null; throw e; }));

const ver = async (db) => Number((await db.prepare("SELECT v FROM meta WHERE k='ver'").first('v')) || 0);
const bump = (db) => db.prepare("INSERT INTO meta (k, v) VALUES ('ver', '1') ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1");

async function state(db) {
  const [cfg, ans, man, als, cmp, v] = await Promise.all([
    db.prepare("SELECT v FROM meta WHERE k='config'").first('v'),
    db.prepare('SELECT name, subject, data FROM answers').all(),
    db.prepare('SELECT name, subject, q, pts FROM manual').all(),
    db.prepare('SELECT src, dst FROM alias').all(),
    db.prepare('SELECT name, camp FROM camp_of').all(),
    ver(db),
  ]);
  const students = {}, manual = {}, alias = {};
  for (const r of als.results) alias[r.src] = r.dst;
  const campOf = {};
  for (const r of cmp.results) campOf[r.name] = r.camp;
  for (const r of ans.results) ((students[r.name] ||= { answers: {} }).answers)[r.subject] = JSON.parse(r.data);
  for (const r of man.results) ((manual[r.name] ||= {})[r.subject] ||= {})[r.q] = r.pts;
  return { config: cfg ? JSON.parse(cfg) : null, students, manual, alias, campOf, ver: v };
}

const okName = (s) => typeof s === 'string' && s.length > 0 && s.length <= 60;
const okSubj = (s) => typeof s === 'string' && /^[a-z]{1,20}$/.test(s);

async function apply(db, op) {
  const st = [];
  if (op?.type === 'setConfig') {
    const s = JSON.stringify(op.config);
    if (!Array.isArray(op.config?.subjects) || s.length > 300000) throw bad('config');
    st.push(db.prepare("INSERT INTO meta (k, v) VALUES ('config', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(s));
  } else if (op?.type === 'putAnswers') {
    if (!Array.isArray(op.rows) || op.rows.length > 50) throw bad('rows');
    for (const r of op.rows) {
      const s = JSON.stringify(r?.answers);
      if (!okName(r?.name) || !okSubj(r?.subject) || !r.answers || typeof r.answers !== 'object' || s.length > 20000) throw bad('row');
      st.push(db.prepare('INSERT INTO answers (name, subject, data) VALUES (?, ?, ?) ON CONFLICT(name, subject) DO UPDATE SET data = excluded.data').bind(r.name, r.subject, s));
    }
  } else if (op?.type === 'setManual') {
    if (!okName(op.name) || !okSubj(op.subject) || !Number.isInteger(op.n)) throw bad('manual');
    if (op.pts == null) st.push(db.prepare('DELETE FROM manual WHERE name = ? AND subject = ? AND q = ?').bind(op.name, op.subject, op.n));
    else if (typeof op.pts === 'number' && op.pts >= 0 && op.pts <= 100) st.push(db.prepare('INSERT INTO manual (name, subject, q, pts) VALUES (?, ?, ?, ?) ON CONFLICT(name, subject, q) DO UPDATE SET pts = excluded.pts').bind(op.name, op.subject, op.n, op.pts));
    else throw bad('pts');
  } else if (op?.type === 'delStudent') {
    if (!okName(op.name)) throw bad('name');
    st.push(db.prepare('DELETE FROM answers WHERE name = ?').bind(op.name), db.prepare('DELETE FROM manual WHERE name = ?').bind(op.name), db.prepare('DELETE FROM camp_of WHERE name = ?').bind(op.name));
  } else if (op?.type === 'setCamp') { // 캠프 수동 지정 (camp가 null이면 자동 판별로 되돌림)
    if (!okName(op.name) || !(op.camp == null || (typeof op.camp === 'string' && op.camp.length > 0 && op.camp.length <= 20))) throw bad('camp');
    st.push(op.camp == null ? db.prepare('DELETE FROM camp_of WHERE name = ?').bind(op.name)
      : db.prepare('INSERT INTO camp_of (name, camp) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET camp = excluded.camp').bind(op.name, op.camp));
  } else if (op?.type === 'merge') { // from → to. 같은 영역 답안이 겹치면 to의 것을 유지
    if (!okName(op.from) || !okName(op.to) || op.from === op.to) throw bad('merge');
    const f = op.from, to = op.to;
    st.push(
      db.prepare('DELETE FROM manual WHERE name = ? AND subject IN (SELECT subject FROM answers WHERE name = ?)').bind(f, to),
      db.prepare('UPDATE OR IGNORE answers SET name = ? WHERE name = ?').bind(to, f),
      db.prepare('DELETE FROM answers WHERE name = ?').bind(f),
      db.prepare('UPDATE OR IGNORE manual SET name = ? WHERE name = ?').bind(to, f),
      db.prepare('DELETE FROM manual WHERE name = ?').bind(f),
      db.prepare('UPDATE OR IGNORE camp_of SET name = ? WHERE name = ?').bind(to, f),
      db.prepare('DELETE FROM camp_of WHERE name = ?').bind(f),
      db.prepare('UPDATE alias SET dst = ? WHERE dst = ?').bind(to, f),
      db.prepare('INSERT INTO alias (src, dst) VALUES (?, ?) ON CONFLICT(src) DO UPDATE SET dst = excluded.dst').bind(f, to),
    );
  } else if (op?.type === 'clearAll') {
    st.push(db.prepare('DELETE FROM answers'), db.prepare('DELETE FROM manual'), db.prepare('DELETE FROM alias'), db.prepare('DELETE FROM camp_of'));
  } else throw bad('op');
  await db.batch([...st, bump(db)]);
  return ver(db);
}

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!env.DB) return J({ error: 'D1 바인딩 DB가 없습니다' }, 500);
  try {
    await init(env.DB);
    const route = [].concat(params.route || [])[0];
    if (request.method === 'GET' && route === 'version') return J({ v: await ver(env.DB) });
    if (request.method === 'GET' && route === 'state') return J(await state(env.DB));
    if (request.method === 'POST' && route === 'op') {
      const text = await request.text();
      if (text.length > 1e6) return J({ error: 'too large' }, 413);
      let op; try { op = JSON.parse(text); } catch { throw bad('json'); }
      return J({ v: await apply(env.DB, op) });
    }
    return J({ error: 'not found' }, 404);
  } catch (e) { return J({ error: e.message }, e.status || 500); }
}
