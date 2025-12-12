# Publishing via GitHub Actions

This repository includes a GitHub Actions workflow that automatically publishes to npm when you create a release tag.

## Setup

### 1. Create an npm Automation Token (Required for CI/CD)

**Important**: You must use an **Automation Token** (not a regular access token) for CI/CD publishing. Automation tokens don't require 2FA and are designed for automated workflows.

1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/access-tokens
2. Click "Generate New Token" → **"Automation"** (this is the key - use Automation, not Granular Access Token)
3. Configure:
   - **Token name**: `github-actions-publish` (or any name you prefer)
   - **Expiration**: Choose your preference (or leave default)
   - **Permissions**: Will automatically have "Publish packages" permission
   - **No 2FA required**: Automation tokens bypass 2FA automatically
4. Copy the token immediately (you won't see it again!)
5. Make sure to select **"Automation"** type, not "Granular Access Token" or "Classic Token"

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
- **EOTP / One-time password required**: This means you're using a regular access token instead of an Automation token. Create a new **Automation** token (not Granular Access Token) and update the `NPM_TOKEN` secret.
- **403 Forbidden**: Ensure your npm token has "Publish packages" permission. Automation tokens have this by default.
- **Version mismatch**: Make sure the tag version (without `v`) matches `package.json` version exactly

### Common Issue: 2FA Required Error

If you see `npm error code EOTP` or "This operation requires a one-time password", you're using the wrong token type. Solution:

1. Delete the old token from npm settings
2. Create a new **Automation** token (not Granular Access Token)
3. Update the `NPM_TOKEN` secret in GitHub with the new Automation token
4. Re-run the workflow

