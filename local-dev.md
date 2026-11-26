# Local Development

A great local development experience is the foundation of a healthy project.
Developers should be able to clone, build, test, and run the full check suite
with minimal friction.

## The `justfile`

A `justfile` is the single entry point for every development task. Developers
run `just` to see available recipes and `just ci` to run everything. CI calls
the same recipes, so a green `just ci` locally predicts a green CI run:

```just
# Run `just` with no args to list recipes, or `just ci` to run all checks.
default:
    @just --list

# Check formatting without modifying files.
fmt:
    cargo fmt --check

# Reformat in place.
fmt-fix:
    cargo fmt

# Lint, treating warnings as errors.
lint:
    cargo clippy --all-targets --locked -- -D warnings

# Build docs, treating rustdoc warnings as errors.
doc:
    RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --locked

# Run the test suite.
test:
    cargo test --locked

# Check dependencies against the RustSec advisory database.
audit:
    cargo audit

# Verify the crate still builds on its declared MSRV.
msrv:
    cargo msrv verify

# Check advisories, licenses, banned crates, duplicate versions, and sources.
deny:
    cargo deny check

# Scan the filesystem for known vulnerabilities and hardcoded secrets.
trivy:
    trivy fs --scanners vuln,secret --exit-code 1 --skip-dirs target .

# Check the dependency tree against our supply-chain trust policy.
vet:
    cargo vet check

# Report unsafe-code usage (informational; the leading `-` ignores failure).
geiger:
    -cargo geiger

# Run every check. Stops at the first failing recipe.
ci: fmt lint doc test audit msrv deny trivy vet geiger
```

### Why `just`?

- **Self-documenting** — `just --list` shows every recipe with its comment.
- **Cross-platform** — works on Linux, macOS, and Windows.
- **Stops on failure** — `just ci` stops at the first failing dependency.
- **Simple** — a command runner with no build-system semantics to learn.

## Pin the toolchain

Commit a `rust-toolchain.toml` (see
[scaffolding](scaffolding.md#toolchain-pinning)) so `rustup` installs the
same compiler, `rustfmt`, and `clippy` for everyone on first `cargo` run.

## Agent instruction files (`AGENTS.md` / `CLAUDE.md`)

AI coding assistants read a project instruction file for conventions and
invariants. `AGENTS.md` is the cross-tool convention read by many agents;
Claude Code reads `CLAUDE.md` (which can simply import `@AGENTS.md`). Keep it
short, factual, and specific to the repository. It is guidance for the tool,
not an enforcement mechanism; CI is still the gate.

```markdown
# AGENTS.md

## Checks

Run `just ci` before claiming a change is done — it chains fmt, lint, doc,
test, audit, msrv, deny, trivy, vet, and geiger, stopping at the first
failure. `just fmt` is `cargo fmt --check` (verify only); use `just fmt-fix`
to reformat.

## Invariants

- **Never panic on input.** Malformed or unexpected input returns an error
  (or degrades to a documented fallback); it never panics.
- **MSRV is 1.85.1** (`rust-version` in Cargo.toml, pinned in CI). Do not use
  standard-library APIs stabilized after it, and do not raise it casually.
- **Keep the dependency tree small.** Every new dependency needs a
  justification and a `cargo vet` audit or recorded exemption.

## Code standards

- Clippy `pedantic` and `nursery` are enabled and CI runs `-D warnings`.
  When a lint is genuinely wrong, use `#[expect(lint, reason = "...")]`.
- Unit tests live in a `mod tests` block beside the code; integration tests
  live in `tests/`. A bug fix ships with the test that would have caught it.

## Repo etiquette

- Branch off `main` — direct pushes are blocked by branch protection.
- Use Conventional Commits; release-please derives the version bump and
  changelog from the prefix.
- Never hand-edit the `version` field in `Cargo.toml` or `CHANGELOG.md`.
  Release automation owns both files.
```

## The `CONTRIBUTING.md` file

A good `CONTRIBUTING.md` answers every question a new contributor might have:

### What to include

1. **Finding something to work on** — link to issues, especially `good first
   issue` labels.
2. **Development setup** — how to clone, build, and test.
3. **The check suite** — a table of every `just` recipe and what it protects.
4. **Code standards** — testing expectations, clippy discipline, dependency
   rules.
5. **Pull request process** — branch strategy, commit message format, CI
   requirements.
6. **Release process** — how releases work (automated, not manual).

### Example check suite table

| Recipe | Command | What it protects |
|--------|---------|------------------|
| `just fmt` | `cargo fmt --check` | Formatting, unmodified |
| `just lint` | `cargo clippy --all-targets --locked -- -D warnings` | Lints — pedantic and nursery |
| `just doc` | `cargo doc` with `-D warnings` | Doc comments and intra-doc links |
| `just test` | `cargo test --locked` | The test suite |
| `just audit` | `cargo audit` | Known advisories in the dependency tree |
| `just msrv` | `cargo msrv verify` | MSRV drift from code or dependency changes |
| `just deny` | `cargo deny check` | Advisories, licenses, banned crates, duplicates, sources |
| `just trivy` | `trivy fs` | Vulnerabilities and hardcoded secrets |
| `just vet` | `cargo vet check` | Supply-chain trust policy |
| `just geiger` | `cargo geiger` | Unsafe usage — informational |

### Tool installation

```bash
# Prebuilt binaries (fast):
cargo binstall just cargo-audit cargo-msrv cargo-deny cargo-vet cargo-geiger

# Or from source — always with --locked:
cargo install --locked just cargo-audit cargo-msrv cargo-deny cargo-vet cargo-geiger

# trivy: https://trivy.dev/latest/getting-started/installation/
```

## The `.gitignore` file

```gitignore
# Generated by Cargo (`cargo new` ignores only /target; commit Cargo.lock)
/target

# rustfmt backups
**/*.rs.bk

# MSVC Windows builds
*.pdb

# Mutation testing
**/mutants.out*/

# Personal agent settings (not committed)
.claude/settings.local.json
```

## Further reading

- [just documentation](https://just.systems/man/en/)
- [AGENTS.md](https://agents.md/)
- [Claude Code documentation: memory and `CLAUDE.md`](https://code.claude.com/docs/en/memory)
- [GitHub: CONTRIBUTING.md best practices](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors)
