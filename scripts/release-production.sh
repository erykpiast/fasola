#!/bin/bash
set -euo pipefail

# Infer semver bump from conventional commits since the last version tag,
# bump the EAS remote version, tag the release, and submit to production.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# 1. Find the latest version tag (vMAJOR.MINOR.PATCH)
# ---------------------------------------------------------------------------
LATEST_TAG=$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1)

if [ -z "$LATEST_TAG" ]; then
  echo "No version tag found. Using package.json version as baseline."
  CURRENT_VERSION=$(node -p "require('./package.json').version")
  COMMIT_RANGE="HEAD"
else
  CURRENT_VERSION="${LATEST_TAG#v}"
  COMMIT_RANGE="${LATEST_TAG}..HEAD"
fi

echo "Current version: $CURRENT_VERSION"

# ---------------------------------------------------------------------------
# 2. Parse current version
# ---------------------------------------------------------------------------
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# ---------------------------------------------------------------------------
# 3. Determine bump from commit messages
# ---------------------------------------------------------------------------
if [ "$COMMIT_RANGE" = "HEAD" ]; then
  COMMITS=$(git log --format='%s%n%b' HEAD)
else
  COMMITS=$(git log --format='%s%n%b' "$COMMIT_RANGE")
fi

BUMP="patch" # default

if echo "$COMMITS" | grep -qiE 'BREAKING[ -]CHANGE'; then
  BUMP="major"
elif echo "$COMMITS" | grep -qE '^feat(\(|:|!)'; then
  BUMP="minor"
fi

# ---------------------------------------------------------------------------
# 4. Compute new version
# ---------------------------------------------------------------------------
case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "Bump type: $BUMP"
echo "New version: $NEW_VERSION"

# ---------------------------------------------------------------------------
# 5. Set the EAS remote version
# ---------------------------------------------------------------------------
echo ""
echo "Setting EAS version to $NEW_VERSION ..."
npx eas-cli build:version:set --platform ios --non-interactive "$NEW_VERSION"

# ---------------------------------------------------------------------------
# 6. Tag the release
# ---------------------------------------------------------------------------
git tag "v$NEW_VERSION"
git push origin "v$NEW_VERSION"
echo "Tagged v$NEW_VERSION"

# ---------------------------------------------------------------------------
# 7. Build and submit
# ---------------------------------------------------------------------------
echo ""
echo "Starting production build + submit ..."
npx eas-cli build --platform ios --profile production --auto-submit
