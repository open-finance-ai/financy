# `financy update` + release pipeline

Status: ready-for-agent (AFK)

## Parent

PRD: `../PRD.md` (financy CLI v1)

## What to build

Release engineering end-to-end. `financy update` detects its install mode: global npm install → runs the global update; npx → prints "npx always runs the latest — nothing to update"; local dependency → defers to the project. Node minimum enforced via `engines` plus a friendly runtime check. GitHub Actions workflow publishes to npm on a version tag with `--provenance` (token in repo secrets / trusted publishing only). Plain semver via `npm version` + tags; hand-maintained CHANGELOG. A small manual smoke script (not in CI) exercises the live API pre-release.

## Acceptance criteria

- [ ] `financy update` behaves correctly in all three install modes (mode detection unit-tested; global path integration-tested)
- [ ] Running under an unsupported Node prints a clear error and exits 1
- [ ] Tag push → CI publishes with provenance; npm shows the attestation on the published version
- [ ] CHANGELOG.md exists with the v1 entry; README documents the release process
- [ ] Smoke script runs the core read commands + exit-code checks against staging when invoked manually

## Blocked by

- 01-walking-skeleton-status
