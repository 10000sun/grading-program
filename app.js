const KEY = 'evaSuneung.v1';
const TYPES = { mc: '객관식', multi: '복수선택', short: '단답', essay: '서술(수동)' };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

let S = load(), tab = 'setup', log = [], sel = '', qSubj = 'history', qSort = false, showStd = false;
function load() {
  try { const j = JSON.parse(localStorage.getItem(KEY)); if (j?.config) return j; } catch {}
  return { config: structuredClone(DEFAULT_CONFIG), students: {}, manual: {} };
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const subj = (id) => S.config.subjects.find((s) => s.id === id);
const download = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); };
const stats = () => Core.analyze(S.config, S.students, S.manual);

// ---------- 탭 ----------
const TABS = [['setup', '1. 정답 세팅'], ['import', '2. 답안 업로드'], ['manual', '3. 수동 채점'], ['report', '4. 성적표'], ['items', '5. 문항 분석']];
function render() {
  $('#nav').innerHTML = TABS.map(([k, v]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('');
  $('#main').innerHTML = { setup, import: importTab, manual, report, items }[tab]();
  $('#total').textContent = `총 응시자 ${Object.keys(S.students).length}명`;
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
    save(); if (d.f === 'type') render();
  } else if (d.mp) { // 수동 점수
    const [s, n, name] = JSON.parse(d.mp);
    const m = ((S.manual[name] ||= {})[s] ||= {});
    if (e.target.value === '') delete m[n]; else m[n] = Number(e.target.value);
    save();
  } else if (e.target.id === 'files') importFiles([...e.target.files]);
  else if (e.target.id === 'cfgfile') e.target.files[0].text().then((t) => { S.config = JSON.parse(t); save(); render(); });
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
 placeholder="${{ mc: '예) 3', multi: '예) 1,3', short: '예) 정답,다른표기' }[q.type] || ''}"></td></tr>`;
    }).join('');
    return `<details><summary>${s.name} <span class="mut">${s.group === 'common' ? '공통' : '선택'} · ${s.questions.length}문항</span>
 ${missing ? `<span class="badge bad">정답 ${missing}개 비어 있음</span>` : '<span class="badge ok">✓ 입력 완료</span>'}</summary>
<table><tr><th>번호</th><th>구분</th><th>유형</th><th>배점</th><th>정답</th></tr>${rows}</table></details>`;
  }).join('');
  return guide('① 정답을 입력하세요.', '영역을 눌러 펼친 뒤 정답칸에 적습니다. 자동 저장됩니다.')
    + `<details class="help"><summary>입력 방법 보기</summary><ul>
<li>객관식: <code>3</code> (숫자 1~5)</li><li>복수선택: <code>1,3</code> (순서 상관없음)</li>
<li>단답: <code>정답,다른표기</code> (쉼표로 인정 답 여러 개) · 두 칸짜리 답은 <code>철수 영희</code>처럼 공백으로</li>
<li>서술(수동): 정답 없이 ③ 수동 채점 탭에서 점수를 직접 줍니다</li></ul></details>
${body}<p><button data-act="cfgSave">정답 파일로 저장</button> <label class="btn">정답 파일 불러오기 <input type="file" id="cfgfile" accept=".json" hidden></label></p>`;
}

// ---------- 2. 업로드 ----------
const num = (c) => { const m = String(c).trim().match(/^(\d{1,2})\s*(번|[.)]|$)/); return m ? +m[1] : null; };
function parseSheet(ws) { // 세로(번호|답) 또는 가로(헤더 번호 + 마지막 행 답) 두 배치를 자동 인식
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const out = {}, vert = rows.filter((r) => num(r[0]) !== null);
  if (vert.length >= 3 && vert.length >= rows.length / 2) { vert.forEach((r) => (out[num(r[0])] = r[1])); return out; }
  const hi = rows.findIndex((r) => r.filter((c) => num(c) !== null).length >= 3);
  if (hi >= 0 && rows.length > hi + 1) rows[hi].forEach((c, i) => { const n = num(c); if (n !== null) out[n] = rows[rows.length - 1][i]; });
  return out;
}
async function importFiles(files) {
  const def = $('#defSubj')?.value;
  for (const f of files) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const name = f.name.replace(/\.[^.]+$/, '');
      const st = (S.students[name] ||= { answers: {} });
      for (const sn of wb.SheetNames) {
        const s = S.config.subjects.find((x) => [x.name, ...x.alias].some((a) => sn.includes(a))) || (wb.SheetNames.length === 1 && def ? subj(def) : null);
        if (!s) { log.push(`${f.name} / ${sn}: 영역을 인식하지 못했습니다 (시트 이름에 영역명 포함 또는 아래 기본 영역 선택)`); continue; }
        const a = parseSheet(wb.Sheets[sn]);
        if (!Object.keys(a).length) { log.push(`${f.name} / ${sn}: 답안을 읽지 못했습니다`); continue; }
        st.answers[s.id] = a;
        log.push(`${name}: ${s.name} ${Object.keys(a).length}문항 읽음`);
      }
    } catch (err) { log.push(`${f.name}: 오류 ${err.message}`); }
  }
  save(); render();
}
function importTab() {
  const st = stats(), cols = S.config.subjects.filter((s) => s.group === 'common' || st.subjects[s.id].n > 0);
  const rows = st.rows.map((r) => `<tr><td class="l">${esc(r.name)}</td><td>${r.res.camp || '-'}</td>
${cols.map((s) => `<td>${r.res.subjects[s.id].taken ? '✓' : ''}</td>`).join('')}
<td class="bad l">${esc(r.res.flags.join(' / '))}</td><td><button data-act="del" data-name="${esc(r.name)}">삭제</button></td></tr>`).join('');
  return guide('② 응시자 엑셀을 올리세요.', '파일 이름 = 응시자 이름, 시트 이름 = 영역(역사·콘텐츠·캠프)')
    + `<label class="drop">📂 엑셀 파일을 여기에 끌어다 놓거나 클릭해서 선택 (여러 개 가능)<input type="file" id="files" multiple accept=".xlsx,.xls,.csv" hidden></label>
<details class="help"><summary>시트 이름으로 영역이 인식되지 않을 때</summary>시트가 1개인 파일의 영역을 직접 지정:
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
  for (const s of S.config.subjects) for (const q of s.questions) {
    if (q.type === 'essay') {
      const rows = st.rows.map((r) => ({ r, d: r.res.subjects[s.id].detail[q.n] })).filter((x) => x.d && !Core.blank(x.d.raw));
      out.push(`<details><summary>${s.name} ${q.n}번 (서술, ${q.pts}점) <span class="mut">${rows.filter((x) => x.d.pending).length}건 미채점</span></summary>
<table>${rows.map(({ r, d }) => `<tr><td class="l">${esc(r.name)}</td><td class="l" style="white-space:normal;max-width:520px">${esc(d.raw)}</td>
<td><input class="n" type="number" min="0" max="${q.pts}" step="0.5" value="${S.manual[r.name]?.[s.id]?.[q.n] ?? ''}" data-mp='${esc(JSON.stringify([s.id, q.n, r.name]))}'> / ${q.pts}</td></tr>`).join('')}</table></details>`);
    } else if (q.type === 'short') {
      const wrong = Object.entries(st.questions[s.id][q.n].dist).filter(([k, v]) => !v.ok && k !== '무응답').sort((a, b) => b[1].count - a[1].count);
      if (wrong.length) out.push(`<details><summary>${s.name} ${q.n}번 단답 오답 검토 <span class="mut">(${wrong.length}종)</span></summary><table>
${wrong.map(([, v]) => `<tr><td class="l">${esc(v.raw)}</td><td>${v.count}명</td><td><button data-act="accept" data-s="${s.id}" data-n="${q.n}" data-raw="${esc(v.raw)}">정답 인정</button></td></tr>`).join('')}</table></details>`);
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
<tr>${Object.values(o.detail).map((d) => `<td class="${d.pending ? 'mut' : d.ok ? 'ok' : 'bad'}">${d.pending ? '…' : d.pts}</td>`).join('')}</tr></table></details>`; }).join('') : ''}`;
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

// ---------- 동작 ----------
const ACT = {
  cfgSave: () => download('정답설정.json', new Blob([JSON.stringify(S.config, null, 1)], { type: 'application/json' })),
  del: (d) => { delete S.students[d.name]; save(); render(); },
  clearAll: () => { if (confirm('응시자 데이터를 모두 삭제할까요?')) { S.students = {}; S.manual = {}; save(); render(); } },
  accept: (d) => { const q = subj(d.s).questions[d.n - 1]; const raw = d.raw.replace(/,/g, ' '); q.ans = q.ans ? `${q.ans},${raw}` : raw; save(); render(); },
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
render();
