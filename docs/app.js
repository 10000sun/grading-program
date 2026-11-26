const KEY = 'evaSuneung.v1';
const TYPES = { mc: '객관식', multi: '복수선택', short: '단답', essay: '서술(수동)' };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

let S = load(), tab = 'setup', log = [], sel = '', qSubj = 'history', qSort = false, showStd = false;
function load() {
  try { const j = JSON.parse(localStorage.getItem(KEY)); if (j?.config) { if (j.config.version !== DEFAULT_CONFIG.version) j.config = structuredClone(DEFAULT_CONFIG); return j; } } catch {}
  return { config: structuredClone(DEFAULT_CONFIG), students: {}, manual: {}, alias: {}, campOf: {} };
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

// ---------- 서버 동기화 (Cloudflare Pages Functions + D1). 서버가 없으면 이 브라우저에만 저장 ----------
let online = false;
// github.io에서 열면 Cloudflare 서버 주소의 API를 사용 (같은 데이터 공유). Cloudflare 서버 주소.
const API_BASE = /github\.io$/.test(location.hostname) ? 'https://grading-program.lws001108.workers.dev/' : '';
const api = (path, body) => fetch(API_BASE + 'api/' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
const typing = () => { const a = document.activeElement; return a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== 'file'; };
const netBadge = () => { $('#total').textContent = `총 응시자 ${Object.keys(S.students).length}명`; $('#net').textContent = online ? '🟢 서버 연동 (모두 같은 화면)' : '⚠ 서버 연결 없음: 이 브라우저에만 저장'; };
async function sync(force) {
  try {
    const { v } = await api('version');
    if (online && !force && v === S.ver) return;
    const j = await api('state');
    if (online && typing()) return; // 입력 중에는 덮어쓰지 않고 다음 주기에 반영
    online = true;
    if (!j.config || j.config.version !== DEFAULT_CONFIG.version) { // 서버에 정답 설정이 없거나 구버전이면 기본값으로 초기화
      j.config = structuredClone(DEFAULT_CONFIG);
      api('op', { type: 'setConfig', config: j.config }).then((r) => (S.ver = r.v)).catch(() => {});
    }
    Object.assign(S, { config: j.config, students: j.students, manual: j.manual, alias: j.alias || {}, campOf: j.campOf || {}, ver: j.ver });
    save(); if (tab !== 'setup') render(); // 정답 세팅 탭은 펼침 상태를 지키려고 다시 그리지 않음
  } catch { online = false; }
  netBadge();
}
async function op(body) {
  save();
  if (!online) return;
  try { const { v } = await api('op', body); if (v === S.ver + 1) S.ver = v; else await sync(true); } catch { online = false; netBadge(); }
}
const subj = (id) => S.config.subjects.find((s) => s.id === id);
const download = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); };
const stats = () => Core.analyze(S.config, S.students, S.manual, S.campOf);

// ---------- 탭 ----------
const TABS = [['setup', '1. 정답 세팅'], ['import', '2. 답안 업로드'], ['manual', '3. 수동 채점'], ['report', '4. 성적표'], ['items', '5. 문항 분석'], ['admin', '6. 응시자 관리']];
function render() {
  $('#nav').innerHTML = TABS.map(([k, v]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('');
  $('#main').innerHTML = { setup, import: importTab, manual, report, items, admin }[tab]();
  netBadge();
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(); return; }
  const a = e.target.closest('[data-act]'); if (a) ACT[a.dataset.act]?.(a.dataset);
});
document.addEventListener('change', (e) => {
  const d = e.target.dataset;
  if (d.f) { // 정답 세팅 입력
    const q = subj(d.s).questions[d.n - 1];
    q[d.f] = d.f === 'pts' ? Number(e.target.value) || 0 : e.target.value;
    op({ type: 'setConfig', config: S.config }); if (d.f === 'type') render();
  } else if (d.mp) { // 수동 점수
    const [s, n, name] = JSON.parse(d.mp);
    const m = ((S.manual[name] ||= {})[s] ||= {});
    if (e.target.value === '') delete m[n]; else m[n] = Number(e.target.value);
    op({ type: 'setManual', name, subject: s, n, pts: e.target.value === '' ? null : Number(e.target.value) });
  } else if (d.camp !== undefined) { // 관리 탭: 캠프 수동 지정
    const v = e.target.value;
    if (v) (S.campOf ||= {})[d.camp] = v; else delete S.campOf?.[d.camp];
    op({ type: 'setCamp', name: d.camp, camp: v || null }); render();
  } else if (e.target.id === 'files') importFiles([...e.target.files]);
  else if (e.target.id === 'cfgfile') e.target.files[0].text().then((t) => { S.config = JSON.parse(t); op({ type: 'setConfig', config: S.config }); render(); });
  else if (e.target.id === 'selStudent') { sel = e.target.value; render(); }
  else if (e.target.id === 'showStd') { showStd = e.target.checked; render(); }
  else if (e.target.id === 'qSubj') { qSubj = e.target.value; render(); }
});

// ---------- 1. 정답 세팅 ----------
const guide = (h, s) => `<div class="guide"><b>${h}</b> ${s}</div>`;
function setup() {
  const body = S.config.subjects.map((s) => {
    const missing = s.questions.filter((q) => q.type !== 'essay' && !q.ans).length;
    const rows = s.questions.map((q) => {
      const g = s.camps ? (q.n >= s.common[0] ? '공통' : Object.entries(s.camps).find(([, [a, b]]) => q.n >= a && q.n <= b)?.[0] || '') : '';
      return `<tr><td>${q.n}</td><td class="mut">${g}</td>
<td><select data-s="${s.id}" data-n="${q.n}" data-f="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
<td><input class="n" type="number" min="0" value="${q.pts}" data-s="${s.id}" data-n="${q.n}" data-f="pts"></td>
<td class="l"><input class="a" value="${esc(q.ans)}" ${q.type === 'essay' ? 'disabled placeholder="수동 채점"' : ''} data-s="${s.id}" data-n="${q.n}" data-f="ans"
 placeholder="${{ mc: '예) 3', multi: '예) 1,3', short: '예) 정답,다른표기' }[q.type] || ''}">
${q.type === 'short' ? `<br><input class="a" value="${esc(q.half)}" data-s="${s.id}" data-n="${q.n}" data-f="half" placeholder="반만 인정할 표기 (쉼표로 구분)">
<br><input class="a" value="${esc(q.wrong)}" data-s="${s.id}" data-n="${q.n}" data-f="wrong" placeholder="오답으로 확정한 표기 (검토 목록에서 숨김)">` : ''}</td></tr>`;
    }).join('');
    return `<details><summary>${s.name} <span class="mut">${s.group === 'common' ? '공통' : '선택'} · ${s.questions.length}문항</span>
 ${missing ? `<span class="badge bad">정답 ${missing}개 비어 있음</span>` : '<span class="badge ok">✓ 입력 완료</span>'}</summary>
<table><tr><th>번호</th><th>구분</th><th>유형</th><th>배점</th><th>정답</th></tr>${rows}</table></details>`;
  }).join('');
  return guide('① 정답을 입력하세요.', '영역을 눌러 펼친 뒤 정답칸에 적습니다. 자동 저장됩니다.')
    + `<details class="help"><summary>입력 방법 보기</summary><ul>
<li>객관식: <code>3</code> (숫자 1~5)</li><li>복수선택: <code>1,3</code> (순서 상관없음)</li>
<li>단답: <code>정답,다른표기</code> (쉼표로 인정 답 여러 개) · 두 칸짜리 답은 <code>철수 영희</code>처럼 공백으로</li>
<li>③ 수동 채점 탭의 단답 오답 검토: "정답 인정", "반만 인정"(배점의 절반), "오답 처리" 중 하나를 누르면 검토가 끝나 다시 뜨지 않습니다. 단답 문항 아래 칸에서 직접 고칠 수도 있습니다</li><li>서술(수동): 정답 없이 ③ 수동 채점 탭에서 점수를 직접 줍니다</li></ul></details>
${body}<p><button data-act="cfgSave">정답 파일로 저장</button> <label class="btn">정답 파일 불러오기 <input type="file" id="cfgfile" accept=".json" hidden></label></p>`;
}

// ---------- 2. 업로드 ----------
// 구글폼 응답 시트: 헤더 "성명", "문제 N (X점)" / 행 = 응시자 1명. 영역은 파일명 → 배점 순서로 인식.
function readForm(ws, sn, fname, def) { // 영역 판별 우선순위: 직접 지정(시트 1개일 때) > 시트 이름 > 파일 이름 > 문항 수·배점
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const head = (rows[0] || []).map((h) => String(h).trim());
  const ni = head.findIndex((h) => /^(성명|이름)/.test(h));
  const qs = head.map((h, i) => { const m = h.match(/^(?:\[[^\]]*\]\s*)?문제\s*(\d+)\s*(?:\((\d+)\s*점\))?/); return m && { i, n: +m[1], pts: +m[2] || 0 }; }).filter(Boolean); // "[여백] 문제 1 (4점)" 형태도 허용
  if (ni < 0 || !qs.length) return null;
  const named = (txt) => S.config.subjects.find((x) => [x.name, ...x.alias].some((a) => txt.includes(a)));
  const same = (s) => (s.questions.length === qs.length ? s.questions.filter((q, k) => q.pts === qs[k].pts).length : -1);
  const best = S.config.subjects.map((s) => [same(s), s]).sort((a, b) => b[0] - a[0])[0];
  const s = (def && subj(def)) || named(sn) || named(fname) || (best[0] === qs.length ? best[1] : null);
  return { s, sn, ni, qs, rows: rows.slice(1).filter((r) => String(r[ni]).trim()) };
}
async function importFiles(files) {
  const def = $('#defSubj')?.value, rows = [];
  for (const f of files) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const forms = wb.SheetNames.map((sn) => readForm(wb.Sheets[sn], sn, f.name, wb.SheetNames.length === 1 ? def : '')).filter(Boolean);
      if (!forms.length) { log.push(`${f.name}: 구글폼 응답 형식이 아닙니다 ("성명", "문제 N" 열 필요)`); continue; }
      for (const form of forms) { // 시트마다 각각 가져옴
        const label = wb.SheetNames.length > 1 ? `${f.name} [${form.sn}]` : f.name;
        if (!form.s) { log.push(`${label}: 영역을 인식하지 못했습니다 (시트 이름에 영역명을 넣거나 "영역 직접 지정" 사용)`); continue; }
        const seen = {}; let dup = 0;
        for (const r of form.rows) { // 같은 이름이 여러 번 제출되면 마지막(최신) 응답 사용
          const raw = String(r[form.ni]).trim().replace(/\s+/g, ' ').slice(0, 60), name = S.alias?.[raw] || raw; // 병합해 둔 이름은 대표 이름으로
          if (seen[name]) dup++; seen[name] = 1;
          const answers = Object.fromEntries(form.qs.map((q) => [q.n, r[q.i]]));
          ((S.students[name] ||= { answers: {} }).answers)[form.s.id] = answers;
          rows.push({ name, subject: form.s.id, answers });
        }
        log.push(`${label}: ${form.s.name} ${Object.keys(seen).length}명 읽음${dup ? ` (중복 제출 ${dup}건은 최신 응답 사용)` : ''}`);
      }
    } catch (err) { log.push(`${f.name}: 오류 ${err.message}`); }
  }
  for (let i = 0; i < rows.length; i += 50) await op({ type: 'putAnswers', rows: rows.slice(i, i + 50) });
  save(); render();
}
function importTab() {
  const st = stats(), cols = S.config.subjects.filter((s) => s.group === 'common' || st.subjects[s.id].n > 0);
  const rows = st.rows.map((r) => `<tr><td class="l">${esc(r.name)}</td><td>${r.res.camp || '-'}</td>
${cols.map((s) => `<td>${r.res.subjects[s.id].taken ? '✓' : ''}</td>`).join('')}
<td class="bad l">${esc(r.res.flags.join(' / '))}</td><td><button data-act="del" data-name="${esc(r.name)}">삭제</button></td></tr>`).join('');
  return guide('② 구글폼 응답 엑셀을 올리세요.', '파일 하나에 시트가 여러 개여도, 영역별 파일 여러 개여도 됩니다. 성명 열이 이름이고, 영역은 시트 이름·파일 이름·배점으로 자동 인식합니다.')
    + `<label class="drop">📂 엑셀 파일을 여기에 끌어다 놓거나 클릭해서 선택 (여러 개 가능)<input type="file" id="files" multiple accept=".xlsx,.xls,.csv" hidden></label>
<details class="help"><summary>영역이 인식되지 않을 때</summary>올리는 파일의 영역을 직접 지정:
<select id="defSubj"><option value="">(선택 안 함)</option>${S.config.subjects.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}</select></details>
<h3>총 응시자 ${st.rows.length}명</h3>
<p class="mut">${cols.map((s) => `${s.name} ${st.subjects[s.id].n}명`).join(' · ')}<br>캠프별 ${Object.entries(st.camps).map(([c, v]) => `${c} ${v.n}명`).join(' · ') || '-'}</p>
${st.rows.length ? `<table><tr><th>이름</th><th>캠프</th>${cols.map((s) => `<th>${s.name}</th>`).join('')}<th>경고</th><th></th></tr>${rows}</table>
<button data-act="clearAll">전체 삭제</button>` : ''}
${log.length ? `<details><summary>가져오기 기록</summary><pre>${esc(log.slice(-40).join('\n'))}</pre></details>` : ''}`;
}

// ---------- 3. 수동 채점 ----------
function manual() {
  const st = stats(), out = [];
  const refText = (q) => (q.type === 'short' ? String(q.ans || '').split(',').filter(Boolean).join(' / ') : String(q.ans || '')); // 단답은 인정 표기 전부
  const refBox = (q) => `<div class="ref"><b>모범답안</b> <span style="white-space:pre-wrap">${esc(refText(q)) || '-'}</span>${q.half ? `<br><span class="mut">반만 인정: ${esc(String(q.half).split(',').join(' / '))}</span>` : ''}</div>`;
  const refShort = (q) => { const t = refText(q).replace(/\s+/g, ' '); return `<span class="ref-inline">모범답안: ${esc(t.length > 40 ? t.slice(0, 40) + '…' : t) || '-'}</span>`; };
  for (const s of S.config.subjects) for (const q of s.questions) {
    if (q.type === 'essay') {
      const rows = st.rows.map((r) => ({ r, d: r.res.subjects[s.id].detail[q.n] })).filter((x) => x.d && !Core.blank(x.d.raw));
      if (rows.length) out.push(`<details><summary>${s.name} ${q.n}번 (서술, ${q.pts}점) <span class="mut">${rows.filter((x) => x.d.pending).length}건 미채점</span> ${refShort(q)}</summary>
${refBox(q)}<table>${rows.map(({ r, d }) => `<tr><td class="l">${esc(r.name)}</td><td class="l" style="white-space:normal;max-width:520px">${esc(d.raw)}</td>
<td><input class="n" type="number" min="0" max="${q.pts}" step="0.5" value="${S.manual[r.name]?.[s.id]?.[q.n] ?? ''}" data-mp='${esc(JSON.stringify([s.id, q.n, r.name]))}'> / ${q.pts}</td></tr>`).join('')}</table></details>`);
    } else if (q.type === 'short') {
      const done = new Set(String(q.wrong || '').split(',').map(Core.normShort)); // 정답/반만/오답 처리한 표기는 다시 안 뜸
      const wrong = Object.entries(st.questions[s.id][q.n].dist).filter(([k, v]) => !v.ok && !v.half && !done.has(k) && k !== '무응답').sort((a, b) => b[1].count - a[1].count);
      if (wrong.length) out.push(`<details><summary>${s.name} ${q.n}번 단답 오답 검토 <span class="mut">(${wrong.length}종)</span> ${refShort(q)}</summary>
${refBox(q)}<table>
${wrong.map(([, v]) => `<tr><td class="l">${esc(v.raw)}</td><td>${v.count}명</td><td><button data-act="accept" data-s="${s.id}" data-n="${q.n}" data-raw="${esc(v.raw)}">정답 인정</button> <button data-act="half" data-s="${s.id}" data-n="${q.n}" data-raw="${esc(v.raw)}">반만 인정</button> <button data-act="wrong" data-s="${s.id}" data-n="${q.n}" data-raw="${esc(v.raw)}">오답 처리</button></td></tr>`).join('')}</table></details>`);
    }
  }
  return guide('③ 서술형 점수를 주세요.', '서술형은 점수 입력, 단답은 오답 중 정답으로 인정할 표기를 눌러 추가합니다. (건너뛰어도 됩니다)') + (out.join('') || '<p class="mut">검토할 항목이 없습니다.</p>');
}

// ---------- 4. 성적표 ----------
function report() {
  const st = stats(), common = S.config.subjects.filter((s) => s.group === 'common');
  const sels = S.config.subjects.filter((s) => s.group === 'select' && st.subjects[s.id].n > 0);
  const cols = showStd ? 4 : 1, rs = showStd ? 2 : 1;
  const head = `<tr><th rowspan="${rs}">이름</th><th rowspan="${rs}">캠프</th>${common.map((s) => `<th colspan="${cols}">${s.name}</th>`).join('')}${sels.map((s) => `<th rowspan="${rs}">${s.name}<br><small>선택</small></th>`).join('')}<th rowspan="${rs}">총점</th><th rowspan="${rs}">순위</th><th rowspan="${rs}">백분위</th><th rowspan="${rs}">비고</th></tr>`
    + (showStd ? `<tr>${common.map(() => '<th>원점수</th><th>표준</th><th>백분위</th><th>등급</th>').join('')}</tr>` : '');
  const rows = [...st.rows].sort((a, b) => a.res.rank - b.res.rank).map((r) => `<tr><td class="l">${esc(r.name)}</td><td>${r.res.camp || '-'}</td>
${common.map((s) => { const o = r.res.subjects[s.id]; return !o.taken ? `<td colspan="${cols}" class="mut">미응시</td>` : showStd ? `<td>${o.score}</td><td>${f1(o.std)}</td><td>${f1(o.pct)}</td><td>${o.grade}</td>` : `<td>${o.score}</td>`; }).join('')}
${sels.map((s) => `<td>${r.res.subjects[s.id].taken ? r.res.subjects[s.id].score : ''}</td>`).join('')}
<td><b>${r.res.total}</b></td><td>${r.res.rank}</td><td>${f1(r.res.pct)}</td>
<td class="bad">${r.res.pending ? `미채점 ${r.res.pending}` : ''} ${esc(r.res.flags.join(' / '))}</td></tr>`).join('');
  const who = sel && st.rows.find((r) => r.name === sel);
  return guide('④ 채점 결과입니다.', '총점 = 공통 3영역 합. 아래에서 이름을 고르면 문항별 정오표가 나옵니다.')
    + `<p><button data-act="exportXlsx">엑셀로 내보내기</button> <label><input type="checkbox" id="showStd" ${showStd ? 'checked' : ''}> 표준점수·백분위·등급도 보기</label></p>
<table>${head}${rows}</table>
<p>개인 상세: <select id="selStudent"><option value="">이름 선택</option>${st.rows.map((r) => `<option ${r.name === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></p>
${who ? S.config.subjects.map((s) => { const o = who.res.subjects[s.id]; if (!o.taken) return ''; return `<details open><summary>${s.name} ${o.score}/${o.max}</summary><table><tr>${Object.keys(o.detail).map((n) => `<th>${n}</th>`).join('')}</tr>
<tr>${Object.values(o.detail).map((d) => `<td class="${d.pending ? 'mut' : d.ok ? 'ok' : d.pts ? '' : 'bad'}">${d.pending ? '…' : d.pts}</td>`).join('')}</tr></table></details>`; }).join('') : ''}`;
}

// ---------- 5. 문항 분석 ----------
function items() {
  const st = stats(), s = subj(qSubj);
  const ss = S.config.subjects.map((x) => { const v = st.subjects[x.id]; return `<tr><td class="l">${x.name}</td><td>${v.n}</td><td>${f1(v.mean)}</td><td>${f1(v.sd)}</td><td>${v.max}</td><td>${v.min}</td></tr>`; }).join('');
  const camps = Object.entries(st.camps).map(([c, v]) => `<tr><td>${c}</td><td>${v.n}</td><td>${f1(v.sum / v.n)}</td></tr>`).join('');
  const bins = {}; st.totals.forEach((t) => { const b = Math.floor(t / 10) * 10; bins[b] = (bins[b] || 0) + 1; });
  const hist = Object.entries(bins).sort((a, b) => a[0] - b[0]).map(([b, c]) => `<tr><td>${b}~${+b + 9}</td><td class="l"><span class="bar" style="width:${c * 12}px"></span> ${c}</td></tr>`).join('');
  let qs = s.questions.map((q) => ({ q, v: st.questions[s.id][q.n] }));
  if (qSort) qs.sort((a, b) => b.v.wrongRate - a.v.wrongRate);
  const rows = qs.map(({ q, v }) => `<tr><td>${q.n}</td><td>${TYPES[q.type]}</td><td>${q.pts}</td><td>${esc(q.ans)}</td><td>${v.att}</td><td>${f1((1 - v.wrongRate) * 100)}%</td><td class="${v.wrongRate >= 0.6 ? 'bad' : ''}">${f1(v.wrongRate * 100)}%</td>
<td class="l">${Object.entries(v.dist).sort((a, b) => b[1].count - a[1].count).slice(0, 6).map(([k, d]) => `${q.type === 'short' || q.type === 'essay' ? esc(d.raw || k) : k}:${d.count}`).join(' · ')}</td></tr>`).join('');
  return guide('⑤ 문항·영역 통계입니다.', '오답률 60% 이상 문항은 빨간색입니다. 응답 분포는 "선택지:인원"입니다.')
    + `<p><button data-act="exportXlsx">엑셀로 내보내기</button></p>
<h3>문항별 분석 <select id="qSubj">${S.config.subjects.map((x) => `<option value="${x.id}" ${x.id === qSubj ? 'selected' : ''}>${x.name}</option>`).join('')}</select>
<button data-act="sort">${qSort ? '번호순으로' : '오답률순으로'}</button></h3>
<table><tr><th>번호</th><th>유형</th><th>배점</th><th>정답</th><th>응시</th><th>정답률</th><th>오답률</th><th>응답 분포</th></tr>${rows}</table>
<h3>영역별 통계</h3><table><tr><th>영역</th><th>응시</th><th>평균</th><th>표준편차</th><th>최고</th><th>최저</th></tr>${ss}</table>
<h3>캠프별 총점 평균</h3><table><tr><th>캠프</th><th>인원</th><th>평균</th></tr>${camps}</table>
<h3>총점 분포</h3><table>${hist}</table>`;
}

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => { e.preventDefault(); if (tab === 'import') importFiles([...e.dataTransfer.files]); });

// 단답 오답 검토: 표기를 ans(정답)/half(반만)/wrong(오답 확정) 목록에 추가 — 어느 쪽이든 검토 완료로 다시 안 뜸
function mark(d, field) {
  const q = subj(d.s).questions[d.n - 1], raw = d.raw.replace(/,/g, ' ');
  q[field] = q[field] ? `${q[field]},${raw}` : raw;
  op({ type: 'setConfig', config: S.config }); render();
}

// ---------- 6. 응시자 관리 ----------
const dupKey = (n) => n.replace(/[\s님]/g, '').toLowerCase();
function admin() {
  const st = stats(), cols = S.config.subjects.filter((s) => s.group === 'common' || st.subjects[s.id].n > 0);
  const keys = {}; st.rows.forEach((r) => (keys[dupKey(r.name)] = (keys[dupKey(r.name)] || 0) + 1));
  const campS = S.config.subjects.find((s) => s.camps);
  const campCell = (r) => { // 자동 판별 값을 기본으로 보여주고, 직접 고를 수 있게 함
    const ans = S.students[r.name]?.answers?.[campS.id] || {}, cur = S.campOf?.[r.name] || ''; // 캠프 영역을 안 풀었어도 지정 가능
    return `<select data-camp="${esc(r.name)}"><option value="">자동 (${Core.detectCamp(campS, ans).camp || '판별 불가'})</option>${Object.keys(campS.camps).map((c) => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}</select>${cur ? ' <span class="badge">수동</span>' : ''}`;
  };
  const rows = [...st.rows].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((r) => `<tr data-n="${esc(r.name)}"><td class="l">${esc(r.name)}</td><td>${campCell(r)}</td>
${cols.map((s) => `<td>${r.res.subjects[s.id].taken ? '✓' : ''}</td>`).join('')}
<td class="bad l">${keys[dupKey(r.name)] > 1 ? '<span class="badge">같은 사람?</span> ' : ''}${esc(r.res.flags.join(' / '))}</td>
<td><button data-act="del" data-name="${esc(r.name)}">삭제</button></td></tr>`).join('');
  const als = Object.entries(S.alias || {});
  return guide('⑥ 응시자 이름을 관리하세요.', '같은 사람이 이름을 여러 개로 냈다면 아래 칸에 `틀린이름=대표이름` 으로 적어 합칩니다. 캠프는 표에서 직접 고칠 수 있습니다.')
    + `<h3>이름 병합</h3>
<textarea id="mergeText" rows="4" cols="40" placeholder="한 줄에 하나씩&#10;빡통=김빡통&#10;김봉팔님=김봉팔"></textarea><br>
<button data-act="merge">병합</button>
<details class="help"><summary>병합 규칙</summary><ul><li><code>A=B</code> 는 A의 답안을 B로 옮기고 A는 없앱니다. B가 없는 이름이면 이름 변경이 됩니다.</li>
<li>같은 영역 답안이 A와 B 양쪽에 있으면 B의 것을 쓰고 A의 것은 버립니다.</li>
<li>병합한 이름은 기억해 두어서, 나중에 A 이름으로 엑셀을 다시 올려도 자동으로 B가 됩니다.</li></ul></details>
${als.length ? `<p class="mut">병합해 둔 이름: ${als.map(([k, v]) => `${esc(k)} → ${esc(v)}`).join(' · ')}</p>` : ''}
<h3>총 응시자 ${st.rows.length}명</h3>
<p><input id="adminQ" placeholder="이름 검색"></p>
<table id="adminTable"><tr><th>이름</th><th>캠프</th>${cols.map((s) => `<th>${s.name}</th>`).join('')}<th>비고</th><th></th></tr>${rows}</table>`;
}
document.addEventListener('input', (e) => {
  if (e.target.id !== 'adminQ') return;
  document.querySelectorAll('#adminTable tr[data-n]').forEach((tr) => (tr.hidden = !tr.dataset.n.includes(e.target.value.trim())));
});

// ---------- 동작 ----------
const ACT = {
  cfgSave: () => download('정답설정.json', new Blob([JSON.stringify(S.config, null, 1)], { type: 'application/json' })),
  del: (d) => { delete S.students[d.name]; delete S.manual[d.name]; delete S.campOf?.[d.name]; op({ type: 'delStudent', name: d.name }); render(); },
  clearAll: () => { if (confirm('응시자 데이터를 모두 삭제할까요?')) { S.students = {}; S.manual = {}; S.alias = {}; S.campOf = {}; op({ type: 'clearAll' }); render(); } },
  merge: async () => {
    const pairs = [];
    for (const line of $('#mergeText').value.split('\n')) {
      const i = line.indexOf('=');
      if (i < 0) continue;
      const from = line.slice(0, i).trim().replace(/\s+/g, ' '), to0 = line.slice(i + 1).trim().replace(/\s+/g, ' ');
      if (from && to0 && from !== to0 && from.length <= 60 && to0.length <= 60) pairs.push([from, to0]);
    }
    if (!pairs.length) return alert('병합할 줄이 없습니다. 예) 빡통=김빡통');
    const lines = pairs.map(([f, t]) => {
      const lost = Object.keys(S.students[f]?.answers || {}).filter((sid) => S.students[S.alias?.[t] || t]?.answers?.[sid]).map((sid) => subj(sid)?.name);
      return `${f} → ${t}${S.students[f] ? '' : ' (현재 없는 이름: 별칭만 등록)'}${lost.length ? ` [${lost.join(', ')} 답안은 ${t}의 것 유지]` : ''}`;
    });
    if (!confirm(`${pairs.length}건을 병합할까요?\n\n${lines.join('\n')}`)) return;
    for (const [from, to0] of pairs) { // 순서대로 하나씩 (앞 줄 병합 결과가 뒷 줄의 대표 이름에 반영되도록)
      const to = S.alias?.[to0] || to0;
      if (from === to) continue;
      Core.mergeInto(S, from, to); await op({ type: 'merge', from, to });
    }
    render();
  },
  half: (d) => mark(d, 'half'),
  wrong: (d) => mark(d, 'wrong'),
  accept: (d) => mark(d, 'ans'),
  sort: () => { qSort = !qSort; render(); },
  exportXlsx: () => {
    const st = stats(), wb = XLSX.utils.book_new();
    const rep = st.rows.sort((a, b) => a.res.rank - b.res.rank).map((r) => {
      const o = { 이름: r.name, 캠프: r.res.camp || '' };
      for (const s of S.config.subjects) { const x = r.res.subjects[s.id]; if (x.taken) { o[s.name] = x.score; o[s.name + ' 표준점수'] = +f1(x.std); o[s.name + ' 백분위'] = +f1(x.pct); o[s.name + ' 등급'] = x.grade; } }
      return { ...o, 총점: r.res.total, 순위: r.res.rank, 백분위: +f1(r.res.pct), 경고: r.res.flags.join(' / ') };
    });
    const qrows = S.config.subjects.flatMap((s) => s.questions.map((q) => { const v = st.questions[s.id][q.n]; return { 영역: s.name, 번호: q.n, 유형: TYPES[q.type], 배점: q.pts, 정답: q.ans, 응시: v.att, 정답률: +((1 - v.wrongRate) * 100).toFixed(1), 오답률: +(v.wrongRate * 100).toFixed(1) }; }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rep), '성적표');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qrows), '문항분석');
    XLSX.writeFile(wb, '에바수능_결과.xlsx');
  },
};
render(); netBadge(); sync(true);
setInterval(() => document.visibilityState === 'visible' && sync(), 30000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync());
