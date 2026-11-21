const backend = (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');

export default {
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: '/gateway/admin/:path*', destination: `${backend}/admin/:path*` },
      { source: '/gateway/images/:path*', destination: `${backend}/images/:path*` },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ] }];
  },
};
