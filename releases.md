# Release Automation

Releases should be boring, deterministic, and cryptographically verifiable.
Automate version calculation, changelog generation, lockfile updates, crates.io
publishing, binary builds, SBOM generation, and provenance attestations—while
keeping an explicit human review gate on the Release PR. Every tag, crates.io
package, and binary artifact must come from a protected CI workflow, never from
a developer's laptop.

## Rust-native release automation with `release-plz`

[`release-plz`](https://release-plz.dev/) is the Rust-native release automation
tool built specifically around Cargo workspaces, [Conventional Commits](https://www.conventionalcommits.org),
and [`cargo-semver-checks`](https://github.com/obi1kenobi/cargo-semver-checks).

Unlike generic language-agnostic release bots, `release-plz`:

1. **Combines Conventional Commits with `cargo-semver-checks`** — even if a PR
   was labeled `fix:` or `feat:`, if `cargo-semver-checks` detects an accidental
   public API break in a library crate, `release-plz` computes a semver-safe
   breaking version bump automatically and notes the API break in the PR.
2. **Updates `Cargo.lock` *inside* the Release PR** — `Cargo.toml`,
   `Cargo.lock`, and `CHANGELOG.md` are all updated and tested on the Release PR
   *before* merging, so the tagged release commit is clean and never requires
   post-tag lockfile mutation.
3. **Supports crates.io OIDC Trusted Publishing natively** — exchanges GitHub's
   short-lived OIDC token directly with crates.io without storing a long-lived
   `CARGO_REGISTRY_TOKEN` secret.

### Commit conventions

| Prefix | Typical Bump | Example |
|--------|--------------|---------|
| `fix:` | Patch (`0.1.x` / `1.0.x`) | `fix: degrade wrong-typed JSON fields to None` |
| `feat:` | Minor (`1.x.0`) | `feat: add TOML config file support` |
| `feat!:` / `BREAKING CHANGE:` (or API break caught by `cargo-semver-checks`) | Major (`x.0.0`, or minor on `0.x`) | `feat!: require structured Error return` |

Non-user-facing prefixes (`docs:`, `chore:`, `ci:`, `refactor:`, `test:`) do not
trigger a release on their own.

### Configuration (`release-plz.toml`)

```toml
# release-plz.toml
[workspace]
changelog_update = true
dependencies_update = false     # Dependabot owns external dependency updates
git_release_enable = true       # Create GitHub Release when tag is published
git_release_draft = true        # Keep draft until binary/SBOM assets are uploaded (for immutable releases)
pr_labels = ["release"]
semver_check = true             # Run cargo-semver-checks when computing bumps

[[package]]
name = "my-crate"
git_tag_name = "v{{ version }}"
```

### Rules to preserve clean automation

- **Never hand-edit `version` in `Cargo.toml` or `CHANGELOG.md`.** Merge the
  automated Release PR when you are ready to ship.
- **Bootstrap `0.1.0` once manually.** Crates.io requires the very first release
  of a brand-new crate name to be published manually so you can configure
  Trusted Publishing settings on crates.io; every subsequent release runs
  hands-free via OIDC.

## Crates.io OIDC Trusted Publishing setup

Before automating releases, configure **Trusted Publishing** on crates.io so no
long-lived crates.io API token is stored in GitHub Secrets:

1. Open your crate on [crates.io](https://crates.io) → **Settings** → **Trusted
   Publishing**.
2. Add a GitHub configuration specifying your **Repository owner**, **Repository
   name**, **Workflow filename** (`release.yml`), and **Environment**
   (`release`).
3. Create a matching protected `release` environment in GitHub (**Settings →
   Environments**) restricted to the `main` branch (and optional required
   reviewers).

*(Note: If you ever maintain a custom workflow that invokes `cargo publish`
directly instead of `release-plz`, use the official
`rust-lang/crates-io-auth-action@3268eb413133e2960fa4ae0e963ca76380c54cd9 # v1.0.6`
to exchange the OIDC JWT for a temporary `CARGO_REGISTRY_TOKEN`.)*

## The release workflow (`.github/workflows/release.yml`)

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  # Opens or updates the Release PR on every merge to main.
  release-pr:
    name: release-pr
    if: ${{ !startsWith(github.event.head_commit.message, 'chore(release):') }}
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
        with:
          toolchain: stable
      - uses: actions/create-github-app-token@f418cffdfd93fef6b8c199859f5f0b5d0bf93c4b # v3.4.0
        id: app-token
        with:
          client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}
          private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
      - name: Update Release PR
        uses: release-plz/action@66b324fd6c72d05d2a08568492ecdd62bfb8a62b # v0.5.148
        with:
          command: release-pr
        env:
          GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}

  # Publishes to crates.io via OIDC and creates the Git tag/GitHub Release
  # when a Release PR is merged to main.
  release:
    name: release
    runs-on: ubuntu-latest
    environment: release
    outputs:
      releases_created: ${{ steps.rp.outputs.releases_created }}
      releases: ${{ steps.rp.outputs.releases }}
    permissions:
      contents: write
      id-token: write # Required for crates.io OIDC Trusted Publishing
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
        with:
          toolchain: stable
      - uses: actions/create-github-app-token@f418cffdfd93fef6b8c199859f5f0b5d0bf93c4b # v3.4.0
        id: app-token
        with:
          client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}
          private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
      - name: Release crates and tag
        id: rp
        uses: release-plz/action@66b324fd6c72d05d2a08568492ecdd62bfb8a62b # v0.5.148
        with:
          command: release
        env:
          GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}
          # Do NOT set CARGO_REGISTRY_TOKEN — release-plz uses OIDC automatically.
```

### Why use a dedicated GitHub App token?

Commits, PRs, and tags created with the default `GITHUB_TOKEN` do not trigger
CI checks on the Release PR or downstream tag workflows. Minting a short-lived
installation token via `actions/create-github-app-token@v3` from a minimally
scoped GitHub App ensures the Release PR runs full CI before merge and any
tag-triggered jobs fire reliably.

## Cross-platform binary builds and `cargo-auditable`

When shipping precompiled CLI or service binaries alongside crates.io releases,
build on current native GitHub-hosted runners (`macos-14` is retired):

```yaml
  build-binaries:
    name: build (${{ matrix.target }})
    needs: release
    if: ${{ needs.release.outputs.releases_created == 'true' }}
    runs-on: ${{ matrix.runner }}
    permissions:
      contents: write
      id-token: write
      attestations: write
      artifact-metadata: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - runner: ubuntu-22.04
            target: x86_64-unknown-linux-gnu
            archive_ext: tar.gz
          - runner: ubuntu-22.04-arm
            target: aarch64-unknown-linux-gnu
            archive_ext: tar.gz
          - runner: macos-15
            target: aarch64-apple-darwin
            archive_ext: tar.gz
          - runner: windows-latest
            target: x86_64-pc-windows-msvc
            archive_ext: zip
          - runner: windows-11-arm
            target: aarch64-pc-windows-msvc
            archive_ext: zip
```

### Platform & libc notes

- **Linux glibc compatibility:** Building GNU binaries on `ubuntu-22.04` links
  against an older `glibc` than `ubuntu-24.04`, allowing the resulting binary to
  run across older enterprise Linux distributions. For completely static Linux
  binaries with zero `glibc` coupling, target `x86_64-unknown-linux-musl` and
  `aarch64-unknown-linux-musl`.
- **Intel macOS (`x86_64-apple-darwin`):** Demoted to **Tier 2** in Rust 1.90
  (the Rust project still builds standard-library artifacts for it, but no
  longer runs automated test suites on Intel macOS). If you still ship it by
  cross-compiling from `macos-15`, state its Tier-2 support level in `README.md`.
- **Turnkey installers:** Pair `release-plz` with [`dist`](https://github.com/axodotdev/cargo-dist)
  (formerly `cargo-dist`) if you want generated shell/PowerShell installers,
  Homebrew formulas, or MSI packages automatically.

### Embedding the dependency graph with `cargo-auditable`

Compile every shipped binary with [`cargo-auditable`](https://github.com/rust-secure-code/cargo-auditable):

```bash
cargo auditable build --release --locked --target "${{ matrix.target }}"
```

`cargo-auditable` embeds a compressed dependency manifest into a dedicated
binary section (`dep-v0`), enabling `cargo audit bin`, Trivy, Grype, and
OSV-Scanner to audit deployed executables directly without source code or
`Cargo.lock`.

## Packaging, checksums, SBOMs, and SLSA provenance

Archive each binary alongside `README.md`, `LICENSE-MIT`, and `LICENSE-APACHE`,
then publish verification artifacts that satisfy enterprise and government
consumers:

```bash
# 1. Deterministic SHA-256 checksum manifest across all release archives
sha256sum my-crate-*.tar.gz my-crate-*.zip > SHA256SUMS

# 2. Source-time CycloneDX SBOM scoped to shipped binary targets (omits dev-deps)
cargo cyclonedx --format json --describe binaries

# (Optional) SPDX 2.3 JSON SBOM for multi-crate workspaces
cargo sbom --output-format spdx_json_2_3 > my-crate.spdx.json
```

### Meeting CISA's 2026 Minimum Elements for an SBOM

Under **CISA's July 2026 Minimum Elements for a Software Bill of Materials**,
consumers expect machine-readable SBOMs to include **component hashes**,
**component licenses**, **SBOM tool metadata**, **transitive coverage**, and
**generation context**. Generate SBOMs from the exact `--locked` release tree,
state the target triple and Cargo feature set in release notes, and attach both
the SBOM and `SHA256SUMS` to the GitHub Release.

### Cryptographic build provenance attestations and immutable releases

Bind every release archive and SBOM to your repository, commit SHA, and release
workflow identity using `actions/attest@v4` (note `actions/attest-build-provenance@v4`
is now a thin wrapper around `actions/attest`):

```yaml
      - name: Attest release artifacts
        uses: actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6 # v4.2.2
        with:
          subject-path: dist/my-crate-*
```

Enable **Immutable Releases** in your GitHub repository settings (**Settings →
General → Releases → Enable release immutability**). Once a release is
published, neither its Git tag nor its uploaded binary assets can be modified or
swapped—even if a token is later compromised (immutable releases are why
`trivy-action` `v0.35.0` survived the March 2026 tag-poisoning attack
untouched). Because assets cannot be added after publication, keep
`git_release_draft = true` in `release-plz.toml`, upload all platform archives,
SBOMs, and `SHA256SUMS` to the draft release, and flip the release out of draft
as the final job step (`gh release edit "$TAG" --draft=false`).

Document the exact verification commands for adopters in `README.md` or release
notes:

```bash
sha256sum --check SHA256SUMS
gh release verify v0.2.0 --repo YOUR_ORGANIZATION/YOUR_REPOSITORY
gh attestation verify ./my-crate-0.2.0-x86_64-unknown-linux-gnu.tar.gz \
  --owner YOUR_ORGANIZATION \
  --signer-workflow YOUR_ORGANIZATION/YOUR_REPOSITORY/.github/workflows/release.yml
```

## Further reading

- [release-plz documentation](https://release-plz.dev/)
- [crates.io Trusted Publishing (OIDC) guide](https://crates.io/docs/trusted-publishing)
- [Conventional Commits specification](https://www.conventionalcommits.org)
- [cargo-auditable documentation](https://github.com/rust-secure-code/cargo-auditable)
- [cargo-cyclonedx](https://github.com/CycloneDX/cyclonedx-rust-cargo) & [cargo-sbom](https://crates.io/crates/cargo-sbom)
- [CISA Software Bill of Materials (SBOM) resources](https://www.cisa.gov/sbom)
- [GitHub Artifact Attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
