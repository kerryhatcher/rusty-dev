# CI/CD Pipeline

The continuous integration (CI) pipeline checks quality, compatibility, and
security for each change. It starts jobs on each target operating system.
Jobs have read-only permissions by default. The workflow uses full commit
SHAs for GitHub Actions.

## Workflow configuration

1. Put the test, lint, SemVer, MSRV, security, and supply-chain checks in different jobs.
   The jobs can operate in parallel. A format error does not stop the Windows
   test job or the security job.
2. Use Linux, macOS, and Windows in the test matrix. The matrix can find
   differences in paths, newlines, file locks, and environment variables.
3. Use `concurrency` to cancel a previous pull request job after a new push.
   Do not cancel jobs for `main`.
4. Use `Swatinem/rust-cache` to cache `~/.cargo` and applicable files in `target/`.
   This can decrease elapsed CI time by 50 to 80 percent.
5. Scan `.github/workflows/` with `zizmor`. The scan can identify template injection and actions without full commit SHAs.
   It can also identify tokens that have more permissions than necessary.

## The CI workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  # Mandatory checks must report a result to the merge queue.
  # Each merge group uses a different ref. Thus, a new group cannot cancel its checks.
  merge_group:
  schedule:
    # The weekly scan finds new advisories when there are no recent changes.
    - cron: "0 6 * * 1"

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

env:
  CARGO_TERM_COLOR: always

# Give jobs read-only access by default.
# Give write or OIDC permissions only to release and attestation jobs on protected refs.
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
      # If the package has no library target (src/lib.rs), omit the doctest command.
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

  msrv:
    name: msrv (1.96)
    runs-on: ubuntu-latest
    env:
      # Use Rust 1.96 instead of the version in rust-toolchain.toml.
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

### The `semver` workflow (`.github/workflows/semver.yml`)

The `semver` check uses the pull request title. Its workflow starts again
when the title changes. Keep the `edited` trigger in the semver workflow
to prevent title and description changes from starting the full test matrix.

```yaml
name: SemVer

on:
  pull_request:
    # Use edited to start the check again when the pull request title changes.
    # A change from feat!: to feat: can change the result.
    types: [opened, edited, reopened, synchronize]
  # Mandatory checks must report a result to the merge queue.
  # The job skips the check and reports success because CI checks each pull request.
  # In queue settings, enable "Only merge non-failing pull requests".
  merge_group:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  semver:
    name: semver
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
          # Read the title from the environment. Do not insert it into shell code.
          TITLE: ${{ github.event.pull_request.title }}
        run: |
          # The ! marker tells reviewers about an intentional incompatible change.
          # release-plz selects the version for that change.
          # Without the marker, the public API must stay compatible.
          release_type=minor
          if [[ "$TITLE" =~ ^[a-z]+(\([^\)]*\))?!: ]]; then
            release_type=major
          fi
          cargo semver-checks --baseline-rev "$BASE_SHA" --release-type "$release_type"
```

## Job breakdown

### `test` — cross-platform nextest + doctests

The job uses Linux, macOS, and Windows. With `fail-fast: false`, a failure on
one platform does not stop the tests on the other platforms. The job uses
`cargo nextest run --all-features --locked` with one process for each test. It
uses `cargo test --doc --all-features --locked` for documentation examples.

### `lint` — formatting, clippy, and rustdoc

The job uses these commands.

- `cargo fmt --check`
- `cargo clippy --all-targets --all-features --locked -- -D warnings`
- `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features --locked`

### `semver` — public API compatibility (libraries)

The [`semver` workflow](#the-semver-workflow-githubworkflowssemveryml) starts
again when the pull request title changes. The
`cargo-semver-checks` command compares the pull request with its base commit
(`--baseline-rev`). A comparison with crates.io could reject all
pull requests after an intentional incompatible change until the next release.

For an intentional incompatible change, add `!` to the pull request title.
Refer to [Commit conventions](releases.md#commit-conventions).
The job uses `--release-type major` when the title contains `!`. The title
shows the change to reviewers. `release-plz` increases the major version in
the next release pull request, or the minor version for `0.x`.

If the title has no `!`, the job uses `--release-type minor`. The job fails
when it finds an incompatible change. `cargo-semver-checks` can miss some
changes, such as some return-type changes. Reviewers must also check that the
title has the marker when necessary.

The job checks pull requests. A merge-queue job skips the check and reports
success. If you use GitHub Merge Queue, enable **Only merge non-failing pull requests**.
Otherwise, a pull request with a failed check can merge as part of a group.
At release time, `release-plz` checks the published crate (`semver_check = true`).

If the repository publishes only binaries, you can omit this job.

### `msrv` — MSRV enforcement

The job uses the `rust-version` from `Cargo.toml`, for example `"1.96"`.
It starts the full test suite with `--locked`.

### `security` — advisories, licenses, secrets, workflow linting, and `unsafe`

The job uses these checks.

- `cargo audit` and `cargo deny check`.
- Trivy filesystem scans for vulnerabilities and secrets (`vuln,secret`). The
  workflow uses the full commit SHA for the scanner action.
- `zizmor` checks `.github/workflows/`.
- `just geiger` gives an informational report on `unsafe` code.

### `vet` — locked supply-chain trust verification

The job uses `cargo vet --locked`. The command uses the reviewed
`supply-chain/imports.lock` and does not download new audit records.

## Pinning action versions and auditing workflows

For each GitHub Action, use the full 40-character commit SHA. Add a comment
with the version.

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
- uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
```

A person with access to an upstream action repository can move a tag such as
`@v1` or `@v0.36.0`. In March 2026, attackers moved more than 75 tags of the
Trivy actions to code that could steal credentials (`CVE-2026-33634`).
Workflows that used the affected tags started the malicious code. Workflows
with unaffected commit SHAs continued to use their original code.

To find the correct commit SHA, resolve the version tag in the action repository.

```bash
gh api repos/actions/checkout/commits/v7.0.1 --jq .sha
```

Use these workflow security controls.

- Enable the GitHub Actions policy that makes full commit SHAs mandatory.
- Limit which third-party actions and reusable workflows can operate.
- If the job does not push commits, set `persist-credentials: false` in `actions/checkout`.
  `zizmor` can report an absent setting under `artipacked`.
- Make sure that the actions support Node 24. GitHub removed Node 20 from its
  hosted runners in September 2026.
- Block access to secrets and write tokens from untrusted forks.
  `actions/checkout@v7` also blocks unsafe fork checkouts with the
  `pull_request_target` trigger.

## Records and scheduled checks

Pull request checks occur when code changes. A weekly `schedule` check can
find new RustSec advisories in a repository without recent changes. A new
advisory can also cause all open pull requests to fail. If necessary, put
the advisory scan in its own daily workflow. Record the response to each alert.

Keep release job logs, checksums, SBOMs, provenance attestations, and test
reports for the support or contractual period. Do not publish logs with
sensitive data or raw memory dumps as public artifacts.

## Further reading

- [GitHub Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [zizmor: static security analysis for GitHub Actions](https://docs.zizmor.sh/)
- [cargo-nextest in CI](https://nexte.st/docs/ci-features/)
- [cargo-semver-checks](https://github.com/obi1kenobi/cargo-semver-checks)
- [Swatinem/rust-cache](https://github.com/Swatinem/rust-cache)
- [taiki-e/install-action](https://github.com/taiki-e/install-action)
