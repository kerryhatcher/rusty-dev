# CI/CD Pipeline

A production Rust CI pipeline runs every quality gate on every change, across
multiple operating systems, and reports every failure.

## Design principles

1. **Separate jobs for separate concerns** — test, lint, docs, MSRV,
   security, and vet each get their own job. A lint failure should not block
   the test suite from running.
2. **Matrix builds for cross-platform testing** — run tests on Linux, macOS,
   and Windows. Rust code that works on one platform may fail on another
   (path separators, line endings, environment variables).
3. **Fail fast within a job** — each job stops at the first failing step. The
   developer gets immediate feedback on what broke.
4. **Cache dependencies** — `Swatinem/rust-cache` caches `~/.cargo` and the
   dependency part of `target/` between runs, which usually cuts build time
   substantially.
5. **Same commands locally and in CI** — CI runs the `just` recipes, so
   `just ci` reproduces it.
6. **Least privilege by default** — read-only token, no persisted
   credentials, actions pinned by SHA.

## The CI workflow

The example uses version tags for readability. **In a real workflow, pin
every action to a full commit SHA** as shown in
[Pinning action versions](#pinning-action-versions).

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

# Cancel superseded runs for the same branch or PR.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  CARGO_TERM_COLOR: always

# Default every job to read-only. Add narrowly scoped write permissions only
# to the release/provenance job that needs them.
permissions:
  contents: read

jobs:
  test:
    name: test (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - uses: taiki-e/install-action@v2
        with:
          tool: just
      - run: just test

  lint:
    name: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
      - uses: taiki-e/install-action@v2
        with:
          tool: just
      - run: just fmt
      - run: just lint
      - run: just doc

  msrv:
    name: msrv (1.85.1)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@master
        with:
          toolchain: "1.85.1"
      - uses: Swatinem/rust-cache@v2
      - uses: taiki-e/install-action@v2
        with:
          tool: just
      - run: just test

  security:
    name: security
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@stable
      - uses: taiki-e/install-action@v2
        with:
          tool: just,cargo-audit,cargo-deny,cargo-geiger
      - run: just audit
      - run: just deny
      # Pin by full SHA — this action's tags were hijacked in March 2026.
      - uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
        with:
          scan-type: fs
          scanners: vuln,secret
          exit-code: "1"
          skip-dirs: target
      - run: just geiger

  vet:
    name: vet
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@stable
      - uses: taiki-e/install-action@v2
        with:
          tool: just,cargo-vet
      - run: just vet

  workflows:
    name: workflow lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: taiki-e/install-action@v2
        with:
          tool: zizmor
      - run: zizmor --format=github .github/workflows
```

The `just` recipes in [local development](local-dev.md#the-justfile) pass
`--locked`, so a stale `Cargo.lock` fails the build instead of being
silently re-resolved.

## Job breakdown

### `test` — cross-platform test suite

- Runs on **Linux, macOS, and Windows**.
- `fail-fast: false` — a failure on one OS does not cancel the others.
  Windows failures are often environment-specific and worth seeing.
- Runs `just test` (`cargo test --locked`). If the crate has features, add a
  step with `cargo hack test --feature-powerset` (or at least
  `--all-features` and `--no-default-features`).

### `lint` — formatting, clippy, and docs

- Runs on Ubuntu only (formatting and clippy are platform-independent, though
  `cfg(windows)` code is only linted on Windows; add a Windows clippy run if
  you have significant platform-specific code).
- Installs `rustfmt` and `clippy` components explicitly.
- Runs `just fmt`, `just lint`, and `just doc` (`cargo doc` with
  `RUSTDOCFLAGS=-D warnings`).

### `msrv` — MSRV enforcement

- Pins the exact toolchain from `Cargo.toml`'s `rust-version`.
  `dtolnay/rust-toolchain@master` with a `toolchain` input is the form the
  action's README recommends for explicit versions (or use the
  `dtolnay/rust-toolchain@1.85.1` ref).
- Runs the full test suite, not just `cargo check`.
- Catches code or dependency changes that raise the effective MSRV.

### `security` — vulnerability and supply-chain scanning

- Runs `cargo audit` (RustSec advisory database).
- Runs `cargo deny check` (advisories, licenses, bans, sources).
- Runs Trivy (filesystem vulns and secrets).
- Runs `cargo geiger` (informational, never fails the build).

### `vet` — supply-chain trust

- Runs `cargo vet check` (audit policy enforcement).
- Separate from the security job because it has different tooling and
  different failure modes.

### `workflows` — CI security lint

- Runs [`zizmor`](https://docs.zizmor.sh/) over `.github/workflows` to catch
  unpinned actions, template injection, excessive permissions, persisted
  credentials, and dangerous triggers such as `pull_request_target`.

### Libraries: API compatibility

For a published library, add a job that runs
[`cargo-semver-checks`](https://github.com/obi1kenobi/cargo-semver-checks)
(`obi1kenobi/cargo-semver-checks-action`) against the last release, so a
breaking change cannot ship under a minor or patch version.

## Pinning action versions

Pin every GitHub Action to a full-length commit SHA, with a comment noting the
release tag:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
- uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
- uses: Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3
- uses: taiki-e/install-action@073e1fd0bc889c9aee68dbaaa927cde1b5653a83 # v2.90.11
- uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
```

Resolve a tag to its commit yourself rather than copying SHAs from
documentation (including this page):

```bash
gh api repos/actions/checkout/commits/v7.0.1 --jq .sha
```

This prevents a compromised or force-pushed tag from injecting code into your
pipeline. In March 2026 an attacker rewrote 75+ tags of
`aquasecurity/trivy-action` and `setup-trivy` to credential-stealing code
(CVE-2026-33634). Workflows that referenced a tag ran it; workflows pinned to
a SHA did not. Dependabot updates SHA pins and their version comments.

Also:

- Turn on the repository or organization **Actions policy that requires
  full-length SHA pins** (available since August 2025), and restrict which
  third-party actions and reusable workflows may run.
- Make workflow `permissions:` explicit, and set `persist-credentials: false`
  on `actions/checkout` unless a later step really needs to push.
- Never give a workflow triggered by an untrusted fork secrets or a
  write-capable token. Avoid `pull_request_target` and `workflow_run` for
  anything that checks out PR code.
- Make release/publishing workflows run only from protected refs and
  environments.
- Make sure every action you pin runs on Node 24. GitHub removed Node 20
  from hosted runners in September 2026, and actions still declaring
  `node20` no longer run.

## Evidence retention and scheduled checks

PR checks prevent regressions introduced by a change, but a dependency may be
disclosed as vulnerable on an otherwise quiet project. Run advisory checks on
a schedule as well:

```yaml
name: scheduled-audit

on:
  schedule:
    - cron: "17 6 * * *" # daily
  workflow_dispatch:

permissions:
  contents: read

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: taiki-e/install-action@v2
        with:
          tool: cargo-deny
      - run: cargo deny check advisories
```

Because a newly published advisory can fail every open PR at once, some
projects keep the advisory check out of required PR status checks and rely
on the scheduled job (and Dependabot security alerts) instead. Either way,
record how each alert was triaged.

Retain release-job logs, checksums, SBOMs, provenance/signatures, and test
reports for the length of the support period or contractual retention
requirement. Treat CI artifacts as potentially sensitive: redact logs and
avoid uploading secrets, production data, or full core dumps.

## Further reading

- [GitHub Actions documentation](https://docs.github.com/en/actions)
- [GitHub Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub: SHA pinning and action blocking policy](https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/)
- [GitHub action pinning policy settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
- [Aqua: Trivy supply chain attack](https://www.aquasec.com/blog/trivy-supply-chain-attack/) / [GHSA-69fq-xp46-6x23](https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23)
- [zizmor](https://docs.zizmor.sh/)
- [dtolnay/rust-toolchain](https://github.com/dtolnay/rust-toolchain)
- [Swatinem/rust-cache](https://github.com/Swatinem/rust-cache)
- [taiki-e/install-action](https://github.com/taiki-e/install-action)
- [cargo-hack](https://github.com/taiki-e/cargo-hack)
