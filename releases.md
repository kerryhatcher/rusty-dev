# Release Automation

Use a protected continuous integration (CI) workflow to create each release
tag, crates.io package, and binary. The workflow calculates the version,
generates the changelog, and updates the lockfile. It builds binaries,
publishes the crate, and generates an SBOM and provenance attestations.
A person must review the release pull request before the merge.

## Release automation with `release-plz`

[`release-plz`](https://release-plz.dev/) supports Cargo workspaces. It uses
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) and
[`cargo-semver-checks`](https://github.com/obi1kenobi/cargo-semver-checks).

1. If `cargo-semver-checks` finds an incompatible change in a public API,
   `release-plz` selects the version for an incompatible change. It records
   the API change in the release pull request. This also applies when the
   original pull request title uses `fix:` or `feat:`.
2. `release-plz` updates `Cargo.toml`, `Cargo.lock`, and `CHANGELOG.md` in the
   release pull request. CI checks these files before the merge. The release
   tag then points to a commit that already contains the new lockfile.
3. `release-plz` supports crates.io OIDC Trusted Publishing. It exchanges a
   temporary GitHub OIDC token with crates.io. It does not store a long-term
   `CARGO_REGISTRY_TOKEN` secret.

### Commit conventions

| Prefix | Usual version change | Example |
|--------|----------------------|---------|
| `fix:` | Patch (`0.1.x` or `1.0.x`) | `fix: degrade wrong-typed JSON fields to None` |
| `feat:` | Minor (`1.x.0`) | `feat: add TOML config file support` |
| `<type>!:` | Major (`x.0.0`), or minor for `0.x`. A release check that finds an incompatible API change gives the same result. | `feat!: require structured Error return` |

Set `release_commits` in `release-plz.toml`. With this filter, a commit with
`docs:`, `chore:`, `ci:`, `refactor:`, or `test:` enters the changelog.
That commit cannot cause a release pull request by itself. Without the filter,
`release-plz` updates the package for each commit and opens a release pull
request for a patch release. To publish a dependency fix in its own release, use
`fix(deps): …` in the pull request title. For example, use this type for a
security fix in a binary's `Cargo.lock`.

Add `!` to the commit header for each incompatible change. Examples are
`feat!:` and `refactor(api)!:`. Conventional Commits also permits a
`BREAKING CHANGE:` footer. In this configuration, `release_commits` reads
the header. The squash merge does not copy the footer to `main`. A footer
alone can cause an incorrect minor or patch release.

The CI [`semver` job](ci-cd.md#semver--public-api-compatibility-libraries)
fails if it finds an incompatible API change and the title lacks `!`.
The job can miss some changes to parameters or return types. It does not
check changes in behavior or in the command-line interface. Review those
changes for the necessary `!` marker.

For the complete format, refer to the
[Conventional Commits 1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/#specification).

### Enforcing the convention

`release-plz` uses the commit messages to calculate versions and generate
the changelog. Apply these controls to make the commit messages agree with
Conventional Commits.

1. Enable squash merges only. Use only the pull request title in the
   commit message. Each commit on `main` then uses the title that CI checks.

   If the latest branch commit has `[skip ci]`, GitHub skips the
   `pull_request` workflows. The mandatory `pr-title` check gives no result.
   To start the check again, push a commit without that marker.
   `zizmor` can report a security issue if you use `pull_request_target`.

   ```bash
   gh api -X PATCH repos/OWNER/REPO \
     -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
     -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK
   ```

   `BLANK` keeps the pull request description out of the commit. A
   `[skip ci]` marker can stop the workflows for a push to `main` if the
   marker becomes part of the commit. This includes the release workflow. Thus,
   use `!` in the title to mark an incompatible change. The squash merge
   does not copy a `BREAKING CHANGE:` footer from the description.

   GitHub uses these settings to set the default message in the merge dialog.
   Review the message before you merge. On GitHub Enterprise Cloud, you can
   also enforce the format on `main` with the **commit message pattern**
   restriction in a ruleset.

2. Check the pull request title in CI. This workflow uses no third-party
   actions and has no token permissions.

   ```yaml
   # .github/workflows/pr-title.yml
   name: PR title

   on:
     pull_request:
       # The edited event starts the check again after a title change.
       # The synchronize event starts the check for the latest commit.
       types: [opened, edited, reopened, synchronize]
     # Mandatory checks must report a result to the merge queue.
     # The job reports success because CI checks each pull request title.
     # In queue settings, enable "Only merge non-failing pull requests".
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
             # Read the title from an environment variable.
             # Do not insert the title into shell code.
             TITLE: ${{ github.event.pull_request.title }}
           run: |
             spec='See https://www.conventionalcommits.org/en/v1.0.0/'
             pattern='^(feat|fix|docs|chore|ci|refactor|test)(\([A-Za-z0-9._/-]+\))?!?: [^[:space:]].*$'
             if [[ ! "$TITLE" =~ $pattern ]]; then
               echo "::error title=PR title is not a Conventional Commit::Use '<type>[(scope)][!]: <description>', e.g. 'feat(cli): add --json output'. $spec"
               exit 1
             fi
             # The title becomes the commit message on main.
             # A skip marker in the message can stop CI and release workflows.
             skip='\[(skip ci|ci skip|no ci|skip actions|actions skip)\]'
             if [[ "${TITLE,,}" =~ $skip ]]; then
               echo "::error title=PR title contains a workflow skip marker::Remove it; it would skip CI and releases on main."
               exit 1
             fi
   ```

   Make `pr-title` a mandatory check in the branch ruleset. Refer to
   [Project governance](governance.md#branch-and-tag-protection-with-github-rulesets).
   If you use GitHub Merge Queue, enable **Only merge non-failing pull requests**.
   Otherwise, a pull request with a failed title check can merge in a group.
   The merge-group workflow does not check the titles again.

3. Configure automated pull request titles. `release-plz` uses
   `chore: release v…` or `chore(<package>): release v…` for one package in
   a workspace. The check accepts the two formats. Set the Dependabot
   `commit-message` option. Refer to
   [Dependabot groups and minimum publication age](dependencies.md#dependabot-groups-and-minimum-publication-age).

Use the same types in the pattern, `CONTRIBUTING.md`, and `AGENTS.md`.
With merge commits or rebase merges, each branch commit becomes part of
`main`. If you permit these merges, check each commit message with a tool
such as [`commitlint`](https://commitlint.js.org/) or
[`cocogitto`](https://docs.cocogitto.io/).

### Configuration (`release-plz.toml`)

```toml
# release-plz.toml
[workspace]
changelog_update = true
dependencies_update = false     # Dependabot updates external dependencies.
git_release_enable = true       # Create a GitHub release when the job publishes the tag.
git_release_draft = true        # Keep a draft until you upload the binaries and SBOMs.
pr_labels = ["release"]
# Open release pull requests for features, fixes, and incompatible changes (type!:).
# Other commits enter the changelog.
release_commits = "^((feat|fix)[(!:]|[a-z]+(\\([^)]*\\))?!:)"
semver_check = true             # Use cargo-semver-checks to calculate new versions.

[[package]]
name = "my-crate"
git_tag_name = "v{{ version }}"
```

### Release pull request procedure

Do not manually edit `version` in `Cargo.toml`. Do not manually edit
`CHANGELOG.md`. The release pull request updates the files.

After a release pull request merges, `release-plz release` publishes the
code on `main`. The `release-pr` job updates the release pull request
after each push to `main`. If a change merges after the job, the version
and changelog can omit that change. For example, an incompatible change
could enter a minor release.

> **Caution.** Do not select **Update branch** on the release pull request.
> This control merges `main` into the pull request without a new version
> calculation or changelog. Let `release-plz` update the release pull request.

1. Make sure that **Require branches to be up to date** is active. Refer to
   [Project governance](governance.md#branch-and-tag-protection-with-github-rulesets).
2. Wait for the `release-pr` job for the latest `main` commit to complete.
3. Examine the new version and changelog.
4. If you use a merge queue, add the release pull request only when the queue is empty.
   Other pull requests in the queue can add changes that the release job did
   not use to calculate the version.
5. When the release pull request is current, merge it.

### First crate release

Publish the first release of a new crate name manually. For example, publish
`0.1.0`. You can then configure Trusted Publishing on crates.io. Later
releases use OIDC.

## Crates.io OIDC Trusted Publishing setup

Configure **Trusted Publishing** before you automate releases. This procedure lets the workflow publish without a long-term crates.io API token.

1. Open the crate page on [crates.io](https://crates.io).
2. Select **Settings**.
3. Select **Trusted Publishing**.
4. Add a GitHub configuration.
5. Set **Repository owner** to the GitHub repository owner.
6. Set **Repository name** to the GitHub repository name.
7. Set **Workflow filename** to `release.yml`.
8. Set **Environment** to `release`.
9. In the GitHub repository settings, open **Environments**.
10. Create a protected environment with the name `release`.
11. Limit deployments to the `main` branch.
12. If reviewers are necessary, add the reviewers to the environment.

If a custom workflow uses `cargo publish` directly, use
`rust-lang/crates-io-auth-action@3268eb413133e2960fa4ae0e963ca76380c54cd9`.
This action exchanges the OIDC JWT for a temporary `CARGO_REGISTRY_TOKEN`.

## The release workflow (`.github/workflows/release.yml`)

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  # Open or update the release pull request after each merge to main.
  release-pr:
    name: release-pr
    if: ${{ !startsWith(github.event.head_commit.message, 'chore(release):') }}
    # Update one release pull request at a time. The job checks for the latest commit.
    concurrency:
      group: release-plz-${{ github.ref }}
      cancel-in-progress: false
      # Keep each pending job in the queue. Thus, a new job cannot replace a pending job.
      # actionlint 1.7.12 and earlier do not recognize queue (rhysd/actionlint#654).
      queue: max
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
          # Give the token only the permissions for the release branch and pull request.
          permission-contents: write
          permission-pull-requests: write
      # Jobs can operate in a different sequence from pushes.
      # If main has a newer commit, skip this job.
      # The job for the latest commit updates the release pull request.
      - name: Check this run is for the latest main commit
        id: fresh
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}
          RUN_SHA: ${{ github.sha }}
        run: |
          head=$(gh api "repos/$REPO/commits/main" --jq .sha)
          if [ "$head" = "$RUN_SHA" ]; then latest=true; else latest=false; fi
          echo "latest=$latest" >> "$GITHUB_OUTPUT"
      - name: Update Release PR
        if: steps.fresh.outputs.latest == 'true'
        uses: release-plz/action@66b324fd6c72d05d2a08568492ecdd62bfb8a62b # v0.5.148
        with:
          command: release-pr
        env:
          GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}

  # After a release pull request merges to main, publish to crates.io with OIDC.
  # Create the Git tag and GitHub release.
  release:
    name: release
    runs-on: ubuntu-latest
    environment: release
    outputs:
      releases_created: ${{ steps.rp.outputs.releases_created }}
      releases: ${{ steps.rp.outputs.releases }}
    permissions:
      contents: write
      id-token: write # crates.io Trusted Publishing uses this permission.
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
          # The release job publishes Git tags and GitHub releases.
          # It reads pull requests to find the release and identify contributors.
          permission-contents: write
          permission-pull-requests: read
      - name: Release crates and tag
        id: rp
        uses: release-plz/action@66b324fd6c72d05d2a08568492ecdd62bfb8a62b # v0.5.148
        with:
          command: release
        env:
          GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}
          # Do not set CARGO_REGISTRY_TOKEN. release-plz uses OIDC automatically.
```

### GitHub App token for the release workflow

Commits, pull requests, and tags from the default `GITHUB_TOKEN` do not
start the specified CI or tag workflows. Use
`actions/create-github-app-token@v3` to get a temporary installation token.
The token lets CI check the release pull request before the merge. It also
lets a new release tag start applicable workflows.

Give the GitHub App read and write access to **Contents** and **Pull requests**.
These are the minimum permissions for the app in the `release-plz` configuration.
For each job, select only the necessary permissions with the `permission-*` inputs.
If you omit these inputs, the token gets all permissions of the app installation.
`zizmor` reports this condition under [`github-app`](https://docs.zizmor.sh/audits/#github-app).

## Cross-platform binary builds and `cargo-auditable`

If you publish compiled command-line or service binaries, use current native GitHub-hosted runners.
GitHub no longer provides `macos-14`.

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

### Target platforms and libraries

- GNU binaries from `ubuntu-22.04` link to an earlier version of `glibc`
  than binaries from `ubuntu-24.04`. This can make the binaries compatible
  with earlier Linux distributions. For static Linux binaries without
  `glibc`, use `x86_64-unknown-linux-musl` or `aarch64-unknown-linux-musl`.
- Rust moved Intel macOS (`x86_64-apple-darwin`) to Tier 2 in Rust 1.90.
  The Rust project builds standard library files for this target. The
  project no longer does automated tests on Intel macOS. If you build for
  this target from `macos-15`, record the Tier 2 support level in `README.md`.
- To generate installers, use [`dist`](https://github.com/axodotdev/cargo-dist)
  with `release-plz`. The tool can generate shell and PowerShell installers,
  Homebrew formulas, and MSI packages. Its previous name was `cargo-dist`.

### Dependency records with `cargo-auditable`

Compile each release binary with [`cargo-auditable`](https://github.com/rust-secure-code/cargo-auditable).

```bash
cargo auditable build --release --locked --target "${{ matrix.target }}"
```

`cargo-auditable` adds a compressed dependency manifest to the `dep-v0`
section of the binary. Thus, `cargo audit bin`, Trivy, Grype, and OSV-Scanner
can check a deployed binary without the source code or `Cargo.lock`.

## Release files and verification

Put each binary in an archive with `README.md`, `LICENSE-MIT`, and `LICENSE-APACHE`.
Publish the files that adopters use to check the release.

```bash
# Make a SHA-256 checksum file for all release archives.
sha256sum my-crate-*.tar.gz my-crate-*.zip > SHA256SUMS

# Generate a CycloneDX SBOM for the release target without development dependencies.
cargo cyclonedx --format json --describe binaries

# For a workspace with more than one crate, you can also generate an SPDX 2.3 JSON SBOM.
cargo sbom --output-format spdx_json_2_3 > my-crate.spdx.json
```

### Meeting CISA's 2026 Minimum Elements for an SBOM

Use **CISA's July 2026 Minimum Elements for a Software Bill of Materials**
for the SBOM. Include component hashes, licenses, and information about the
SBOM tool. Give the transitive dependencies and the conditions under which
the tool generated the SBOM.

Generate the SBOM from the dependency tree that the release builds use
with `--locked`. Record the target triple in the release notes. Record the
Cargo features in the release notes. Attach the SBOM and `SHA256SUMS` to the
GitHub release.

### Build provenance attestations and immutable releases

Use `actions/attest@v4` to attest each release archive and SBOM. The attestation
links the file to the repository, commit SHA, and release workflow.
`actions/attest-build-provenance@v4` uses `actions/attest` internally.

```yaml
      - name: Attest release artifacts
        uses: actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6 # v4.2.2
        with:
          subject-path: dist/my-crate-*
```

1. On GitHub, open the repository **Settings**.
2. Under **General**, go to **Releases**.
3. Select **Enable release immutability**.
4. Set `git_release_draft = true` in `release-plz.toml`.
5. Upload all platform archives, SBOMs, and `SHA256SUMS` to the draft release.

   > **Caution.** Make sure that the draft contains all release files before you
   > publish it. After publication, GitHub prevents changes to the tag and the
   > release files. GitHub also prevents uploads to the release.

6. As the last step of the release job, publish the draft with `gh release edit "$TAG" --draft=false`.

Give adopters the verification commands in `README.md` or the release notes.

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
