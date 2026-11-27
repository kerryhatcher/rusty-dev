# Local Development

Contributors and coding agents can install prebuilt tools after they clone the
repository. The local tools do the same checks as continuous integration (CI).

## The `justfile`

The `justfile` gives contributors one place to find development commands.
Use `just` to see the recipes. Use `just ci` to start the full check suite.

```makefile
# Show the recipes by default. Use just ci to start all checks.
default:
    @just --list

# Do the format check without changes to files.
fmt:
    cargo fmt --check

# Format the files.
fmt-fix:
    cargo fmt

# Lint all targets and features. Treat warnings as errors.
lint:
    cargo clippy --all-targets --all-features --locked -- -D warnings

# Build the API documentation. Include the check for broken links.
doc:
    RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features --locked

# Start the tests. If the crate has no src/lib.rs, omit cargo test --doc.
test:
    cargo nextest run --locked
    cargo test --doc --locked

# Compare the public API with the merge base of main. CI uses the same baseline.
# This comparison excludes changes that main got after the two branches diverged.
# If the pull request title has the ! marker, use just semver major.
semver release_type="minor":
    git fetch origin main
    cargo semver-checks --baseline-rev "$(git merge-base HEAD origin/main)" --release-type {{release_type}}

# Check dependencies against the RustSec advisory database.
audit:
    cargo audit

# Do the MSRV check.
msrv:
    cargo msrv verify

# Check licenses, banned crates, duplicate versions, and dependency sources.
deny:
    cargo deny check

# Scan the filesystem for known vulnerabilities and hardcoded secrets.
trivy:
    trivy fs --scanners vuln,secret --exit-code 1 --skip-dirs target .

# Audit GitHub Actions workflows for security vulnerabilities.
zizmor:
    zizmor .github/workflows

# Check the dependency tree with the audit records in the lockfile.
vet:
    cargo vet --locked

# Report the amount of unsafe code. The hyphen makes just ignore failure exit codes.
geiger:
    -cargo geiger

# Start all checks. The command stops if a recipe fails.
ci: fmt lint doc test audit msrv deny trivy zizmor vet geiger
```

### What `just` does

- `just` shows each recipe with its comment.
- `just` operates on Linux, macOS, and Windows.
- The recipes use `--locked` where applicable. Thus, local checks use the same
  dependency versions as CI.
- `just ci` stops when a check fails.

Add [`rust-toolchain.toml`](scaffolding.md#toolchain-pinning-rust-toolchaintoml)
to the repository. When you first use Cargo, `rustup` installs the compiler,
`rustfmt`, and Clippy versions from that file.

## `AGENTS.md` and `CLAUDE.md`

Put the project instructions for coding agents in `AGENTS.md`. To use the same
instructions in Claude Code, add `@AGENTS.md` to `CLAUDE.md`.

```markdown
<!-- AGENTS.md -->
# Project Instructions for Coding Agents

## Checks

Start the checks with `just ci` before you report that a change is complete.
The command stops when a check fails. Use `just fmt` to check the format.
Use `just fmt-fix` to change the format.

## Project requirements

- Do not use `unwrap` or `expect` on external data. If the input is malformed,
  truncated, or empty, return a structured `Result` error or use a safe fallback.
- Use Rust Edition 2024. The minimum supported Rust version (MSRV) is 1.96.
  CI checks the `rust-version` in `Cargo.toml` against the N-4 policy.
  To use an API from a newer Rust version, first increase the MSRV in its own pull request.
- If you add a dependency, give the reason in the pull request. Add a
  `cargo vet` audit or an exemption with an expiration date.

## Code standards

- `[lints.clippy]` enables the `all` and `pedantic` groups and specific
  restriction lints. CI uses `-D warnings`.
- If a lint does not apply to an item, use
  `#[expect(clippy::..., reason = "...")]` on that item. Do not use
  `#[allow]` without a `reason` value.
- Put unit tests in `mod tests` next to the code. Put integration tests in
  `tests/`. Add a regression test for each bug fix.

## Pull requests

- Create a branch from `main`. Repository rulesets block direct pushes to
  `main`.
- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
  for commit messages and pull request titles. Examples include `feat:`,
  `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`, and `test:`.
- `release-plz` uses the commit messages and `cargo-semver-checks` to
  calculate the next version and generate the changelog.
- Do not manually edit `version` in `Cargo.toml`. Do not manually edit
  `CHANGELOG.md`. `release-plz` updates the two files in a release pull request.
```

Example `CLAUDE.md`

```markdown
@AGENTS.md
```

## The `CONTRIBUTING.md` file

Include this information in `CONTRIBUTING.md`.

1. Link to issues with the `good first issue` label.
2. Give the commands to install tools with `cargo-binstall`.
3. Give the purpose of each `just` recipe in a table.
4. Record the lint, test, panic, and dependency policies.
5. Give the pull request and release procedures. Include
   [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/),
   branch rulesets, and release pull requests from `release-plz`.
6. Record that contributors submit changes under `MIT OR Apache-2.0`.

### Tool installation with `cargo-binstall`

Use [`cargo-binstall`](https://github.com/cargo-bins/cargo-binstall) to install
prebuilt tools. With `cargo install`, Cargo compiles the tools from source.

```bash
cargo install cargo-binstall --locked
cargo binstall -y just cargo-nextest cargo-semver-checks cargo-audit cargo-msrv cargo-deny cargo-vet zizmor cargo-geiger

# To compile from source, use the lockfile from each tool's package.
cargo install --locked just cargo-nextest cargo-semver-checks cargo-audit cargo-msrv cargo-deny cargo-vet zizmor cargo-geiger
# trivy: https://trivy.dev/latest/getting-started/installation/
```

## The `.gitignore` file

Commit `Cargo.lock` for applications. For libraries, refer to
[Lockfile management](dependencies.md#lockfile-management).

```gitignore
# Files from Cargo
debug
target

# rustfmt backups
**/*.rs.bk

# MSVC Windows debug symbols
*.pdb

# Compiler error dumps
rustc-ice-*.txt

# Mutation test and coverage files
**/mutants.out*/
lcov.info

# Local settings for coding agents and editors
.claude/settings.local.json
```

## Further reading

- [just documentation](https://just.systems/man/en/)
- [AGENTS.md specification](https://agents.md/)
- [Claude Code documentation](https://code.claude.com/docs/en/overview)
- [cargo-binstall](https://github.com/cargo-bins/cargo-binstall)
- [Conventional Commits 1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/)
- [GitHub: Setting guidelines for repository contributors](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors)
