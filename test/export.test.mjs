import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../docs/default-config.js');
const C = require('../docs/core.js');
const ExcelJS = require('../docs/exceljs.min.js');
const { buildReport } = require('../docs/export.js');

const cfg = structuredClone(globalThis.DEFAULT_CONFIG);
for (const s of cfg.subjects) s.questions.forEach((q) => { if (q.type === 'mc') q.ans = '1'; }); // 정답 일부 지정
const camp = cfg.subjects.find((s) => s.camps);
const students = {
  '김하나': { answers: { history: { 1: '1', 2: '1' }, camp: { 1: '1', 16: '3' } } },
  '이둘': { answers: { history: { 1: '2' }, camp: { 6: '1', 16: '3' } } },
  '박셋(선택만)': { answers: { art: { 1: '5', 12: '서술' } } },
};
const st = C.analyze(cfg, students, {}, {});
const wb = buildReport(ExcelJS, { cfg, st, TYPES: { mc: '객관식', multi: '복수선택', short: '단답', essay: '서술(수동)' }, date: '2026. 11. 26.' });

// 파일로 썼다가 다시 읽어도 열려야 함
const back = new ExcelJS.Workbook();
await back.xlsx.load(await wb.xlsx.writeBuffer());
const names = back.worksheets.map((w) => w.name);
for (const n of ['요약', '성적표', '역사', '콘텐츠', '캠프', '문항분석']) assert.ok(names.includes(n), n + ' 시트 없음: ' + names);
assert.ok(names.includes('방구석 그림쟁이') && !names.includes('방구석 게이머')); // 응시자 없는 선택영역 시트는 만들지 않음

const rank = back.getWorksheet('성적표');
assert.equal(rank.getCell(3, 2).value, '김하나'); // 1등이 첫 행
assert.equal(rank.getCell(1, 4).fill.fgColor.argb, 'FF2559A8'); // 역사 묶음 헤더 색
assert.equal(rank.views[0].xSplit, 3);
const hist = back.getWorksheet('역사');
assert.equal(hist.getCell(6, 2).value, '김하나');
assert.equal(hist.getCell(6, 8 + 1).value, 2); // 문항 1번 득점
const art = back.getWorksheet('방구석 그림쟁이');
assert.ok(art.getCell(6, 2).value === '박셋(선택만)');
console.log('export ok:', names.join(', '));
