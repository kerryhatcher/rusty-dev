# Release Automation

Releases should be boring and verifiable. Automate the mechanical work, but
retain an explicit, accountable approval for a production release. Every tag,
GitHub release, binary artifact, and crates.io publish should be produced by
the protected release workflow—not by a developer's laptop.

## Conventional Commits

[Conventional Commits](https://www.conventionalcommits.org) is the foundation
of automated releases. Every commit message follows a structured format:

```
feat: add config file and JSONL logging
fix: degrade unexpectedly-typed JSON fields to None
docs: update README with installation instructions
chore: bump cargo-deny to 0.18.0
ci: add macOS to the test matrix
refactor: extract config parsing into its own module
test: add edge-case tests for empty payload
```

The prefix determines the version bump:

| Prefix | Bump | Example |
|--------|------|---------|
| `fix:` | Patch (0.0.x) | Bug fixes |
| `feat:` | Minor (0.x.0) | New features |
| `feat!:` or `BREAKING CHANGE:` | Major (x.0.0) | Breaking changes |

Other prefixes (`docs:`, `chore:`, `ci:`, `refactor:`, `test:`) do not
trigger a release.

Before 1.0, Cargo treats `0.x` minor bumps as breaking. Set
`"bump-minor-pre-major": true` (and optionally `"bump-patch-for-minor-pre-major": true`)
in the release-please config so a breaking change on `0.3.x` produces `0.4.0`
rather than jumping straight to `1.0.0`.

## release-please

[release-please](https://github.com/googleapis/release-please) automates the
release process. It maintains a **release PR** that is updated on every merge
to `main`. When the release PR is merged, it:

1. Creates a Git tag (`v0.3.0`).
2. Creates a GitHub Release with auto-generated release notes.
3. Triggers downstream workflows (binary builds, crates.io publish).

### Configuration

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "rust",
  "include-component-in-tag": false,
  "include-v-in-tag": true,
  "bump-minor-pre-major": true,
  "packages": {
    ".": {
      "release-type": "rust",
      "package-name": "my-crate"
    }
  }
}
```

```json
{
  ".": "0.1.0"
}
```

### What release-please does

- **Derives the version** from commit messages since the last release.
- **Updates `Cargo.toml` and `Cargo.lock`** — bumps the `version` field and
  the workspace crate's entry in the lockfile, so `--locked` builds of the
  release commit succeed without a manual sync step.
- **Updates `CHANGELOG.md`** — appends a new changelog section.
- **Opens/updates a release PR** — a single PR that accumulates changes until
  you decide to merge it.
- **Creates the tag and release** — when the release PR is merged.

### What you must never do

- **Never hand-edit the `version` field in `Cargo.toml`.** Release automation
  owns it. If you edit it manually, the next release will conflict.
- **Never hand-edit `CHANGELOG.md`.** The changelog is auto-generated from
  commit messages. Hand-edits will be overwritten.

## The release workflow

```yaml
name: release-please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    name: release-please
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.rp.outputs.release_created }}
      tag_name: ${{ steps.rp.outputs.tag_name }}
    steps:
      # Pin both actions by full commit SHA in a real workflow.
      - uses: actions/create-github-app-token@v3
        id: app-token
        with:
          client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}
          private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
      - id: rp
        uses: googleapis/release-please-action@v5
        with:
          token: ${{ steps.app-token.outputs.token }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

### Why a GitHub App token?

The default `GITHUB_TOKEN` cannot trigger other workflows. Using a GitHub App
token ensures that when release-please creates a tag, the downstream build
and publish workflows actually run.

Use a dedicated GitHub App with only the permissions it needs. Keep its
private key in a protected release environment, restrict who may approve that
environment, and record the release approver. `create-github-app-token` v3
takes the app's **Client ID** (`client-id`); the older `app-id` input is
deprecated. Never expose publish credentials to pull-request workflows.

## Cross-platform binary builds

After the release is created, build binaries for every target platform:

```yaml
build:
  name: build (${{ matrix.target }})
  needs: release-please
  if: ${{ needs.release-please.outputs.release_created == 'true' }}
  runs-on: ${{ matrix.runner }}
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

Building on `ubuntu-22.04` links against an older glibc, so the Linux
binaries run on more distributions; for fully static Linux binaries, build
`*-unknown-linux-musl` targets instead. `x86_64-apple-darwin` (Intel macOS)
was demoted to Tier 2 in Rust 1.90; it still builds (cross-compile from an
Apple Silicon runner with `rustup target add x86_64-apple-darwin`), but the
Rust project no longer runs its test suite on it. Say so in your
platform-support policy if you ship it.

[`dist`](https://github.com/axodotdev/cargo-dist) (formerly `cargo-dist`)
can generate this matrix, the archives, checksums, installers, and
attestations for you if you would rather not maintain the workflow by hand.

### Embedding the dependency tree with `cargo-auditable`

Use [`cargo-auditable`](https://github.com/rust-secure-code/cargo-auditable)
to embed the resolved dependency tree into the compiled binary:

```bash
cargo auditable build --release --locked --target ${{ matrix.target }}
```

This enables tools like `cargo audit` to scan the binary for known
vulnerabilities without access to the source code or `Cargo.lock`.

## Publishing to crates.io

Use **crates.io Trusted Publishing** (available since July 2025) instead of a
long-lived API token. The workflow exchanges a GitHub OIDC token for a
short-lived crates.io token, which the action revokes when the job ends.
Nothing long-lived is stored in repository secrets.

```yaml
publish-crate:
  name: cargo publish
  needs: [release-please, build]
  if: ${{ needs.release-please.outputs.release_created == 'true' }}
  runs-on: ubuntu-latest
  environment: release  # protected environment with required reviewers
  permissions:
    contents: read
    id-token: write     # required for the OIDC exchange
  steps:
    - uses: actions/checkout@v7
      with:
        persist-credentials: false
    - uses: dtolnay/rust-toolchain@stable
    - uses: rust-lang/crates-io-auth-action@v1
      id: auth
    - name: Publish to crates.io
      env:
        CARGO_REGISTRY_TOKEN: ${{ steps.auth.outputs.token }}
      run: cargo publish --locked
```

### Setting up Trusted Publishing

1. Publish the first version manually (crates.io needs the crate to exist).
2. On crates.io, open the crate's settings page and add a trusted
   GitHub publisher: repository owner, repository name, workflow filename,
   and the environment name (`release` above).
3. Delete any old `CARGO_REGISTRY_TOKEN` secret and revoke the token on
   crates.io. Optionally, enable the crate setting that requires Trusted
   Publishing for all new versions.

Trusted Publishing is refused for `pull_request_target` and `workflow_run`
triggers. If you must use an API token (for example from a non-GitHub CI),
scope it to `publish-update` for the specific crate, give it an expiry, and
store it only in a protected environment.

## Packaging release artifacts

```bash
# Unix
VERSION="${TAG_NAME#v}"
STAGE="my-crate-${VERSION}-${TARGET}"
mkdir -p "$STAGE"
cp "target/$TARGET/release/my-crate" "$STAGE/"
cp README.md LICENSE-MIT LICENSE-APACHE "$STAGE/"
tar -czf "${STAGE}.tar.gz" "$STAGE"

# Windows
$VERSION = "${env:TAG_NAME}".TrimStart("v")
$STAGE = "my-crate-$VERSION-$TARGET"
New-Item -ItemType Directory -Path $STAGE | Out-Null
Copy-Item "target/$TARGET/release/my-crate.exe" -Destination $STAGE
Copy-Item README.md,LICENSE-MIT,LICENSE-APACHE -Destination $STAGE
Compress-Archive -Path $STAGE -DestinationPath "$STAGE.zip"
```

## Checksums, SBOM, and provenance

A release is not complete when it is uploaded. Publish the evidence users
need to verify what they downloaded:

```bash
# Generate a deterministic checksum manifest for every release asset.
sha256sum my-crate-*.tar.gz my-crate-*.zip > SHA256SUMS

# Produce a CycloneDX SBOM for the release workspace/feature set.
cargo cyclonedx --format json --describe binaries
```

Generate the SBOM in the release build, upload it with the artifacts, and
state which target and Cargo features it describes. `cargo-cyclonedx` can use
Cargo metadata as well as the lockfile and can omit development dependencies,
which makes it more useful than a lockfile-only report for a shipped binary.

For GitHub-hosted releases, generate an artifact attestation after building
each binary. It cryptographically binds the artifact digest to the repository,
commit, and workflow identity. This is provenance—not a guarantee that the
artifact has no vulnerability.

```yaml
permissions:
  contents: read
  id-token: write
  attestations: write
  artifact-metadata: write

# Pin the action to a reviewed full commit SHA in a real workflow.
- name: Attest release artifact
  uses: actions/attest@v4
  with:
    subject-path: dist/my-crate-*
```

Tell users how to verify the provenance and checksum, including the expected
repository owner and release workflow:

```bash
sha256sum --check SHA256SUMS
gh attestation verify ./my-crate --owner YOUR_ORGANIZATION \
  --signer-workflow YOUR_ORGANIZATION/YOUR_REPOSITORY/.github/workflows/release.yml
```

`actions/attest` is the current action; `actions/attest-build-provenance` v4
is now only a wrapper around it. Pin the selected action by full SHA and test
the verification command before documenting it as a release guarantee.

Also enable **immutable releases** for the repository. Once a release is
published, its tag and assets cannot be changed or replaced, so a stolen token
cannot swap a binary after users have verified it. Immutable releases are why
`trivy-action` v0.35.0 survived the March 2026 tag hijack untouched.
Immutability applies when a release is *published*, so upload every asset
first. With release-please, set `"draft": true` together with
`"force-tag-creation": true` (GitHub does not create the tag for a draft, and
without it release-please cannot find the previous release), let the build
jobs attach artifacts to the draft, then publish it as the final step
(`gh release edit "$TAG" --draft=false`). Verify a published release with
`gh release verify <tag>`.

## Further reading

- [Conventional Commits specification](https://www.conventionalcommits.org)
- [release-please documentation](https://github.com/googleapis/release-please)
- [cargo-auditable documentation](https://github.com/rust-secure-code/cargo-auditable)
- [crates.io publishing guide](https://doc.rust-lang.org/cargo/reference/publishing.html)
- [crates.io Trusted Publishing](https://crates.io/docs/trusted-publishing) / [crates-io-auth-action](https://github.com/rust-lang/crates-io-auth-action)
- [actions/attest](https://github.com/actions/attest)
- [GitHub: immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
- [cargo-cyclonedx documentation](https://docs.rs/cargo-cyclonedx/)
- [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
- [GitHub: verify attestations from a reusable workflow](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/increase-security-rating)
