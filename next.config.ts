import type {NextConfig} from 'next';
import CopyPlugin from 'copy-webpack-plugin';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
   webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Add copy plugin to copy pdf.worker.min.mjs to static assets
    // This makes it available at /_next/static/chunks/pdf.worker.min.mjs
    if (!isServer) {
        config.plugins ??= []; // Ensure plugins array exists
        config.plugins.push(
            new CopyPlugin({
            patterns: [
              {
                from: path.join(
                  path.dirname(require.resolve('pdfjs-dist/package.json')),
                  'build/pdf.worker.min.mjs'
                ),
                 to: path.join(config.output.path || '', 'static/chunks'), // Destination in the build output
              },
            ],
          })
        );
    }

    // Important: return the modified config
    return config;
  },
};

export default nextConfig;
