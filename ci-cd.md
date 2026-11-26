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
      - uses: dtolnay/rust-toolchain@e97e2d8cc328f1b50210efc529dca0028893a2d9 # v1
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@c19371144df3bb44fab255c43d04cbc2ab54d1c4 # v2.9.1
      - uses: taiki-e/install-action@75a7c0f8cb8b77ef2757283626db49f6920f75a7 # v2.90.6
        with:
          tool: cargo-nextest
      - run: cargo nextest run --all-features --locked
      - run: cargo test --doc --all-features --locked

  lint:
    name: lint & doc
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: dtolnay/rust-toolchain@e97e2d8cc328f1b50210efc529dca0028893a2d9 # v1
        with:
          toolchain: stable
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@c19371144df3bb44fab255c43d04cbc2ab54d1c4 # v2.9.1
      - run: cargo fmt --check
      - run: cargo clippy --all-targets --all-features --locked -- -D warnings
      - name: Check rustdoc and intra-doc links
        env:
          RUSTDOCFLAGS: -D warnings
        run: cargo doc --no-deps --all-features --locked

  semver:
    name: semver
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: dtolnay/rust-toolchain@e97e2d8cc328f1b50210efc529dca0028893a2d9 # v1
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@c19371144df3bb44fab255c43d04cbc2ab54d1c4 # v2.9.1
      - uses: taiki-e/install-action@75a7c0f8cb8b77ef2757283626db49f6920f75a7 # v2.90.6
        with:
          tool: cargo-semver-checks
      - run: cargo semver-checks --locked

  msrv:
    name: msrv (1.96)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: dtolnay/rust-toolchain@e97e2d8cc328f1b50210efc529dca0028893a2d9 # v1
        with:
          toolchain: "1.96"
      - uses: Swatinem/rust-cache@c19371144df3bb44fab255c43d04cbc2ab54d1c4 # v2.9.1
      - run: cargo test --all-features --locked

  security:
    name: security
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: dtolnay/rust-toolchain@e97e2d8cc328f1b50210efc529dca0028893a2d9 # v1
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@c19371144df3bb44fab255c43d04cbc2ab54d1c4 # v2.9.1
      - uses: taiki-e/install-action@75a7c0f8cb8b77ef2757283626db49f6920f75a7 # v2.90.6
        with:
          tool: just,cargo-audit,cargo-deny,cargo-geiger
      - run: cargo audit
      - run: cargo deny check
      - uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
        with:
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
      - uses: dtolnay/rust-toolchain@e97e2d8cc328f1b50210efc529dca0028893a2d9 # v1
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@c19371144df3bb44fab255c43d04cbc2ab54d1c4 # v2.9.1
      - uses: taiki-e/install-action@75a7c0f8cb8b77ef2757283626db49f6920f75a7 # v2.90.6
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

- Uses `cargo-semver-checks` to prevent accidental breaking API changes from
  merging without an intentional major bump. (Binary-only repositories without
  a published library target can omit this job.)

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
action repository is compromised—as demonstrated in real-world tag-hijacking
attacks against CI scanners. Dependabot updates SHA-pinned actions automatically
while keeping the human-readable `# vX.Y.Z` comment intact, and `zizmor` flags
any unpinned action added in a pull request.

Enable organization/repository Actions policies requiring full-SHA pins,
restricting allowed actions, and blocking fork PR workflows from accessing
secrets or write tokens. Note that `actions/checkout@v7` also blocks unsafe
fork checkouts on `pull_request_target` triggers.

## Evidence retention and scheduled checks

PR checks only run when code changes; the weekly `schedule` trigger ensures newly
published RustSec advisories fail visibly even on quiet repositories. Retain
release-job logs, checksums, SBOMs, provenance attestations, and test reports
for your support or contractual retention window, and avoid uploading sensitive
logs or raw memory dumps as public artifacts.

## Further reading

- [GitHub Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [zizmor: static security analysis for GitHub Actions](https://docs.zizmor.sh/)
- [cargo-nextest in CI](https://nexte.st/docs/ci-features/)
- [cargo-semver-checks](https://github.com/obi1kenobi/cargo-semver-checks)
- [Swatinem/rust-cache](https://github.com/Swatinem/rust-cache)
- [taiki-e/install-action](https://github.com/taiki-e/install-action)
