import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 개발 서버는 /api 요청을 백엔드(기본 http://localhost:3000)로 넘긴다.
// 같은 출처로 요청하므로 세션 쿠키(SameSite=Lax)가 그대로 동작하고,
// 브라우저가 보낸 Origin(http://localhost:5173)은 바꾸지 않고 전달한다 (백엔드 Origin 검증).
const API_PROXY_TARGET = globalThis.process?.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API_PROXY_TARGET, changeOrigin: false },
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API_PROXY_TARGET, changeOrigin: false },
    },
  },
})
