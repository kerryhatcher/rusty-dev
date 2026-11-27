# Release Automation

Releases should be boring, deterministic, and cryptographically verifiable.
Automate version calculation, changelog generation, lockfile updates, crates.io
publishing, binary builds, SBOM generation, and provenance attestations—while
keeping an explicit human review gate on the Release PR. Every tag, crates.io
package, and binary artifact must come from a protected CI workflow, never from
a developer's laptop.

## Rust-native release automation with `release-plz`

[`release-plz`](https://release-plz.dev/) is the Rust-native release automation
tool built specifically around Cargo workspaces, [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/),
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
| `<type>!:` (or an API break caught by `cargo-semver-checks` in a Release PR) | Major (`x.0.0`, or minor on `0.x`) | `feat!: require structured Error return` |

Non-user-facing prefixes (`docs:`, `chore:`, `ci:`, `refactor:`, `test:`) do not
trigger a release on their own, **provided** `release-plz.toml` sets
`release_commits` (see [Configuration](#configuration-release-plztoml)). Without
that filter, `release-plz` updates a package on every commit and opens a Release
PR with a patch bump. Those commits still appear in the changelog. To ship a
dependency fix on its own (for example a security patch in a binary's
`Cargo.lock`), title the PR `fix(deps): …`.

Mark every breaking change with `!` in the commit header (`feat!:`,
`refactor(api)!:`), even though the specification also allows a
`BREAKING CHANGE:` footer alone. The `release_commits` pattern below is
anchored to the header, and with squash merges the footer never reaches `main`
anyway, so a footer-only breaking change can be released as a minor or patch
bump. A `!` in the header is the only marker this setup preserves. The CI
[`semver` job](ci-cd.md#semver--public-api-compatibility-libraries) fails any
PR that breaks the library's public API without `!` in its title. It cannot see
behavioral changes or CLI breaks in binaries, so reviewers should still check
for a missing `!`.

The full grammar (types, optional `(scope)`, `!`, and `BREAKING CHANGE:`
footers) is defined by the
[Conventional Commits 1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/#specification).

### Enforcing the convention

Version bumps and changelog entries are only as accurate as the commit messages
`release-plz` reads, so the convention has to be enforced, not just documented.
The simplest reliable setup has three parts:

1. **Squash-merge only, using the PR title as the whole commit message.** Then
   every commit on `main` is exactly one PR title, and the title is the only
   message to check. Contributors can write whatever they like on their
   branches.

   ```bash
   gh api -X PATCH repos/OWNER/REPO \
     -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
     -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK
   ```

   `BLANK` keeps the PR description out of the commit. A description that
   mentions `[skip ci]` would otherwise copy that marker onto `main` and make
   GitHub skip every push-triggered workflow for that commit, including the
   release workflow. It also means breaking changes must be marked with `!` in
   the title (`feat!: …`), because a `BREAKING CHANGE:` footer in the PR
   description never reaches the commit.

   These settings only choose the *default* message: whoever merges can still
   edit it in the merge dialog. Treat the merge dialog as part of review. On
   GitHub Enterprise Cloud, a ruleset **commit message pattern** restriction can
   also enforce the format on `main` itself.

2. **Check the PR title in CI.** This workflow uses no third-party actions and
   no token permissions:

   ```yaml
   # .github/workflows/pr-title.yml
   name: PR title

   on:
     pull_request:
       # `edited` re-runs the check when the title changes; `synchronize` keeps
       # the required check attached to the latest commit.
       types: [opened, edited, reopened, synchronize]
     # Required checks must also report on merge queue runs. The title was
     # already validated on the PR, so the job passes without a check there.
     # This is only safe with the queue's "Only merge non-failing pull
     # requests" setting enabled (see below).
     merge_group:

   permissions: {}

   jobs:
     pr-title:
       name: pr-title
       runs-on: ubuntu-latest
       steps:
         - name: Check PR title follows Conventional Commits
           if: github.event_name == 'pull_request'
           env:
             # Pass the title through an environment variable, never inline
             # `${{ }}` in the script, so a crafted title cannot inject shell.
             TITLE: ${{ github.event.pull_request.title }}
           run: |
             spec='See https://www.conventionalcommits.org/en/v1.0.0/'
             pattern='^(feat|fix|docs|chore|ci|refactor|test)(\([A-Za-z0-9._/-]+\))?!?: [^[:space:]].*$'
             if [[ ! "$TITLE" =~ $pattern ]]; then
               echo "::error title=PR title is not a Conventional Commit::Use '<type>[(scope)][!]: <description>', e.g. 'feat(cli): add --json output'. $spec"
               exit 1
             fi
             # The title becomes the commit on main; a skip marker there would
             # stop CI and the release workflow from running for that commit.
             skip='\[(skip ci|ci skip|no ci|skip actions|actions skip)\]'
             if [[ "${TITLE,,}" =~ $skip ]]; then
               echo "::error title=PR title contains a workflow skip marker::Remove it; it would skip CI and releases on main."
               exit 1
             fi
   ```

   Make `pr-title` a required status check in the branch ruleset (see
   [Project governance](governance.md#branch-and-tag-protection-with-github-rulesets)).
   If you use GitHub Merge Queue, enable **Only merge non-failing pull
   requests** in the queue's ruleset settings. Otherwise a PR whose title
   check failed can merge as part of a group, because the merge-group run
   does not re-check titles.

3. **Make bot PRs conform too.** `release-plz` titles its Release PRs
   `chore: release v…` (or `chore(<package>): release v…` when one package in
   a workspace is released), which already passes. Configure Dependabot's
   `commit-message` so its PRs do as well (see
   [Dependency management](dependencies.md#dependabot-with-grouping-and-cooldowns)).

Keep the type list in the pattern in sync with the one in `CONTRIBUTING.md` and
`AGENTS.md`. If you allow merge commits or rebase merges, every commit on the
branch lands on `main`, and you need a per-commit check (for example
[`commitlint`](https://commitlint.js.org/) or
[`cocogitto`](https://docs.cocogitto.io/)) instead of a title check.

### Configuration (`release-plz.toml`)

```toml
# release-plz.toml
[workspace]
changelog_update = true
dependencies_update = false     # Dependabot owns external dependency updates
git_release_enable = true       # Create GitHub Release when tag is published
git_release_draft = true        # Keep draft until binary/SBOM assets are uploaded (for immutable releases)
pr_labels = ["release"]
# Only features, fixes, and breaking changes (`type!:`) open a Release PR;
# other commits still reach the changelog.
release_commits = "^((feat|fix)[(!:]|[a-z]+(\\([^)]*\\))?!:)"
semver_check = true             # Run cargo-semver-checks when computing bumps

[[package]]
name = "my-crate"
git_tag_name = "v{{ version }}"
```

### Rules to preserve clean automation

- **Never hand-edit `version` in `Cargo.toml` or `CHANGELOG.md`.** Merge the
  automated Release PR when you are ready to ship.
- **Merge the Release PR only when it is current.** `release-plz release`
  publishes whatever is on `main` after the merge, not the tree that was
  reviewed in the Release PR. If another PR merges after the Release PR was
  last regenerated, that change ships under a version number and changelog that
  were computed without it (for example, a breaking change released as a minor
  bump). The `release-pr` job regenerates the Release PR on every push to
  `main`, so before merging:
  - Wait for the `release-pr` run for the latest `main` commit to finish, then
    re-review the version and changelog it produced.
  - Never click **Update branch** on the Release PR. That merges `main` into it
    without recomputing the version or changelog. Let `release-plz` regenerate
    it instead.
  - Keep **Require branches to be up to date** enabled (see
    [Project governance](governance.md#branch-and-tag-protection-with-github-rulesets)),
    so a Release PR built on an older `main` cannot merge.
  - With a merge queue, add the Release PR only when no other PR is queued:
    the queue would otherwise merge it on top of PRs it was not computed
    from.
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
    # Serialize Release PR updates so a slower run never overwrites a newer one.
    concurrency:
      group: release-plz-${{ github.ref }}
      cancel-in-progress: false
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
      - uses: actions/create-github-app-token@f418cff399f7aef4c2f0ad47e25ca7a6abbdd6fc # v3.4.0
        id: app-token
        with:
          client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}
          private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
          # Scope the token below the App's installation permissions:
          # release-pr pushes the release branch and opens/updates the PR.
          permission-contents: write
          permission-pull-requests: write
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
      - uses: actions/create-github-app-token@f418cff399f7aef4c2f0ad47e25ca7a6abbdd6fc # v3.4.0
        id: app-token
        with:
          client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}
          private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
          # release pushes tags and GitHub Releases; it only reads PRs (to
          # find the merged Release PR and credit contributors).
          permission-contents: write
          permission-pull-requests: read
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

Request only the permissions each job needs with the action's `permission-*`
inputs. Without them, the token inherits every permission the App installation
has, and `zizmor` reports it as a high-severity
[`github-app`](https://docs.zizmor.sh/audits/#github-app) finding. Configure
the App itself with **Contents** and **Pull requests** read & write, the
minimum `release-plz` documents; the inputs then narrow each job's token
further.

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
- [Conventional Commits 1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/)
- [cargo-auditable documentation](https://github.com/rust-secure-code/cargo-auditable)
- [cargo-cyclonedx](https://github.com/CycloneDX/cyclonedx-rust-cargo) & [cargo-sbom](https://crates.io/crates/cargo-sbom)
- [CISA Software Bill of Materials (SBOM) resources](https://www.cisa.gov/sbom)
- [GitHub Artifact Attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
