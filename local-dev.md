# Local Development

A frictionless local development setup keeps quality high: contributors—human
and AI coding agents alike—should be able to clone the repository, install
prebuilt tooling in under a minute, and run the exact same checks CI enforces.

## The `justfile`

A `justfile` is the single entry point for every development task. Developers
run `just` to list available recipes and `just ci` to run the full check suite:

```makefile
# List available recipes by default, or run `just ci` to execute every check.
default:
    @just --list

# Check formatting without modifying files.
fmt:
    cargo fmt --check

# Reformat in place.
fmt-fix:
    cargo fmt

# Lint all targets and features, treating warnings as errors.
lint:
    cargo clippy --all-targets --all-features --locked -- -D warnings

# Verify rustdoc builds cleanly with no broken intra-doc links.
doc:
    RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features --locked

# Run the test suite (nextest + doctests; omit `cargo test --doc` if the crate has no `src/lib.rs`).
test:
    cargo nextest run --locked
    cargo test --doc --locked

# Check this branch for public API breaks against main, as CI does (libraries).
# Baseline is the merge base, so commits added to main since branching are not
# reported as removals. Use `just semver major` for a PR titled `feat!:` etc.
semver release_type="minor":
    git fetch origin main
    cargo semver-checks --baseline-rev "$(git merge-base HEAD origin/main)" --release-type {{release_type}}

# Check dependencies against the RustSec advisory database.
audit:
    cargo audit

# Verify the crate still builds on its declared MSRV.
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

# Verify the dependency tree against our locked supply-chain trust policy.
vet:
    cargo vet --locked

# Report unsafe-code usage (informational; leading `-` ignores nonzero exit).
geiger:
    -cargo geiger

# Run every check. Fails fast on the first failing recipe.
ci: fmt lint doc test audit msrv deny trivy zizmor vet geiger
```

### Why `just`?

- **Self-documenting** — `just` prints every recipe alongside its comment.
- **Cross-platform** — behaves consistently on Linux, macOS, and Windows.
- **CI parity** — every recipe uses `--locked` where applicable so local checks
  match CI behavior bit-for-bit.
- **Fail-fast** — `just ci` stops immediately at the first failing gate.

Pair the `justfile` with a `rust-toolchain.toml` (see
[Project Scaffolding](scaffolding.md#toolchain-pinning-rust-toolchaintoml)) so
`rustup` installs the exact same compiler, `rustfmt`, and `clippy` automatically
on first `cargo` invocation.

## `AGENTS.md` and `CLAUDE.md`

Modern teams use multiple AI coding assistants (Claude Code, Codex, Cursor,
Antigravity, etc.). Keep project instructions in **`AGENTS.md`**—the open,
vendor-neutral standard—and have **`CLAUDE.md`** import it via `@AGENTS.md` so
instructions never drift across tools:

```markdown
<!-- AGENTS.md -->
# Project Agent Guidelines

## Checks

Run `just ci` before claiming a change is complete—it chains fmt, lint, doc,
test, audit, msrv, deny, trivy, zizmor, vet, and geiger, failing fast.
`just fmt` verifies formatting without writing; use `just fmt-fix` to reformat.

## Invariants

- **Never panic on untrusted input.** Malformed, truncated, or empty input must
  return a structured `Result` error or degrade gracefully—never `unwrap` or
  `expect` on external data.
- **Edition is 2024; MSRV is 1.96** (`rust-version` in `Cargo.toml`, rolling N-4
  policy, enforced in CI). Do not use APIs stabilized after MSRV without an
  explicit MSRV bump PR.
- **Keep the dependency tree small.** Every new dependency requires a rationale
  in the PR and a `cargo vet` audit or time-bounded exemption.

## Code standards

- `[lints.clippy]` enables `all` and `pedantic` plus targeted restriction lints,
  and CI runs `-D warnings`. When a lint must be suppressed, use
  `#[expect(clippy::..., reason = "...")]`—never undocumented `#[allow]`.
- Unit tests live in `mod tests` beside the code; integration tests live in
  `tests/`. Every bug fix ships with a regression test.

## Repo etiquette

- Branch off `main` — direct pushes are blocked by repository rulesets.
- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
  for commit messages and PR titles (`feat:`, `fix:`, `docs:`, `chore:`,
  `ci:`, `refactor:`, `test:`); `release-plz` combines these with
  `cargo-semver-checks` to compute the next version and changelog.
- Never hand-edit `version` in `Cargo.toml` or `CHANGELOG.md`; `release-plz`
  owns both via automated Release PRs.
```

And in `CLAUDE.md`:

```markdown
@AGENTS.md
```

## The `CONTRIBUTING.md` file

A good `CONTRIBUTING.md` answers every question a new contributor has on day one:

1. **Finding work** — link to issues, highlighting `good first issue` labels.
2. **Fast tool setup** — prebuilt binary installation via `cargo-binstall`.
3. **The check suite** — a table of every `just` recipe and what it protects.
4. **Code standards** — `#[expect(..., reason = "...")]` lint discipline, test
   expectations, panic policy, and dependency rules.
5. **Pull request & release flow** —
   [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/),
   branch rulesets, and automated `release-plz` PRs.
6. **Dual-licensing notice** — explicit confirmation that contributions are
   submitted under `MIT OR Apache-2.0`.

### Fast tool installation with `cargo-binstall`

Compiling 8+ Rust subcommands from source with `cargo install` can take 15
minutes on a laptop. Recommend [`cargo-binstall`](https://github.com/cargo-bins/cargo-binstall)
so contributors fetch verified prebuilt binaries in seconds:

```bash
cargo install cargo-binstall --locked
cargo binstall -y just cargo-nextest cargo-semver-checks cargo-audit cargo-msrv cargo-deny cargo-vet zizmor cargo-geiger

# Or build from source (always pass --locked):
cargo install --locked just cargo-nextest cargo-semver-checks cargo-audit cargo-msrv cargo-deny cargo-vet zizmor cargo-geiger
# trivy: https://trivy.dev/latest/getting-started/installation/
```

## The `.gitignore` file

Note that `Cargo.lock` is **intentionally not ignored**—commit it for
applications, and typically for libraries as well (see
[Dependency Management](dependencies.md#lockfile-management)).

```gitignore
# Generated by Cargo
debug
target

# rustfmt backups
**/*.rs.bk

# MSVC Windows debug symbols
*.pdb

# Compiler ICE dumps
rustc-ice-*.txt

# Mutation testing & coverage outputs
**/mutants.out*/
lcov.info

# Local agent / editor settings (not committed)
.claude/settings.local.json
```

## Further reading

- [just documentation](https://just.systems/man/en/)
- [AGENTS.md specification](https://agents.md/)
- [Claude Code documentation](https://code.claude.com/docs/en/overview)
- [cargo-binstall](https://github.com/cargo-bins/cargo-binstall)
- [Conventional Commits 1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/)
- [GitHub: Setting guidelines for repository contributors](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors)
