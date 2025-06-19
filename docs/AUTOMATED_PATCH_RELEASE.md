# Automated Patch Release Process

This document describes the automated process for creating patch releases on GitHub. This process is only for patch releases (e.g., 1.1.6 → 1.1.7). Minor and major releases should continue to be done manually.

## Prerequisites

- Clean git working directory (all changes committed)
- `gh` CLI tool installed and authenticated
- `bun` or `npm` installed

## Automated Process for Patch Releases

When creating a patch release, follow these steps:

### 1. Commit Your Changes

```bash
git add <changed files>
git commit -m "fix: <description of fix>"
```

Use conventional commit messages:
- `fix:` for bug fixes
- `feat:` for new features (though these should typically be minor releases)
- `docs:` for documentation updates
- `chore:` for maintenance tasks

### 2. Create Version and Tag

```bash
npm version patch
```

This single command will:
- Bump the patch version in `package.json`
- Run the `version` script which updates `manifest.json` and `versions.json`
- Create a git commit with the version bump
- Create a git tag for the new version

### 3. Build the Plugin

```bash
bun run build
```

This creates the production-ready `main.js` file.

### 4. Push to GitHub

```bash
git push && git push --tags
```

This pushes both the commits and the new version tag.

### 5. Create GitHub Release

```bash
gh release create <version> \
  --title "Release <version>" \
  --notes "<release notes>" \
  manifest.json main.js styles.css
```

Example with generated release notes:
```bash
gh release create 1.1.7 \
  --title "Release 1.1.7" \
  --notes "## What's Changed

### Bug Fixes
- Fixed server restart behavior during port configuration
- Improved settings UX for HTTP port configuration

### Technical
- Better event handling in settings UI
- Automatic status refresh after configuration changes

---
🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>" \
  manifest.json main.js styles.css
```

## Release Notes Template

For patch releases, use this template:

```markdown
## What's Changed

### Bug Fixes
- <list bug fixes>

### Improvements
- <list small improvements if any>

### Technical
- <list technical changes if relevant>

---
🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Important Notes

- The release uploads three required files: `manifest.json`, `main.js`, and `styles.css`
- Obsidian doesn't use 'v' prefix in tags (use `1.1.7` not `v1.1.7`)
- The npm version command handles all version file updates automatically
- Always test the plugin locally before creating a release

## When NOT to Use This Process

Do not use this automated process for:
- Minor releases (new features)
- Major releases (breaking changes)
- Pre-release versions
- Any release requiring special handling or extensive testing

For these cases, follow the manual release process in `docs/RELEASE_CHECKLIST.md`.