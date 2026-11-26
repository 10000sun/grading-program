# 에바 수능 채점기

정적 웹 + Cloudflare Workers(정적 에셋 + D1)로 동작합니다. 접속한 모든 사람이 같은 데이터를 봅니다(로그인 없음).

## Cloudflare 배포 (Workers 빌드)
1. Cloudflare 대시보드 → **Workers & Pages → Create → Import a repository**로 이 저장소를 연결합니다.
   Build command는 비우고 Deploy command는 기본값 `npx wrangler deploy` 그대로 둡니다.
2. 배포 때 `wrangler.jsonc`의 D1(`DB`)이 자동으로 만들어져 연결됩니다.
   자동 생성이 실패하면 **Storage & Databases → D1**에서 DB를 만들고, 그 `database_id`를 `wrangler.jsonc`의 `d1_databases`에 추가해 푸시합니다.
3. 배포가 끝나면 `https://grading-program.<계정>.workers.dev`로 접속합니다. 상단에 `🟢 서버 연동`이 보이면 정상입니다.

`⚠ 서버 연결 없음`이면 이 브라우저에만 저장됩니다(GitHub Pages, 파일 열기 등).

사이트 파일은 `docs/`, API는 `src/worker.js` → `src/api.js`입니다.

## 로컬 개발
```bash
node test/dev-server.mjs   # http://localhost:8788 (D1 대신 메모리 SQLite)
node test/core.test.js && node test/api.test.mjs
```

## 주의
- 정답 설정은 서버에 처음 저장될 때만 `docs/default-config.js` 값으로 시작합니다. 이후 코드의 기본 정답을 고쳐도 서버에는 반영되지 않으며, 정답 세팅 탭의 "정답을 기본값으로 되돌리기"를 누르면 그때 덮어씁니다(수정·인정 처리한 내용은 사라짐).
- 쓰기 인증이 없어서 접속자 누구나 응시자 데이터와 정답 설정을 바꾸거나 지울 수 있습니다.
- Functions 무료 한도는 하루 10만 요청입니다. 화면이 열려 있으면 30초마다 버전 확인 요청을 보냅니다.

## github.io에서도 같은 데이터 쓰기
`docs/` 폴더는 GitHub Pages(Settings → Pages → Source: `main` / `/docs`)로도 그대로 배포할 수 있습니다.
`docs/app.js`의 `API_BASE`를 실제 workers.dev 주소로 바꿔 두면 github.io에서 열어도 Cloudflare 서버의 같은 데이터를 봅니다.
