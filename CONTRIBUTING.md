# Contributing to DLXR Radio Web

Contributions and bug reports are welcome. All changes are submitted via Pull Requests and reviewed before merging into `main`.

---

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- npm (v9+)
- Git

### 2. Setup
```bash
git clone https://github.com/lpcd1723/DLXR-radio.git
cd DLXR-radio

npm install
cp .env.example .env
```

### 3. Local Development
```bash
npm run dev
```
Open `http://localhost:8080` in your browser.

---

## Branching Conventions

Create a branch off the latest `main` for your changes:

```bash
git checkout main
git pull origin main

git checkout -b feat/your-feature-name
# or
git checkout -b fix/issue-description
```

---

## Testing

Ensure syntax checks and integration tests pass before pushing:

```bash
npm run lint
npm test
```

If updating frontend or visualizer code:
- Check desktop and mobile browser layouts.
- Test visualizer toggle (`VIS`) and theme toggle (`THEME`).
- Verify stream playback and volume controls.

---

## Guidelines

- **No Secrets**: Never commit tokens, passwords, or personal keys. Use environment variables defined in `.env.example`.
- **No Runtime Data**: Keep `data/` and local test logs git-ignored.
- **Focused Changes**: Keep PRs scoped to one fix or feature to make reviews straightforward.

---

## Submitting a Pull Request

1. Push your branch to GitHub:
   ```bash
   git push -u origin feat/your-feature-name
   ```
2. Open a Pull Request targeting `main`.
3. Complete the PR template checklist.
4. Verify that the GitHub Actions CI checks (`Docker Build Test` and `Node.js Test Suite`) pass.
5. Address any review feedback before merge.
