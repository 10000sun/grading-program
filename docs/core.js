// 채점·통계 엔진 (브라우저/노드 공용, DOM 의존 없음)
(function (root) {
  const CIRC = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5' };
  const digits = (s) => String(s ?? '').replace(/[①-⑤]/g, (c) => CIRC[c]).match(/[1-5]/g) || [];
  const normMc = (s) => digits(s)[0] || '';
  const normMulti = (s) => [...new Set(digits(s))].sort().join(',');
  const normShort = (s) => String(s ?? '').toLowerCase().replace(/[\s.,，。!?'"“”‘’「」『』()\[\]{}\-~·ㆍ]/g, '');
  const blank = (v) => v == null || String(v).trim() === '';
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  function grade(q, raw, manualPts) {
    if (q.type === 'essay') {
      if (blank(raw)) return { ok: false, pts: 0, pending: false };
      const pts = manualPts == null ? 0 : Math.max(0, Math.min(Number(manualPts) || 0, q.pts));
      return { ok: manualPts != null && pts >= q.pts, pts, pending: manualPts == null };
    }
    let ok = false;
    if (!blank(raw)) {
      if (q.type === 'mc') ok = !!q.ans && normMc(raw) === normMc(q.ans);
      else if (q.type === 'multi') ok = !!q.ans && normMulti(raw) === normMulti(q.ans);
      else {
        const has = (list) => String(list || '').split(',').map(normShort).filter(Boolean).includes(normShort(raw));
        ok = has(q.ans);
        if (!ok && has(q.half)) return { ok: false, pts: q.pts / 2, pending: false, half: true }; // 반만 인정 표기
      }
    }
    return { ok, pts: ok ? q.pts : 0, pending: false };
  }

  // 캠프 영역: 응답이 있는 캠프 문항 구간으로 소속 캠프를 판별
  function detectCamp(s, ans) {
    const cnt = Object.entries(s.camps).map(([c, [a, b]]) => {
      let k = 0;
      for (let n = a; n <= b; n++) if (!blank(ans[n])) k++;
      return [c, k];
    });
    const used = cnt.filter(([, k]) => k > 0).sort((x, y) => y[1] - x[1]);
    if (!used.length) return { camp: null, flag: '캠프 문항 미응답' };
    const multi = used.length > 1;
    return { camp: used[0][0], flag: multi ? '복수 캠프 응답(' + used.map((u) => u.join(' ')).join(', ') + ')' : null };
  }

  function scope(s, camp) {
    if (!s.camps) return s.questions;
    const [a, b] = s.camps[camp] || [0, -1];
    const [c, d] = s.common;
    return s.questions.filter((q) => (q.n >= a && q.n <= b) || (q.n >= c && q.n <= d));
  }

  function scoreStudent(cfg, st, manual) {
    const out = { subjects: {}, total: 0, max: 0, pending: 0, flags: [], camp: null };
    for (const s of cfg.subjects) {
      const ans = (st.answers || {})[s.id] || {};
      let camp = null;
      if (s.camps) {
        const d = detectCamp(s, ans), forced = Object.hasOwn(s.camps, st.camp) ? st.camp : null; // st.camp: 관리 탭에서 수동 지정한 캠프
        camp = out.camp = forced || d.camp; out.campForced = !!forced;
        if (!forced && d.flag && Object.values(ans).some((v) => !blank(v))) out.flags.push(d.flag);
      }
      const qs = scope(s, camp);
      const o = { score: 0, max: 0, pending: 0, detail: {}, taken: qs.some((q) => !blank(ans[q.n])) };
      for (const q of qs) {
        const g = grade(q, ans[q.n], manual?.[st.name]?.[s.id]?.[q.n]);
        o.detail[q.n] = { ...g, raw: ans[q.n] };
        o.score += g.pts; o.max += q.pts; o.pending += g.pending ? 1 : 0;
      }
      out.subjects[s.id] = o;
      out.pending += o.pending;
      if (s.group === 'common') { out.total += o.score; out.max += o.max; }
    }
    return out;
  }

  // 백분위: (자신보다 낮은 인원 + 동점자(본인 포함)/2) / 전체 * 100
  const pctile = (arr, x) => ((arr.filter((v) => v < x).length + arr.filter((v) => v === x).length / 2) / arr.length) * 100;
  const CUTS = [4, 11, 23, 40, 60, 77, 89, 96, 100];
  const gradeOf = (arr, x) => CUTS.findIndex((c) => (arr.filter((v) => v >= x).length / arr.length) * 100 <= c) + 1;

  function analyze(cfg, students, manual, campOf) {
    const rows = Object.entries(students).map(([name, st]) => ({ name, res: scoreStudent(cfg, { ...st, name, camp: campOf?.[name] }, manual) }));
    // 순위·백분위는 공통 영역을 하나라도 푼 응시자끼리만 비교 (선택영역만 푼 사람의 0점이 섞이지 않게)
    const common = (r) => cfg.subjects.some((s) => s.group === 'common' && r.res.subjects[s.id].taken);
    const stats = { rows, subjects: {}, questions: {}, camps: {}, totals: rows.filter(common).map((r) => r.res.total) };
    for (const r of rows) {
      if (!common(r)) { r.res.rank = r.res.pct = null; continue; }
      r.res.rank = 1 + stats.totals.filter((t) => t > r.res.total).length;
      r.res.pct = pctile(stats.totals, r.res.total);
    }
    for (const s of cfg.subjects) {
      const takers = rows.filter((r) => r.res.subjects[s.id].taken);
      const sc = takers.map((r) => r.res.subjects[s.id].score);
      const mean = avg(sc), sd = Math.sqrt(avg(sc.map((x) => (x - mean) ** 2)));
      stats.subjects[s.id] = { n: sc.length, mean, sd, max: sc.length ? Math.max(...sc) : 0, min: sc.length ? Math.min(...sc) : 0 };
      for (const r of takers) {
        const o = r.res.subjects[s.id];
        o.std = sd ? 100 + (20 * (o.score - mean)) / sd : 100; // 표준점수: 평균 100, 표준편차 20
        o.pct = pctile(sc, o.score);
        o.grade = gradeOf(sc, o.score);
        o.rank = 1 + sc.filter((x) => x > o.score).length; // 영역 내 순위
      }
      const qs = (stats.questions[s.id] = {});
      for (const q of s.questions) {
        const att = takers.filter((r) => r.res.subjects[s.id].detail[q.n]);
        const dist = {};
        let right = 0;
        for (const r of att) {
          const d = r.res.subjects[s.id].detail[q.n];
          if (d.ok) right++;
          const key = blank(d.raw) ? '무응답' : q.type === 'mc' ? normMc(d.raw) || String(d.raw).trim()
            : q.type === 'multi' ? normMulti(d.raw) || String(d.raw).trim() : normShort(d.raw) || '무응답';
          (dist[key] ||= { raw: String(d.raw ?? '').trim(), count: 0, ok: d.ok, half: d.half }).count++;
        }
        qs[q.n] = { att: att.length, right, wrongRate: att.length ? 1 - right / att.length : 0, dist };
      }
    }
    const campId = cfg.subjects.find((s) => s.camps)?.id;
    for (const r of rows) {
      if (!r.res.subjects[campId]?.taken && !r.res.campForced) continue; // 캠프 영역을 풀었거나 캠프를 수동 지정한 사람만 캠프별로 집계
      const c = r.res.camp || '미판별';
      (stats.camps[c] ||= { n: 0, sum: 0 });
      stats.camps[c].n++; stats.camps[c].sum += r.res.total;
    }
    return stats;
  }

  // 응시자 병합(from → to): 같은 영역 답안이 양쪽에 있으면 to의 것을 유지하고 from의 것은 버림. 서버 merge 연산과 같은 규칙.
  function mergeInto(S, from, to) {
    S.alias ||= {};
    const a = S.students[from], t = (S.students[to] ||= { answers: {} }), dropped = [];
    for (const [sid, ans] of Object.entries(a?.answers || {})) (t.answers[sid] ? dropped.push(sid) : (t.answers[sid] = ans));
    for (const [sid, qs] of Object.entries(S.manual[from] || {})) {
      if (dropped.includes(sid)) continue;
      const m = ((S.manual[to] ||= {})[sid] ||= {});
      for (const [q, p] of Object.entries(qs)) if (m[q] == null) m[q] = p;
    }
    if (!Object.keys(t.answers).length) delete S.students[to]; // 아무 답안도 없으면 응시자로 만들지 않음 (별칭만 기록)
    delete S.students[from]; delete S.manual[from];
    if (S.campOf?.[from]) { S.campOf[to] ||= S.campOf[from]; delete S.campOf[from]; } // 수동 캠프는 대표 이름 것을 우선
    for (const k of Object.keys(S.alias)) if (S.alias[k] === from) S.alias[k] = to;
    S.alias[from] = to;
    return dropped;
  }

  const Core = { mergeInto, grade, detectCamp, scope, scoreStudent, analyze, normShort, normMulti, blank };
  if (typeof module !== 'undefined') module.exports = Core; else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
