# 🎙️ Contributing to DLXR // College Radio Web

Thank you for contributing to DLXR Radio! We use a **Pull Request (PR)-based review process** to review and collaborate on all improvements.

All changes must go through a pull request and be reviewed by `@lpcd1723` before merging into `main`.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v20+ recommended)
- **npm** (v10+)
- **Git**

### 2. Setup
```bash
# Clone your fork or the repository
git clone https://github.com/lpcd1723/college-radio-demo.git
cd college-radio-demo

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### 3. Local Development
```bash
# Run server with hot-reloading
npm run dev
```
Open **`http://localhost:8080`** in your browser.

---

## 🌿 Branching Workflow

Always create a new branch off the latest `main` for your changes:

```bash
# Ensure you are on latest main
git checkout main
git pull origin main

# Create a feature or bugfix branch
git checkout -b feat/your-feature-name
# or
git checkout -b fix/issue-description
```

---

## 🧪 Testing Your Changes

Before committing or pushing, make sure the test suite passes:

```bash
# Run automated test suite
npm test
```

If you are modifying UI or visualizer components:
- Verify that stream playback and volume controls function.
- Test across responsive screen widths (desktop, tablet, mobile).
- Check both `DARK` and `LIGHT` skins if updating styling.

---

## 🔒 Security & Hygiene Guidelines

- **Never commit secrets, passwords, or API keys**:
  - Keep all credentials in your local `.env` (which is git-ignored).
  - Use `process.env.<VAR_NAME>` for configuration.
- **Never commit runtime data**:
  - The `data/` directory is git-ignored. Do not force-commit `data/*.json` or log files.
- **Keep PRs focused**:
  - One feature or fix per pull request makes review fast and clean.

---

## 📬 Submitting a Pull Request

1. Push your branch to GitHub:
   ```bash
   git push origin feat/your-feature-name
   ```
2. Open a Pull Request against `main`.
3. Complete the PR checklist in the description template.
4. GitHub Actions will automatically run the test suite and verify the Docker build.
5. `@lpcd1723` will review your PR, provide feedback, and merge once approved!
