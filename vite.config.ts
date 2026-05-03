import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(() => {
  // GitHub Pages(project pages) 배포 시: /<repo>/ 경로로 서빙되므로 base를 맞춰야 함.
  // - 로컬/일반 호스팅: BASE_PATH 미설정이면 '/'
  // - GitHub Actions: BASE_PATH='/${{ github.event.repository.name }}/'
  const base = process.env.BASE_PATH ?? '/'
  const buildId = process.env.BUILD_ID ?? new Date().toISOString()

  return {
    base,
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [react(), tailwindcss()],
  }
})
