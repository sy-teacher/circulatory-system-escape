import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 상대 경로(base: './')로 빌드하여 학교 서버의 하위 폴더나 USB에서도 열 수 있게 한다.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
