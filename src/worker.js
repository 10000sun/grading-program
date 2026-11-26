// Cloudflare Workers(정적 에셋 + API). /api/* 만 이 워커가 처리하고 나머지는 정적 파일로 바로 서빙됨.
import { onRequest } from './api.js';

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    return onRequest({ request, env, params: { route: pathname.slice(5).split('/') } });
  },
};
