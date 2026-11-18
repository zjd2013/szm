/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  test: {
    // 双引擎语料（corpus.bin + cp-corpus.bin 解压建索引）与 529/200 批量基准
    // 都是重计算，放宽到宽裕上限；单套件默认超时不再够用
    testTimeout: 300000,
    hookTimeout: 120000,
  },
});
