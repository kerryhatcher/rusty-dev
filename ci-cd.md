# CI/CD Pipeline

A production Rust CI pipeline enforces every quality, compatibility, and
security gate on every change, runs across target operating systems, constrains
runner permissions to read-only by default, and pins third-party GitHub Actions
by immutable commit SHA.

## Design principles

1. **Separate jobs for separate concerns** — test, lint/doc, SemVer, MSRV,
   security, and supply-chain vetting run in parallel jobs so a formatting
   error never hides a Windows test regression or advisory alert.
2. **Cross-platform test matrix** — execute tests on Linux, macOS, and Windows
   to catch path-separator, newline, filesystem-locking, and environment bugs.
3. **Cancel superseded PR runs** — use `concurrency` to cancel stale PR jobs on
   new pushes while never cancelling `main` branch runs.
4. **Cache deterministically** — `Swatinem/rust-cache` caches `~/.cargo` and
   relevant `target/` artifacts, cutting CI wall-clock time by 50–80%.
5. **Audit the workflow itself** — scan `.github/workflows/` with `zizmor` so
   template injections, over-scoped tokens, or unpinned actions cannot land.

## The CI workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  # Required checks must also report on merge queue runs, or a queue waits on
  # them forever. Merge-group refs are unique, so they are never cancelled.
  merge_group:
  schedule:
    # Weekly scan catches newly published advisories on quiet repositories.
    - cron: "0 6 * * 1"

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

env:
  CARGO_TERM_COLOR: always

# Default every job to read-only. Grant narrowly scoped write/OIDC permissions
# only inside dedicated release/attestation jobs on protected refs.
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
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3
      - uses: taiki-e/install-action@073e1fd0bc889c9aee68dbaaa927cde1b5653a83 # v2.90.11
        with:
          tool: cargo-nextest
      - run: cargo nextest run --all-features --locked
      # Omit `cargo test --doc` if the package has no library target (`src/lib.rs`).
      - run: cargo test --doc --all-features --locked

  lint:
    name: lint & doc
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
        with:
          toolchain: stable
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3
      - run: cargo fmt --check
      - run: cargo clippy --all-targets --all-features --locked -- -D warnings
      - name: Check rustdoc and intra-doc links
        env:
          RUSTDOCFLAGS: -D warnings
        run: cargo doc --no-deps --all-features --locked

  semver:
    name: semver
    # PR-only: the PR title says whether a break is intentional. A job skipped
    # by `if:` reports success, so merge-group runs rely on the PR run.
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0 # the baseline commit must exist locally
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3
      - uses: taiki-e/install-action@073e1fd0bc889c9aee68dbaaa927cde1b5653a83 # v2.90.11
        with:
          tool: cargo-semver-checks
      - name: Check API changes against the base branch
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
          # Through env, never inline `${{ }}`, so a title cannot inject shell.
          TITLE: ${{ github.event.pull_request.title }}
        run: |
          # A title marked breaking (`feat!:`, `refactor(api)!:`) declares an
          # intentional break: reviewers approve it and release-plz bumps the
          # major version. Any other title must not break the public API.
          release_type=minor
          if [[ "$TITLE" =~ ^[a-z]+(\([^\)]*\))?!: ]]; then
            release_type=major
          fi
          cargo semver-checks --baseline-rev "$BASE_SHA" --release-type "$release_type"

  msrv:
    name: msrv (1.96)
    runs-on: ubuntu-latest
    env:
      # Override any committed `rust-toolchain.toml` so cargo uses 1.96.
      RUSTUP_TOOLCHAIN: "1.96"
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
        with:
          toolchain: "1.96"
      - uses: Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3
      - run: cargo test --all-features --locked

  security:
    name: security
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3
      - uses: taiki-e/install-action@073e1fd0bc889c9aee68dbaaa927cde1b5653a83 # v2.90.11
        with:
          tool: just,cargo-audit,cargo-deny,cargo-geiger
      - run: cargo audit
      - run: cargo deny check
      - uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
        with:
          version: "v0.76.2"
          scan-type: fs
          scanners: vuln,secret
          exit-code: "1"
          skip-dirs: target
      - uses: zizmorcore/zizmor-action@45d7276c9ca790aabd705e31ca99c6185c3e76dd # v0.8.1
        with:
          advanced-security: false
      - run: just geiger

  vet:
    name: vet
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3
      - uses: taiki-e/install-action@073e1fd0bc889c9aee68dbaaa927cde1b5653a83 # v2.90.11
        with:
          tool: cargo-vet
      - run: cargo vet --locked
```

## Job breakdown

### `test` — cross-platform nextest + doctests

- Runs on **Linux, macOS, and Windows** with `fail-fast: false` so OS-specific
  failures on Windows or macOS are visible in full.
- Uses `cargo nextest run --all-features --locked` for isolated, parallel binary
  tests plus `cargo test --doc --all-features --locked` for documentation examples.

### `lint` — formatting, clippy, and rustdoc

- Runs `cargo fmt --check`, `cargo clippy --all-targets --all-features --locked -- -D warnings`,
  and `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features --locked`.

### `semver` — public API compatibility (libraries)

- Uses `cargo-semver-checks` to compare the PR against its base commit
  (`--baseline-rev`), so each PR is judged only on the API changes it
  introduces. Comparing against crates.io instead would keep failing every PR
  after an intentional break merges, until the next release ships.
- An intentional break needs no version edit and no override: mark the PR
  title with `!` (see [Commit conventions](releases.md#commit-conventions)). The
  job then checks with `--release-type major`, the break is visible in the
  title for reviewers to approve, and `release-plz` bumps the major version
  (minor on `0.x`) in the next Release PR. Without `!`, it checks with
  `--release-type minor` and fails on any break, so an unmarked break cannot
  merge.
- Runs only on pull requests. Release-time checks against the published crate
  are done by `release-plz` (`semver_check = true`).
- Binary-only repositories without a published library target can omit this
  job.

### `msrv` — MSRV enforcement

- Pins the exact `rust-version` from `Cargo.toml` (`"1.96"`) and executes the
  full test suite with `--locked`.

### `security` — advisories, licenses, secrets, workflow linting, and `unsafe`

- Runs `cargo audit` and `cargo deny check`.
- Runs SHA-pinned Trivy filesystem scanning (`vuln,secret`).
- Runs `zizmor` static security analysis against `.github/workflows/`.
- Runs `just geiger` (informational `unsafe` trend report).

### `vet` — locked supply-chain trust verification

- Runs `cargo vet --locked` so CI verifies against the committed
  `supply-chain/imports.lock` rather than fetching unreviewed external state
  over the network.

## Pinning action versions and auditing workflows

Pin **every** GitHub Action—first-party and third-party alike—to a full 40-char
commit SHA with a trailing version comment:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
- uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
```

Mutable tags (`@v1`, `@v0.36.0`) can be retroactively repointed if an upstream
action repository is compromised. In March 2026, an attacker rewrote 75+ tags
of `aquasecurity/trivy-action` and `setup-trivy` to credential-stealing payloads
(`CVE-2026-33634` / `GHSA-69fq-xp46-6x23`)—workflows referencing mutable tags
executed the payload, whereas SHA-pinned workflows were unaffected.

Always resolve a tag to its commit SHA yourself rather than copying SHAs blindly
from documentation:

```bash
gh api repos/actions/checkout/commits/v7.0.1 --jq .sha
```

Additional workflow hardening rules:

- **Enable GitHub's Actions SHA-pinning policy** at the repository or
  organization level, and restrict allowed third-party actions and reusable
  workflows.
- **Set `persist-credentials: false` on `actions/checkout`** unless a later step
  in that job genuinely pushes commits (`zizmor` flags omitted
  `persist-credentials: false` under its `artipacked` rule).
- **Verify Node 24 runtime support** on pinned actions—GitHub removed Node 20
  from hosted runners in September 2026, so legacy `node20` actions fail.
- **Block untrusted fork access to secrets/write tokens** (`actions/checkout@v7`
  also blocks unsafe fork checkouts on `pull_request_target` triggers).

## Evidence retention and scheduled checks

PR checks only run when code changes; the weekly `schedule` trigger ensures newly
published RustSec advisories fail visibly even on quiet repositories. (Because a
brand-new upstream advisory can fail every open PR simultaneously, some teams
split advisory scanning into a dedicated daily scheduled workflow rather than a
required PR check; either way, record alert triage.) Retain release-job logs,
checksums, SBOMs, provenance attestations, and test reports for your support or
contractual retention window, and avoid uploading sensitive logs or raw memory
dumps as public artifacts.

## Further reading

- [GitHub Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [zizmor: static security analysis for GitHub Actions](https://docs.zizmor.sh/)
- [cargo-nextest in CI](https://nexte.st/docs/ci-features/)
- [cargo-semver-checks](https://github.com/obi1kenobi/cargo-semver-checks)
- [Swatinem/rust-cache](https://github.com/Swatinem/rust-cache)
- [taiki-e/install-action](https://github.com/taiki-e/install-action)
