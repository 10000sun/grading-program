# 에바 수능 채점기

정적 웹 + Cloudflare Pages Functions(D1)로 동작합니다. 접속한 모든 사람이 같은 데이터를 봅니다(로그인 없음).

## Cloudflare 배포 (최초 1회)
1. Cloudflare 대시보드 → **Workers & Pages → Create → Pages → Connect to Git**에서 이 저장소를 선택합니다.
   Production branch는 `main`, Build command는 비움, Build output directory는 `/` 로 둡니다.
2. **Storage & Databases → D1 SQL database**에서 데이터베이스를 하나 만듭니다(이름 자유).
3. Pages 프로젝트 → **Settings → Bindings → Add → D1 database**에서 변수 이름을 `DB`, 방금 만든 DB를 선택하고 저장합니다.
4. **Deployments**에서 최신 배포를 다시 배포(Retry/Redeploy)합니다. 테이블은 첫 요청 때 자동 생성됩니다.

접속하면 상단에 `🟢 서버 연동`이 보이면 정상입니다. `⚠ 서버 연결 없음`이면 이 브라우저에만 저장됩니다(GitHub Pages, 파일 열기 등).

## 로컬 개발
```bash
node test/dev-server.mjs   # http://localhost:8788 (D1 대신 메모리 SQLite)
node test/core.test.js && node test/api.test.mjs
```

## 주의
- 쓰기 인증이 없어서 접속자 누구나 응시자 데이터와 정답 설정을 바꾸거나 지울 수 있습니다.
- Functions 무료 한도는 하루 10만 요청입니다. 화면이 열려 있으면 30초마다 버전 확인 요청을 보냅니다.
