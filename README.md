# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## GitHub 연동 + GitHub Pages 배포(React + Vite)

이 레포는 `main` 브랜치에 푸시하면, 같은 푸시로 GitHub Pages까지 자동 배포되도록 설정되어 있습니다(`.github/workflows/deploy-pages.yml`).

### 1) GitHub 레포 만들고 원격 연결

```bash
git init
git add -A
git commit -m "init"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

### 2) GitHub Pages 설정

- GitHub 레포 → Settings → Pages
- **Build and deployment** → Source를 **GitHub Actions**로 선택

이후 `main`에 푸시할 때마다 `npm ci` → `npm run build` → Pages 배포가 자동으로 진행됩니다.

### 3) 배포 URL

- `https://<username>.github.io/<repo>/`

## Supabase(Auth) 연동 (로그인 먼저 보이게)

이 프로젝트는 Supabase Auth를 사용해서 **첫 화면을 로그인 페이지(`/login`)로 고정**하고, 로그인 세션은 브라우저에 저장되어 **다음 접속부터 자동 로그인**됩니다(로그아웃 지원).

1) Supabase 프로젝트 생성 후, `.env`에 아래 값 추가

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

2) 개발 실행

```bash
npm run dev
```

### GitHub Pages 배포 시(중요)

GitHub Actions에서 빌드할 때도 Supabase 환경변수가 필요합니다.

- GitHub Repo → Settings → Secrets and variables → Actions → New repository secret
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
