# Publishing via GitHub Actions

This repository includes a GitHub Actions workflow that automatically publishes to npm when you create a release tag.

## Setup

### 1. Create an npm Access Token

1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/access-tokens
2. Click "Generate New Token" → "Granular Access Token"
3. Configure:
   - **Token name**: `github-actions-publish` (or any name you prefer)
   - **Expiration**: Choose your preference (or leave default)
   - **Permissions**: Enable "Publish packages"
   - **Bypass 2FA**: Enable this (required for automated publishing)
4. Copy the token (you won't see it again!)

### 2. Add Secret to GitHub Repository

1. Go to your repository: https://github.com/MohtashamMurshid/checkmate-factbench
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NPM_TOKEN`
5. Value: Paste your npm token
6. Click **Add secret**

## Publishing a New Version

### Method 1: Using Git Tags (Recommended)

1. **Update version in package.json:**
   ```bash
   # Edit package.json and change version to, e.g., "0.1.0"
   ```

2. **Update CHANGELOG.md** with the new version's changes

3. **Commit and push:**
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: bump version to 0.1.0"
   git push
   ```

4. **Create and push a tag:**
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. **GitHub Actions will automatically:**
   - Build the package
   - Verify version matches tag
   - Publish to npm
   - Create a GitHub release

### Method 2: Manual Workflow Dispatch

1. Go to **Actions** tab in your GitHub repository
2. Select **Publish to npm** workflow
3. Click **Run workflow**
4. Select branch and click **Run workflow**

## Version Tag Format

Tags must follow the format: `v0.1.0`, `v1.0.0`, `v2.1.3`, etc.

The workflow will:
- Extract version from tag (removes `v` prefix)
- Verify it matches `package.json` version
- Publish to npm with that version

## Troubleshooting

- **401 Unauthorized**: Check that `NPM_TOKEN` secret is set correctly
- **403 Forbidden**: Ensure your npm token has "Publish packages" permission and "Bypass 2FA" enabled
- **Version mismatch**: Make sure the tag version (without `v`) matches `package.json` version exactly

