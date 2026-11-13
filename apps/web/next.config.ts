import type { NextConfig } from 'next';

const config: NextConfig = {
  // game-core ships as TypeScript source; let Next compile it.
  transpilePackages: ['@hoodwink/game-core'],
  reactStrictMode: true,
};

export default config;
