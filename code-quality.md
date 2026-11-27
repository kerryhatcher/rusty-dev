# Code Quality Gates

Every line of Rust code should pass through automated quality gates before it
reaches `main`. These gates run identically on a developer's laptop via `just`
and in CI with `--locked`.

## Formatting: `rustfmt`

```bash
# Verify (CI — does not modify files)
cargo fmt --check

# Fix (local — reformats in place)
cargo fmt
```

With `edition = "2024"` in `Cargo.toml`, `rustfmt` automatically applies the
2024 style edition (improved sorting and expression formatting; set
`style_edition` in `rustfmt.toml` only if holding formatting steady during an
edition migration). Pinning the toolchain in `rust-toolchain.toml` (see
[Project Scaffolding](scaffolding.md#toolchain-pinning-rust-toolchaintoml))
keeps local and CI `rustfmt` output identical. CI runs `cargo fmt --check` and
fails if any file is unformatted; developers format on save or run `just fmt-fix`
before pushing.

## Linting: `clippy` and `rustc`

```bash
# Run clippy across all targets (lib, bins, tests, benches, examples) and features
cargo clippy --all-targets --all-features --locked -- -D warnings
```

The `-D warnings` flag promotes every warning to a hard compile error, enforcing
the `[lints]` policy declared in `Cargo.toml`:

```toml
[lints.rust]
unsafe_code = "forbid"
unused_crate_dependencies = "warn"

[lints.clippy]
all = { level = "warn", priority = -1 }
pedantic = { level = "warn", priority = -1 }
allow_attributes = "warn"
allow_attributes_without_reason = "warn"
dbg_macro = "warn"
todo = "warn"
undocumented_unsafe_blocks = "warn"
```

### What each tier enforces

- **`[lints.rust]`** — compiler-level guarantees (`unsafe_code = "forbid"` and
  `unused_crate_dependencies = "warn"`).
- **`clippy::all` + `clippy::pedantic` (`priority = -1`)** — stable bug,
  correctness, performance, and idiomatic-Rust checks. Setting `priority = -1`
  allows project-wide overrides of specific pedantic lints at priority `0` if
  needed.
- **Targeted `restriction` lints** — surgical policies (`allow_attributes`,
  `allow_attributes_without_reason`, `dbg_macro`, `todo`,
  `undocumented_unsafe_blocks`) without enabling experimental `nursery` lints
  that can introduce false-positive CI failures on routine Rust releases.

### Suppression discipline with `#[expect]`

Never silence a lint with an undocumented `#[allow(...)]`. Use Rust 1.81+'s
`#[expect(..., reason = "...")]` narrowly on the expression or item:

```rust
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "clamp(0.0, 100.0) guarantees the value fits in u8 without truncation or sign loss"
)]
let pct = used.clamp(0.0, 100.0) as u8;
```

This gives you two compiler-enforced guarantees:

1. **Mandatory justification** — omitting `reason = "..."` fails
   `clippy::allow_attributes_without_reason`.
2. **Self-cleaning suppressions** — if a refactor later removes the cast or
   changes types so the lint no longer triggers, `rustc` warns via
   `unfulfilled_lint_expectations` so stale suppressions never linger.

## Documentation & SemVer gates

### Broken doc-link and rustdoc validation

```bash
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features --locked
```

Catches broken `[intra-doc links]`, invalid HTML/Markdown in doc comments, and
missing crate-level documentation warnings before docs.rs tries to build a
release.

### API compatibility: `cargo-semver-checks`

For published libraries, run [`cargo-semver-checks`](https://github.com/obi1kenobi/cargo-semver-checks)
to statically compare your current `rustdoc` JSON against the latest crates.io
release and catch accidental breaking changes (such as removing a public item,
tightening trait bounds, or dropping an auto-trait like `Send` or `Sync`):

```bash
# Against the latest crates.io release (the default baseline)
cargo semver-checks

# Against your branch's base, as CI does for pull requests
cargo semver-checks --baseline-rev origin/main
```

`cargo-semver-checks` has no `--locked` flag and rejects it. In CI, the
[`semver` job](ci-cd.md#semver--public-api-compatibility-libraries) checks each
PR against its base and accepts intentional breaks only when the PR title is
marked `!`.

## The `justfile`

A `justfile` gives local developers and CI a single, self-documenting command
surface:

```makefile
# List available recipes by default.
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

# Run every check. Fails fast on the first failing recipe.
ci: fmt lint doc test audit msrv deny trivy zizmor vet geiger
```

## What the gates protect

| Gate | Command | What it protects |
|------|---------|------------------|
| `just fmt` | `cargo fmt --check` | Consistent 2024-edition formatting |
| `just lint` | `cargo clippy --all-targets --all-features --locked -- -D warnings` | Correctness, style, documented `#[expect]` reasons |
| `just doc` | `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features --locked` | Valid API docs and intra-doc links |
| `just test` | `cargo nextest run --locked && cargo test --doc --locked` | Functional correctness and executable doc examples |
| `just audit` | `cargo audit` | Known RustSec advisories in `Cargo.lock` |
| `just msrv` | `cargo msrv verify` | Compatibility with declared `rust-version` |
| `just deny` | `cargo deny check` | Licenses, banned crates, duplicates, sources |
| `just trivy` | `trivy fs --scanners vuln,secret --exit-code 1 --skip-dirs target .` | Filesystem vulnerabilities and leaked secrets |
| `just zizmor` | `zizmor .github/workflows` | GitHub Actions workflow security flaws |
| `just vet` | `cargo vet --locked` | Supply-chain audit and exemption policy |
| `just geiger` | `-cargo geiger` | Unsafe usage metrics (informational) |

## Installing the tools

Use [`cargo-binstall`](https://github.com/cargo-bins/cargo-binstall) locally to
install verified prebuilt binaries in seconds rather than compiling every tool
from source:

```bash
# Install cargo-binstall once, then fetch prebuilt CLI binaries rapidly:
cargo install cargo-binstall --locked
cargo binstall -y just cargo-nextest cargo-semver-checks cargo-audit cargo-msrv cargo-deny cargo-vet zizmor cargo-geiger

# Or compile from source (always pass --locked so tools build with tested deps):
cargo install --locked just cargo-nextest cargo-semver-checks cargo-audit cargo-msrv cargo-deny cargo-vet zizmor cargo-geiger
# trivy: https://trivy.dev/latest/getting-started/installation/
```

## Further reading

- [rustfmt documentation](https://github.com/rust-lang/rustfmt)
- [Clippy documentation](https://doc.rust-lang.org/clippy/)
- [Rustc lint expectations (`#[expect]`)](https://doc.rust-lang.org/rustc/lints/levels.html#expecting-a-lint)
- [cargo-semver-checks](https://github.com/obi1kenobi/cargo-semver-checks)
- [just documentation](https://just.systems/man/en/)
