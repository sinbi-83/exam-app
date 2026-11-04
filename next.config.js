/** @type {import('next').NextConfig} */
// 5단계 메뉴 개편: 옛 주소 → 새 주소 (목록은 config/legacyRoutes.json 한 곳)
const legacyRoutes = require('./config/legacyRoutes.json');

// Preview 빌드만 시험용 DB 로 고정하고, 운영 값이 섞이면 빌드를 멈춘다 (Production·로컬은 영향 없음)
const { assertPreviewSafe, previewEnvOverrides, withPreviewScan } = require('./config/previewGuard.js');
assertPreviewSafe();

const nextConfig = {
  env: previewEnvOverrides(),
  webpack: (config) => withPreviewScan(config),
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async redirects() {
    // permanent: false (307) — 나중에 주소를 다시 바꿀 수 있게 브라우저가 영구 기억하지 않도록
    return legacyRoutes.redirects.map((r) => ({ source: r.source, destination: r.destination, permanent: false }));
  },
};

// Node.js HTTP 헤더 크기 제한 확장 (431 에러 방지)
if (typeof process !== 'undefined') {
  process.env.UV_THREADPOOL_SIZE = '128';
}

module.exports = nextConfig;
