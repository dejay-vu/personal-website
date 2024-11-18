/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  images: {
    minimumCacheTTL: 31536000,
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'resizer.dejayvu.com',
        port: '',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
      },
    ],
  },
  experimental: {
    mdxRs: true,
  },
  // experimental: {
  //   // reactCompiler: true,
  //   turbo: {
  //     resolveExtensions: [
  //       '.mdx',
  //       '.tsx',
  //       '.ts',
  //       '.jsx',
  //       '.js',
  //       '.mjs',
  //       '.json',
  //     ],
  //   },
  // },
};

module.exports = nextConfig;
