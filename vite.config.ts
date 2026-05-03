import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // `vite dev`(serve): 항상 '/'가 자연스럽다.
  // `vite build`: GitHub Pages/서브패스/로컬 파일서빙까지 안전하게 상대경로('./')를 기본으로 사용.
  // GitHub Actions에서 project pages로 배포할 땐 BASE_PATH='/${repo}/'를 주입하면 됨.
  const base = command === 'serve' ? '/' : process.env.BASE_PATH ?? './'

  return {
    base,
    plugins: [react(), tailwindcss()],
  }
})
