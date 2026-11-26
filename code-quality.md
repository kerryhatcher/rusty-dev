# Code Quality Gates

Every line of Rust code should pass through automated quality gates before
it reaches a pull request. These gates run locally via `just` and in CI.

## Formatting: `rustfmt`

```bash
# Verify (CI — does not modify files)
cargo fmt --check

# Fix (local — reformats in place)
cargo fmt
```

CI runs `cargo fmt --check` and fails if any file is unformatted. Developers
run `cargo fmt` (or configure their editor to format on save) before pushing.
Pin the toolchain in `rust-toolchain.toml` (see
[scaffolding](scaffolding.md#toolchain-pinning)) so local and CI `rustfmt`
agree. Edition 2024 also introduced a new default style edition; set
`style_edition` in `rustfmt.toml` only if you need to hold formatting
steady across an edition migration.

## Linting: `clippy`

```bash
# Run clippy on all targets (bin, lib, tests, examples, benches)
cargo clippy --all-targets --locked -- -D warnings
```

The `-D warnings` flag turns every clippy warning into a hard error. Combine
it with the `[lints]` configuration in `Cargo.toml`:

```toml
[lints.clippy]
all = { level = "warn", priority = -1 }
pedantic = { level = "warn", priority = -1 }
nursery = { level = "warn", priority = -1 }
```

The `priority = -1` on each group is required as soon as you add a
per-lint override; without it clippy's `lint_groups_priority` lint fails the
build. The groups mean:

- **`all`** — every lint that is on by default (`correctness`, `suspicious`,
  `style`, `complexity`, `perf`).
- **`pedantic`** — stricter, more opinionated lints. Expect to suppress a few
  with a reason.
- **`nursery`** — lints still under development. They can produce false
  positives; enable the group only if the team accepts that cost, or enable
  individual nursery lints you find valuable.

If the crate has features, lint with the feature combinations you support
(for example `--all-features`, or `cargo hack clippy --feature-powerset`);
code behind a disabled feature is not linted.

### Suppression discipline

When a lint is genuinely wrong for a specific piece of code, suppress it
narrowly (on the statement or function, not the module) with
`#[expect(..., reason = "...")]`:

```rust
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "clamp(0.0, 100.0) guarantees the value fits in u8"
)]
let pct = used.clamp(0.0, 100.0) as u8;
```

`#[expect]` (stable since Rust 1.81) emits `unfulfilled_lint_expectations` if
the lint stops firing, so suppressions are removed when they are no longer
needed. Enforce the habit with the restriction lints
`clippy::allow_attributes` and `clippy::allow_attributes_without_reason`.

Never suppress a lint without explaining why. If you cannot write a
convincing reason, the lint is probably right.

## Documentation: `rustdoc`

Broken intra-doc links and malformed doc comments are easy to miss. Fail on
them in CI:

```bash
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features --locked
```

Doctests run as part of `cargo test` (but not `cargo nextest`; see
[testing](testing.md#test-runner-cargo-nextest)).

## The `justfile`

A `justfile` provides a single entry point for every quality gate. Developers
run `just ci` to reproduce what CI runs:

```just
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

# Run every check. Stops at the first failing recipe.
ci: fmt lint doc test audit msrv deny trivy vet geiger
```

### Why `just` instead of `make` or shell scripts?

- **Self-documenting** — `just --list` shows every recipe with its comment.
- **Cross-platform** — works on Linux, macOS, and Windows.
- **A command runner, not a build system** — no implicit rules, `.PHONY`
  targets, or timestamp logic.
- **Stops on failure** — `just ci` stops at the first failing dependency.

## What the gates protect

| Gate | Command | What it protects |
|------|---------|------------------|
| `just fmt` | `cargo fmt --check` | Consistent formatting |
| `just lint` | `cargo clippy --all-targets --locked -- -D warnings` | Bugs, style, idiomatic code |
| `just doc` | `cargo doc` with `-D warnings` | Broken doc links and doc comments |
| `just test` | `cargo test --locked` | Correctness |
| `just audit` | `cargo audit` | Known advisories in dependencies |
| `just msrv` | `cargo msrv verify` | MSRV drift from code or dependency changes |
| `just deny` | `cargo deny check` | Advisories, licenses, banned crates, duplicates, sources |
| `just trivy` | `trivy fs --scanners vuln,secret` | Filesystem vulns and secrets |
| `just vet` | `cargo vet check` | Supply-chain trust policy |
| `just geiger` | `cargo geiger` | Unsafe usage (informational) |

For published libraries, add
[`cargo-semver-checks`](https://github.com/obi1kenobi/cargo-semver-checks)
(`cargo semver-checks`) to catch accidental breaking API changes before
release.

## Installing the tools

```bash
# Install prebuilt binaries where available (fast):
cargo binstall just cargo-audit cargo-msrv cargo-deny cargo-vet cargo-geiger

# Or build from source. Always pass --locked so the tool builds with the
# dependency versions its authors tested:
cargo install --locked just cargo-audit cargo-msrv cargo-deny cargo-vet cargo-geiger

# trivy: https://trivy.dev/latest/getting-started/installation/
```

## Further reading

- [rustfmt documentation](https://github.com/rust-lang/rustfmt)
- [Clippy documentation](https://doc.rust-lang.org/clippy/)
- [Clippy lint list](https://rust-lang.github.io/rust-clippy/master/index.html)
- [just documentation](https://just.systems/man/en/)
- [cargo-binstall](https://github.com/cargo-bins/cargo-binstall)
