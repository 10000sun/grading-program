// 결과 엑셀(.xlsx) 생성: ExcelJS로 색·병합·고정 틀을 적용. DOM 의존 없음 (브라우저/노드 공용).
(function (root) {
  const PAL = ['FF2559A8', 'FF1E7A52', 'FFB45309', 'FF6F42C1', 'FFB0306F', 'FF0B7285']; // 영역별 대표색 (화면과 같은 순서)
  const INK = 'FF1F2A44', GRID = 'FFD0D7E2', ZEBRA = 'FFF5F8FC', GRAY = 'FFEDEFF3', WHITE = 'FFFFFFFF';
  const GOOD = ['FFC6EFCE', 'FF006100'], MID = ['FFFFEB9C', 'FF7F6000'], BAD = ['FFFFC7CE', 'FF9C0006'], BLUE = ['FFDDEBF7', 'FF1F4E79']; // [배경, 글자]
  const GRADE = { 1: GOOD, 2: GOOD, 3: BLUE, 4: BLUE, 5: MID, 6: MID, 7: BAD, 8: BAD, 9: BAD };
  const MEDAL = { 1: 'FFFFD966', 2: 'FFD9D9D9', 3: 'FFF4B183' };

  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const thin = { style: 'thin', color: { argb: GRID } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const tint = (argb, t) => 'FF' + [2, 4, 6].map((i) => Math.round(parseInt(argb.slice(i, i + 2), 16) * (1 - t) + 255 * t).toString(16).padStart(2, '0')).join('').toUpperCase();
  const rate = (p) => (p >= 80 ? GOOD : p >= 50 ? MID : BAD); // 정답률이 높을수록 초록

  function put(ws, r, c, value, o = {}) {
    const cell = ws.getCell(r, c);
    cell.value = value;
    cell.font = { name: 'Malgun Gothic', size: o.size || 10, bold: !!o.bold, italic: !!o.italic, color: { argb: o.fg || 'FF222222' } };
    if (o.bg) cell.fill = fill(o.bg);
    cell.alignment = { horizontal: o.align || 'center', vertical: 'middle', wrapText: !!o.wrap };
    if (o.fmt) cell.numFmt = o.fmt;
    cell.border = o.left ? { ...box, left: { style: 'medium', color: { argb: o.left } } } : box;
    return cell;
  }
  const band = (ws, r, c1, c2, text, bg, size = 12) => { // 가로로 병합한 색 띠 (제목 줄)
    ws.mergeCells(r, c1, r, c2);
    put(ws, r, c1, text, { bg, fg: WHITE, bold: true, size, align: 'left' });
    ws.getRow(r).height = size + 14;
  };
  const sheetName = (wb, n) => { let s = String(n).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || '시트', k = 2; while (wb.getWorksheet(s)) s = `${s.slice(0, 28)}_${k++}`; return s; };
  const n1 = (x) => Math.round(x * 10) / 10;

  function buildReport(ExcelJS, { cfg, st, TYPES, date }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = '에바 수능 채점기'; wb.created = new Date();
    const subs = cfg.subjects, colorOf = (s) => PAL[subs.indexOf(s) % PAL.length];
    const takers = (s) => st.rows.filter((r) => r.res.subjects[s.id].taken).sort((a, b) => a.res.subjects[s.id].rank - b.res.subjects[s.id].rank || a.name.localeCompare(b.name, 'ko'));
    const gradeCount = (s, g) => takers(s).filter((r) => r.res.subjects[s.id].grade === g).length;
    const shown = subs.filter((s) => s.group === 'common' || st.subjects[s.id].n > 0);
    const ranked = [...st.rows].sort((a, b) => (a.res.rank ?? 1e9) - (b.res.rank ?? 1e9) || a.name.localeCompare(b.name, 'ko'));

    // ---------- 요약 ----------
    let ws = wb.addWorksheet('요약', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 18 }, { width: 8 }, ...Array(14).fill({ width: 9 })];
    band(ws, 1, 1, 16, '에바 수능 채점 결과', INK, 20);
    ws.mergeCells(2, 1, 2, 16);
    put(ws, 2, 1, `${date} 기준 · 총 응시자 ${st.rows.length}명 · 총점 = 공통 3영역 합`, { align: 'left', fg: 'FF555555', border: false });
    let r = 4;
    band(ws, r++, 1, 16, '영역별 통계', INK, 12);
    ['영역', '구분', '응시', '평균', '표준편차', '최고', '최저', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => `${g}등급`)].forEach((h, i) => put(ws, r, i + 1, h, { bg: INK, fg: WHITE, bold: true }));
    r++;
    subs.forEach((s, k) => {
      const v = st.subjects[s.id], z = k % 2 ? ZEBRA : WHITE;
      put(ws, r, 1, s.name, { bg: colorOf(s), fg: WHITE, bold: true });
      [s.group === 'common' ? '공통' : '선택', v.n, n1(v.mean), n1(v.sd), v.max, v.min].forEach((x, i) => put(ws, r, i + 2, x, { bg: z, fmt: i >= 2 ? '0.0' : undefined }));
      for (let g = 1; g <= 9; g++) { const c = gradeCount(s, g); put(ws, r, g + 7, c, c ? { bg: GRADE[g][0], fg: GRADE[g][1], bold: true } : { bg: z, fg: 'FFAAAAAA' }); }
      r++;
    });
    r++;
    band(ws, r++, 1, 3, '캠프별 총점 평균', INK, 12);
    ['캠프', '인원', '평균'].forEach((h, i) => put(ws, r, i + 1, h, { bg: INK, fg: WHITE, bold: true }));
    r++;
    Object.entries(st.camps).forEach(([c, v], k) => { [c, v.n, n1(v.sum / v.n)].forEach((x, i) => put(ws, r, i + 1, x, { bg: k % 2 ? ZEBRA : WHITE, bold: i === 0, fmt: i === 2 ? '0.0' : undefined })); r++; });
    r++;
    band(ws, r++, 1, 16, '총점 분포 (10점 구간)', INK, 12);
    const bins = {}; st.totals.forEach((t) => { const b = Math.floor(t / 10) * 10; bins[b] = (bins[b] || 0) + 1; });
    Object.entries(bins).sort((a, b) => a[0] - b[0]).forEach(([b, c]) => { put(ws, r, 1, `${b} ~ ${+b + 9}`, { bg: ZEBRA, bold: true }); put(ws, r, 2, c, { bg: ZEBRA }); ws.mergeCells(r, 3, r, 16); put(ws, r, 3, '█'.repeat(c), { align: 'left', fg: PAL[0], border: false }); r++; });

    // ---------- 성적표 (전체, 영역별 묶음) ----------
    ws = wb.addWorksheet('성적표', { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
    const last = 3 + shown.length * 4 + 3;
    ws.columns = [{ width: 6 }, { width: 14 }, { width: 8 }, ...shown.flatMap(() => [{ width: 8 }, { width: 8 }, { width: 8 }, { width: 6 }]), { width: 9 }, { width: 9 }, { width: 30 }];
    ['순위', '이름', '캠프'].forEach((h, i) => { ws.mergeCells(1, i + 1, 2, i + 1); put(ws, 1, i + 1, h, { bg: INK, fg: WHITE, bold: true }); put(ws, 2, i + 1, null, { bg: INK }); });
    shown.forEach((s, k) => {
      const c0 = 4 + k * 4, col = colorOf(s);
      ws.mergeCells(1, c0, 1, c0 + 3);
      put(ws, 1, c0, s.group === 'select' ? `${s.name} (선택)` : s.name, { bg: col, fg: WHITE, bold: true, size: 11, left: col });
      ['원점수', '표준점수', '백분위', '등급'].forEach((h, i) => put(ws, 2, c0 + i, h, { bg: tint(col, 0.25), fg: INK, bold: true, left: i === 0 ? col : undefined }));
    });
    [['총점', last - 2], ['총점 백분위', last - 1], ['비고', last]].forEach(([h, c]) => { ws.mergeCells(1, c, 2, c); put(ws, 1, c, h, { bg: INK, fg: WHITE, bold: true }); put(ws, 2, c, null, { bg: INK }); });
    ws.getRow(1).height = 24; ws.getRow(2).height = 20;
    ranked.forEach((row, k) => {
      const rr = k + 3, z = k % 2 ? ZEBRA : WHITE, x = row.res;
      put(ws, rr, 1, x.rank ?? '-', x.rank <= 3 ? { bg: MEDAL[x.rank], bold: true } : { bg: z });
      put(ws, rr, 2, row.name, { bg: z, bold: true, align: 'left' });
      put(ws, rr, 3, x.camp || '-', { bg: z });
      shown.forEach((s, j) => {
        const c0 = 4 + j * 4, o = x.subjects[s.id], col = colorOf(s);
        if (!o.taken) { ws.mergeCells(rr, c0, rr, c0 + 3); put(ws, rr, c0, '미응시', { bg: GRAY, fg: 'FF999999', italic: true, left: col }); return; }
        put(ws, rr, c0, o.score, { bg: z, bold: true, left: col });
        put(ws, rr, c0 + 1, n1(o.std), { bg: z, fmt: '0.0' });
        put(ws, rr, c0 + 2, n1(o.pct), { bg: z, fmt: '0.0' });
        put(ws, rr, c0 + 3, o.grade, { bg: GRADE[o.grade][0], fg: GRADE[o.grade][1], bold: true });
      });
      put(ws, rr, last - 2, x.total, { bg: tint(PAL[0], 0.85), bold: true, size: 11, });
      put(ws, rr, last - 1, x.pct == null ? '-' : n1(x.pct), { bg: z, fmt: '0.0' });
      const note = [x.pending ? `미채점 ${x.pending}문항` : '', ...x.flags].filter(Boolean).join(' / ');
      put(ws, rr, last, note, note ? { bg: BAD[0], fg: BAD[1], align: 'left', wrap: true } : { bg: z });
    });
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: last } };

    // ---------- 영역별 시트 ----------
    subs.forEach((s) => {
      const list = takers(s), v = st.subjects[s.id], col = colorOf(s), qs = s.questions;
      if (!list.length && s.group === 'select') return;
      ws = wb.addWorksheet(sheetName(wb, s.name), { views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }] });
      const fixed = s.camps ? 8 : 7; // 순위, 이름, [캠프], 원점수, 표준점수, 백분위, 등급, 미채점
      ws.columns = [{ width: 6 }, { width: 14 }, ...(s.camps ? [{ width: 8 }] : []), { width: 10 }, { width: 9 }, { width: 9 }, { width: 6 }, { width: 8 }, ...qs.map(() => ({ width: 7 }))];
      const lastC = fixed + qs.length;
      band(ws, 1, 1, lastC, `${s.name} 영역 (${s.group === 'common' ? '공통' : '선택'}) · ${qs.length}문항`, col, 16);
      ws.mergeCells(2, 1, 2, lastC);
      put(ws, 2, 1, `응시 ${v.n}명 · 평균 ${n1(v.mean)} · 표준편차 ${n1(v.sd)} · 최고 ${v.max} · 최저 ${v.min}`, { align: 'left', bold: true, bg: tint(col, 0.85), border: false });
      ws.mergeCells(3, 1, 3, lastC);
      put(ws, 3, 1, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => `${g}등급 ${gradeCount(s, g)}명`).join('  ·  '), { align: 'left', bg: tint(col, 0.93), border: false });
      const head = ['순위', '이름', ...(s.camps ? ['캠프'] : []), '원점수', '표준점수', '백분위', '등급', '미채점'];
      head.forEach((h, i) => put(ws, 5, i + 1, h, { bg: col, fg: WHITE, bold: true }));
      qs.forEach((q, i) => put(ws, 5, fixed + 1 + i, `${q.n}번\n(${q.pts})`, { bg: tint(col, 0.25), fg: INK, bold: true, wrap: true, size: 9 }));
      ws.getRow(5).height = 30;
      list.forEach((row, k) => {
        const rr = 6 + k, o = row.res.subjects[s.id], z = k % 2 ? ZEBRA : WHITE;
        put(ws, rr, 1, o.rank, o.rank <= 3 ? { bg: MEDAL[o.rank], bold: true } : { bg: z });
        put(ws, rr, 2, row.name, { bg: z, bold: true, align: 'left' });
        let c = 3;
        if (s.camps) put(ws, rr, c++, row.res.camp || '-', { bg: z });
        put(ws, rr, c++, o.score, { bg: z, bold: true, });
        put(ws, rr, c++, n1(o.std), { bg: z, fmt: '0.0' });
        put(ws, rr, c++, n1(o.pct), { bg: z, fmt: '0.0' });
        put(ws, rr, c++, o.grade, { bg: GRADE[o.grade][0], fg: GRADE[o.grade][1], bold: true });
        put(ws, rr, c++, o.pending || '', o.pending ? { bg: BAD[0], fg: BAD[1] } : { bg: z });
        qs.forEach((q, i) => {
          const d = o.detail[q.n]; // 캠프 영역에서 본인 캠프가 아닌 문항은 없음
          if (!d) put(ws, rr, fixed + 1 + i, '', { bg: GRAY });
          else if (d.pending) put(ws, rr, fixed + 1 + i, '…', { bg: GRAY, fg: 'FF777777' });
          else { const t = d.ok ? GOOD : d.pts > 0 ? MID : BAD; put(ws, rr, fixed + 1 + i, d.pts, { bg: t[0], fg: t[1], }); }
        });
      });
      const foot = 6 + list.length + 1; // 문항 통계: 응시/정답률/오답률
      [['응시 인원', (x) => x.att, null], ['정답률 (%)', (x) => n1((1 - x.wrongRate) * 100), true], ['오답률 (%)', (x) => n1(x.wrongRate * 100), false]].forEach(([label, fn, heat], i) => {
        ws.mergeCells(foot + i, 1, foot + i, fixed);
        put(ws, foot + i, 1, label, { bg: INK, fg: WHITE, bold: true, align: 'right' });
        qs.forEach((q, j) => {
          const x = st.questions[s.id][q.n], val = fn(x);
          const t = heat === null || !x.att ? null : rate(heat ? val : 100 - val);
          put(ws, foot + i, fixed + 1 + j, x.att ? val : '', t ? { bg: t[0], fg: t[1], bold: true, fmt: '0.0' } : { bg: GRAY });
        });
      });
    });

    // ---------- 문항분석 (전체) ----------
    ws = wb.addWorksheet('문항분석', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [{ width: 18 }, { width: 6 }, { width: 11 }, { width: 6 }, { width: 24 }, { width: 8 }, { width: 9 }, { width: 9 }, { width: 50 }];
    ['영역', '번호', '유형', '배점', '정답', '응시', '정답률(%)', '오답률(%)', '응답 분포 (상위)'].forEach((h, i) => put(ws, 1, i + 1, h, { bg: INK, fg: WHITE, bold: true }));
    ws.getRow(1).height = 22;
    let q = 2;
    subs.forEach((s) => {
      const col = colorOf(s);
      s.questions.forEach((qq, k) => {
        const x = st.questions[s.id][qq.n], z = k % 2 ? ZEBRA : WHITE;
        const dist = Object.entries(x.dist).sort((a, b) => b[1].count - a[1].count).slice(0, 6).map(([key, d]) => `${qq.type === 'short' || qq.type === 'essay' ? d.raw || key : key}:${d.count}`).join('  ·  ');
        put(ws, q, 1, s.name, { bg: col, fg: WHITE, bold: true });
        put(ws, q, 2, qq.n, { bg: z });
        put(ws, q, 3, TYPES[qq.type] || qq.type, { bg: z });
        put(ws, q, 4, qq.pts, { bg: z });
        put(ws, q, 5, qq.ans || '', { bg: z, align: 'left', wrap: true });
        put(ws, q, 6, x.att, { bg: z });
        const t = x.att ? rate((1 - x.wrongRate) * 100) : null;
        put(ws, q, 7, x.att ? n1((1 - x.wrongRate) * 100) : '', t ? { bg: t[0], fg: t[1], bold: true, fmt: '0.0' } : { bg: z });
        put(ws, q, 8, x.att ? n1(x.wrongRate * 100) : '', t ? { bg: t[0], fg: t[1], bold: true, fmt: '0.0' } : { bg: z });
        put(ws, q, 9, dist, { bg: z, align: 'left' });
        q++;
      });
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };
    wb.worksheets.forEach((w) => { w.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }; }); // 인쇄 시 가로 한 쪽에 맞춤
    return wb;
  }

  root.buildReport = buildReport;
  if (typeof module !== 'undefined') module.exports = { buildReport };
})(typeof window !== 'undefined' ? window : globalThis);
