# Code Quality Checks

Do the code quality checks before you merge changes into `main`. Use the
`just` recipes locally. Continuous integration (CI) does the same checks and
uses `--locked` where applicable.

## Formatting: `rustfmt`

```bash
# Do the CI format check. The command does not change files.
cargo fmt --check

# Format the local files.
cargo fmt
```

With `edition = "2024"` in `Cargo.toml`, `rustfmt` uses the 2024 format rules.
If you must keep the previous format during an edition change, set `style_edition` in `rustfmt.toml`.
Use the same version of `rustfmt` locally and in CI. Specify the version in
[`rust-toolchain.toml`](scaffolding.md#toolchain-pinning-rust-toolchaintoml).

CI uses `cargo fmt --check`. The check fails if a file has an incorrect format.
Before you push a change, use `just fmt-fix` or configure your editor to format on save.

## Linting: `clippy` and `rustc`

```bash
# Start Clippy for all targets and features.
cargo clippy --all-targets --all-features --locked -- -D warnings
```

With `-D warnings`, a warning causes the lint check to fail. The `[lints]`
section in `Cargo.toml` sets the lint policy.

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

### Lint groups and priorities

- `[lints.rust]` sets compiler lints. Examples include
  `unsafe_code = "forbid"` and `unused_crate_dependencies = "warn"`.
- `clippy::all` and `clippy::pedantic` check for defects, performance issues,
  and Rust style. Set their priority to `-1`. An individual lint at priority
  `0` can then override these settings.
- Select individual `restriction` lints for the project. Examples include
  `allow_attributes`, `allow_attributes_without_reason`, `dbg_macro`, `todo`,
  and `undocumented_unsafe_blocks`.
- Do not make experimental `nursery` lints mandatory in CI. They can give
  false positives after a Rust update.

### Lint exceptions with `#[expect]`

Do not use `#[allow(...)]` without a `reason` value. If a lint does not apply to an item,
add `#[expect(..., reason = "...")]` to that item. Rust 1.81 or later supports this attribute.

```rust
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "clamp(0.0, 100.0) guarantees the value fits in u8 without truncation or sign loss"
)]
let pct = used.clamp(0.0, 100.0) as u8;
```

The compiler and Clippy give these diagnostics.

- `clippy::allow_attributes_without_reason` reports an attribute without a `reason` value.
- If the original lint no longer applies, `rustc` gives an
  `unfulfilled_lint_expectations` warning. Remove the exception when this occurs.

## Documentation and API compatibility checks

### Documentation checks with `rustdoc`

```bash
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features --locked
```

This command finds broken links, incorrect HTML or Markdown in doc comments,
and warnings for missing crate documentation. The CI check occurs before
docs.rs builds the release.

### API compatibility: `cargo-semver-checks`

For a published library, use [`cargo-semver-checks`](https://github.com/obi1kenobi/cargo-semver-checks).
The command compares the current `rustdoc` JSON with the latest crates.io release.
It can identify changes such as removal of a public item or stricter trait
bounds. It can also identify removal of an auto trait such as `Send` or `Sync`.

```bash
# Use the latest crates.io release as the default baseline.
cargo semver-checks

# Use the merge base with main to check only the changes from this branch.
# A comparison with origin/main can report new items on main as removed.
# If the pull request title has the ! marker, use major in place of minor.
git fetch origin main
cargo semver-checks --baseline-rev "$(git merge-base HEAD origin/main)" --release-type minor
```

`cargo-semver-checks` rejects the `--locked` flag. The CI
[`semver` job](ci-cd.md#semver--public-api-compatibility-libraries) compares each
pull request with its base commit. The job permits intentional incompatible changes
only if the pull request title contains the Conventional Commits `!` marker.

## The `justfile`

Use the `justfile` to give developers and CI the same commands. The comments
give the purpose of each recipe.

```makefile
# Show the recipes by default.
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

# Start all checks. The command stops if a recipe fails.
ci: fmt lint doc test audit msrv deny trivy zizmor vet geiger
```

## Check reference

| Recipe | Command | Purpose |
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

## Tool installation

Use [`cargo-binstall`](https://github.com/cargo-bins/cargo-binstall) to install
prebuilt tools. To compile the tools from source, use `cargo install --locked`.

```bash
# Install cargo-binstall before you install prebuilt tools.
cargo install cargo-binstall --locked
cargo binstall -y just cargo-nextest cargo-semver-checks cargo-audit cargo-msrv cargo-deny cargo-vet zizmor cargo-geiger

# To compile from source, use the lockfile from each tool's package.
cargo install --locked just cargo-nextest cargo-semver-checks cargo-audit cargo-msrv cargo-deny cargo-vet zizmor cargo-geiger
# trivy: https://trivy.dev/latest/getting-started/installation/
```

## Further reading

- [rustfmt documentation](https://github.com/rust-lang/rustfmt)
- [Clippy documentation](https://doc.rust-lang.org/clippy/)
- [Rustc lint expectations (`#[expect]`)](https://doc.rust-lang.org/rustc/lints/levels.html#expecting-a-lint)
- [cargo-semver-checks](https://github.com/obi1kenobi/cargo-semver-checks)
- [just documentation](https://just.systems/man/en/)
