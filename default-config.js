// 문제지 PDF 기준 초기값. 유형: m=객관식 x=복수선택 s=단답 e=서술(수동채점). 정답은 웹 화면에서 입력.
(function (root) {
  const T = { m: 'mc', x: 'multi', s: 'short', e: 'essay' };
  const rep = (v, n) => Array(n).fill(v);
  const mk = (id, name, alias, group, types, pts, extra) => ({
    id, name, alias, group, ...extra,
    questions: [...types].map((t, i) => ({ n: i + 1, type: T[t], pts: pts[i], ans: '' })),
  });
  const history = rep(2, 30); history[8] = 3; history[22] = 3; // 표시 없는 문항은 2점으로 가정 (정답 화면에서 수정 가능)
  root.DEFAULT_CONFIG = {
    subjects: [
      mk('history', '역사', ['에바스역사'], 'common', 'm'.repeat(24) + 'ee' + 'm' + 'sss', history),
      mk('content', '콘텐츠', ['컨텐츠'], 'common', 'mmmmmmm' + 'xx' + 'mmmm' + 'x' + 'm' + 'x' + 's' + 'e' + 's' + 'e',
        [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 6, 6, 6, 6, 6, 5, 7, 5, 8]),
      mk('camp', '캠프', [], 'common', 'm'.repeat(6) + 'x' + 'm'.repeat(6) + 's' + 'mmmm' + 'ss' + 'mmmm' + 's', rep(4, 25),
        { camps: { 여백: [1, 5], 나래: [6, 10], 악동: [11, 15] }, common: [16, 25] }),
      mk('game', '방구석 게이머', ['게임', '게이머'], 'select', 'm'.repeat(9) + 'ss' + 'ee' + 'sss',
        [4, 5, 4, 4, 4, 6, 4, 6, 8, 7, 9, 9, 8, 7, 8, 8]),
      mk('busk', '방구석 버스커', ['버스킹', '버스커'], 'select', 'mmmmm' + 's' + 'm' + 'sss' + 'mmm' + 'x' + 's' + 'x' + 's',
        [5, 5, 5, 7, 5, 6, 4, 6, 4, 6, 7, 8, 6, 7, 7, 6, 6]),
      mk('art', '방구석 그림쟁이', ['그림쟁이', '그림'], 'select', 'm'.repeat(11) + 'e' + 'sss',
        [5, 7, 6, 5, 7, 8, 7, 6, 8, 7, 7, 7, 7, 6, 7]),
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
