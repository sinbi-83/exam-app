/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

// Node.js HTTP 헤더 크기 제한 확장 (431 에러 방지)
if (typeof process !== 'undefined') {
  process.env.UV_THREADPOOL_SIZE = '128';
}

module.exports = nextConfig;
