# GremiusCMS - Package Publication Guide

## 🚀 Quick Start (Publish to NPM)

### Prerequisites

1. **NPM Account** - Create at [npmjs.com](https://www.npmjs.com)
2. **Join Organization** - Ask admin to add you to `@gremius` org
3. **Login to NPM**:
   ```bash
   npm login
   # or for bun
   bunx npm login
   ```

4. **Verify Access**:
   ```bash
   npm whoami
   # Should show your username
   ```

---

## 📦 Package Status

| Package | Status | Version | Command |
|---------|--------|---------|---------|
| `@gremius/sdk` | ✅ Ready | 0.2.0 → 1.0.0 | See below |
| `@gremius/shared` | ✅ Ready | 0.7.0-beta → 0.7.0 | See below |

---

## 🎯 Step-by-Step Publication

### Step 1: Update Versions

```bash
# For SDK (major release)
cd packages/sdk
npm version 1.0.0

# For Shared (patch release)
cd packages/shared
npm version 0.7.0
```

### Step 2: Build Packages

```bash
# From root
pnpm run build:packages

# Or individually
cd packages/shared && pnpm build
cd packages/sdk && pnpm build
```

### Step 3: Test Build

```bash
# Verify dist folders exist
ls packages/sdk/dist
ls packages/shared/dist

# Should show:
# - index.js / index.cjs
# - index.d.ts / index.d.cts
# - source maps (.map)
```

### Step 4: Dry Run (Test Publication)

```bash
# Test SDK
cd packages/sdk
npm publish --dry-run

# Test Shared
cd packages/shared
npm publish --dry-run
```

### Step 5: Publish

```bash
# Option 1: Manual
npm publish --access public

# Option 2: Using scripts from root
pnpm run publish:sdk
pnpm run publish:shared

# Option 3: GitHub Actions (Recommended)
git tag v1.0.0
git push origin v1.0.0
# Triggers automatic publication
```

---

## 🔐 GitHub Actions Setup

### Add NPM_TOKEN Secret

1. Go to [npmjs.com](https://www.npmjs.com) → Access Tokens → Generate New Token
2. Select "Automation" token type
3. Copy the token
4. Go to GitHub repo → Settings → Secrets and variables → Actions
5. Click "New repository secret"
6. Name: `NPM_TOKEN`
7. Value: Paste your npm token
8. Click "Add secret"

### Trigger Automated Publish

```bash
# Tag and push
git add .
git commit -m "chore: prepare packages for v1.0.0"
git tag v1.0.0
git push origin main --tags
```

GitHub Actions will automatically:
- Run tests
- Build packages
- Publish to NPM

---

## 📋 Pre-Publication Checklist

### For @gremius/sdk

- [ ] Version updated (not `-beta`)
- [ ] README.md complete with examples
- [ ] CHANGELOG.md updated
- [ ] Build successful (`dist/` exists)
- [ ] Types generated (`.d.ts` files)
- [ ] No `workspace:*` dependencies
- [ ] Keywords in package.json
- [ ] License specified
- [ ] Dry run successful

### For @gremius/shared

- [ ] `private: false` (removed)
- [ ] `files: ["dist"]` added
- [ ] Exports map complete
- [ ] README.md exists
- [ ] Build successful
- [ ] Version updated

---

## 🐛 Troubleshooting

### "You do not have permission"

```bash
# Make sure you're logged in
npm whoami

# If not, login
npm login

# Verify you're part of @gremius org
npm org ls @gremius
```

### "Cannot publish over existing version"

```bash
# Use different version
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.0 → 1.1.0
npm version major  # 1.0.0 → 2.0.0
```

### "Workspace dependencies not allowed"

```bash
# Before publishing, replace workspace deps
# In packages/sdk/package.json, change:
"@gremius/shared": "workspace:*"
# To:
"@gremius/shared": "^0.7.0"
```

### "Build files not found"

```bash
# Make sure to build first
pnpm run build:packages

# Verify dist exists
ls packages/*/dist
```

---

## 📊 Post-Publication Verification

### Check NPM Registry

```bash
# View package on npm
npm view @gremius/sdk

# Check specific version
npm view @gremius/sdk versions

# Download stats (24h delay)
npm view @gremius/sdk stats
```

### Test Installation

```bash
# Create test project
mkdir test-sdk && cd test-sdk
npm init -y

# Install published package
npm install @gremius/sdk

# Test import
node -e "const {GremiusClient} = require('@gremius/sdk'); console.log('OK')"
```

### Verify TypeScript

```bash
# Create test.ts
import { GremiusClient } from '@gremius/sdk';
const client = new GremiusClient({ url: 'test' });

# Compile
npx tsc test.ts --module commonjs --esModuleInterop
```

---

## 🔄 Continuous Deployment

### Automatic Publishing on Tag

The `.github/workflows/publish.yml` workflow:

1. Runs on every tag push (`v*`)
2. Runs full test suite
3. Builds all packages
4. Publishes to NPM

### Manual Trigger

1. Go to GitHub repo → Actions → "Publish to NPM"
2. Click "Run workflow"
3. Select package: `sdk`, `shared`, or `all`
4. Click "Run workflow"

---

## 📚 Resources

- [NPM Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [Keeping a Changelog](https://keepachangelog.com/)
- [Bun Publish](https://bun.sh/docs/cli/publish)

---

## 🎉 Success!

After publication:

1. **Announce** - Share on Twitter, Discord, etc.
2. **Update Docs** - Update documentation website
3. **Create Examples** - Build sample projects
4. **Monitor Issues** - Watch for bug reports

Packages will be available at:
- https://www.npmjs.com/package/@gremius/sdk
- https://www.npmjs.com/package/@gremius/shared
