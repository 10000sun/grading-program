// D1 흉내 (node:sqlite 사용): API 테스트와 로컬 개발 서버에서 공용
const { DatabaseSync } = require('node:sqlite');
module.exports = () => {
  const db = new DatabaseSync(':memory:');
  const mk = (sql, args = []) => ({
    bind: (...a) => mk(sql, a),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async (col) => { const r = db.prepare(sql).get(...args); return r ? (col ? r[col] : r) : null; },
  });
  return {
    prepare: (s) => mk(s),
    batch: async (sts) => { db.exec('BEGIN'); try { const out = []; for (const s of sts) out.push(await s.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
};
