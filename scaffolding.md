# Project Configuration

`Cargo.toml` records the crate metadata, Rust edition, lints, and requirements
for dependencies. Set these values when you create the crate.

## The `Cargo.toml` template

```toml
[package]
name = "my-crate"
version = "0.1.0"
edition = "2024"
rust-version = "1.96"
description = "A short, clear description of what this crate does"
license = "MIT OR Apache-2.0"
repository = "https://github.com/you/my-crate"
readme = "README.md"
keywords = ["cli", "tool", "productivity"]
categories = ["command-line-utilities"]
exclude = ["docs/", "assets/", ".github/", "justfile"]
```

### Key fields

| Field | Purpose |
|-------|---------|
| `edition` | Set the value to `"2024"`. Rust 1.85 added support for this edition. It enables the 2024 format defaults, `unsafe_op_in_unsafe_fn` warnings, `unsafe extern` blocks, and `#[unsafe(...)]` attributes. Cargo selects Resolver v3 by default if the root package uses Edition 2024. In a virtual workspace, set `resolver = "3"` in `[workspace]`. Refer to the [MSRV guide](msrv.md#how-cargo-resolver-v3-uses-the-msrv). |
| `rust-version` | Set the minimum supported Rust version (MSRV). For example, set `"1.96"` for an N-4 policy when stable is `1.100`. Cargo Resolver v3 and CI use this value. Refer to the [MSRV guide](msrv.md). |
| `license` | Set the value to `"MIT OR Apache-2.0"`. For `cargo publish`, a license and a description are necessary. Refer to [Licensing](#licensing). |
| `repository` | Set the URL of the source repository. `cargo publish` gives a warning when `repository`, `homepage`, and `documentation` are all absent. Crates.io uses the URL for provenance links. |
| `keywords` and `categories` | Specify applicable values to help users find the crate on crates.io. Each field can contain up to five values. |
| `exclude` | Specify the files that Cargo must omit from the `.crate` archive. Use `cargo package --list` to examine the file list. |

## Toolchain pinning (`rust-toolchain.toml`)

`rust-version` identifies the earliest toolchain that the crate supports.
Use `rust-toolchain.toml` to set the versions of `rustc`, `rustfmt`, and Clippy
for developers and continuous integration (CI).

```toml
# rust-toolchain.toml
[toolchain]
channel = "1.100.0"
components = ["rustfmt", "clippy"]
```

Update `channel` when you select a new Rust release. Dependabot does not update
`rust-toolchain.toml`. Renovate can update this file.

In the CI job for the MSRV, set `RUSTUP_TOOLCHAIN` to the MSRV. This value has
priority over `rust-toolchain.toml`. Refer to [Enforcing MSRV in CI](msrv.md#enforcing-msrv-in-ci).

To use the latest stable version automatically, set `channel = "stable"`.
You can also omit `rust-toolchain.toml` if the default toolchain is stable.

## Lints

Configure the `rustc` and Clippy lints in `Cargo.toml`.

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

If the workspace has more than one crate, define `[workspace.lints.rust]` in the root `Cargo.toml`.
Define `[workspace.lints.clippy]` in the same file.
Set `workspace = true` in the `[lints]` section of each member crate.

```toml
[lints]
workspace = true
```

### Lint groups and priorities

- Set `priority = -1` for the `all` and `pedantic` groups. Individual lints
  at the default priority of `0` can then override the group settings.
- Do not make the Clippy `nursery` group mandatory in CI. Its experimental
  lints can give false positives or change in a stable Rust release.
- Select individual `restriction` lints for your policy. Examples include
  `dbg_macro`, `todo`, and `undocumented_unsafe_blocks`.
- Set `unused_crate_dependencies = "warn"` to identify dependencies that
  your code does not import. Cargo 1.100 also gives diagnostics for unused
  dependencies.

Use `-D warnings` in CI. With this flag, a Clippy warning causes the check to fail.

```bash
cargo clippy --all-targets --all-features --locked -- -D warnings
```

### Lint exceptions with `#[expect]`

If a lint does not apply to an item, add a `#[expect]` attribute. Set its `reason` value.
Rust 1.81 or later supports the attribute. The Clippy lints
`allow_attributes` and `allow_attributes_without_reason` enforce this policy.

```rust
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "clamp(0.0, 100.0) guarantees the value fits in u8 with no truncation or sign loss"
)]
let pct = used.clamp(0.0, 100.0) as u8;
```

`#[expect]` causes an `unfulfilled_lint_expectations` warning if the original
lint no longer applies. Remove the exception when you get this warning.
`#[allow]` stays in the code without a warning when the original lint no
longer applies.

## Restrict `unsafe` code

Set `unsafe_code = "forbid"` in `[lints.rust]`. As an alternative, add
`#![forbid(unsafe_code)]` at the crate root. The compiler rejects `unsafe`
blocks. It also rejects these blocks in macro expansions.

Some foreign function interfaces (FFIs) or low-level primitives make `unsafe` necessary.
If `unsafe` is necessary in a reviewed module, set `unsafe_code = "deny"` in `[lints.rust]`.
Use `#[allow(unsafe_code)]` only on that module. The compiler rejects
this exception when the lint level is `"forbid"`. Keep the Edition 2024 warning
`unsafe_op_in_unsafe_fn` active. Set `clippy::undocumented_unsafe_blocks = "deny"`
to make a `// SAFETY:` comment mandatory for each `unsafe` block.

## Dependency declarations

Declare the dependencies in `Cargo.toml`.

```toml
[dependencies]
# This range permits 1.x updates. It excludes 2.0.
# Cargo Resolver v3 gives priority to versions that support package.rust-version.
serde = { version = "1", features = ["derive"] }

# Disable default features if only some of the features are necessary.
toml = { version = "0.8", default-features = false, features = ["parse"] }

# The rust_backend feature uses miniz_oxide in place of libz-sys.
# It removes the need for a C toolchain and an unsafe FFI call to libz-sys.
flate2 = { version = "1", default-features = false, features = ["rust_backend"] }
```

### Dependency rules

1. Use standard Semantic Versioning ranges, for example `"1"` and `"0.8"`.
2. Do not set a maximum minor version with a constraint such as `<x.y` in libraries.
   This constraint can prevent users from using one dependency version or getting a
   security fix. Resolver v3 gives priority to versions that support the MSRV.
   If a known incompatible version has incorrect or missing MSRV metadata, set a maximum version.
   Record the condition for removal of that constraint.
3. If you use only some features, disable the default features. Each enabled
   feature can add dependencies that you must audit.
4. Use a pure-Rust backend when possible. Examples include `rustls`,
   `miniz_oxide`, and `gix`. A pure-Rust backend can let you cross-compile without a C toolchain or interface.

## Licensing

Rust projects commonly use `MIT OR Apache-2.0`. Users can select one of the two licenses.
The Apache 2.0 license gives a patent grant. The MIT license is compatible
with GPLv2-only projects.

Put `LICENSE-MIT` and `LICENSE-APACHE` in the repository root. In
`CONTRIBUTING.md`, record that the same license terms apply to contributions.

## Dev-dependencies

Keep only the necessary dependencies in `[dev-dependencies]`.

```toml
[dev-dependencies]
tempfile = "3"    # temporary directories for integration tests
proptest = "1"    # property-based testing
```

Cargo does not link development dependencies into release binaries. Their
build scripts (`build.rs`), procedural macros, and test helpers can start code
on developer computers and CI runners. In `cargo-vet`, use the `safe-to-run`
criterion for these dependencies. Include them in `cargo-deny` and
`cargo-audit` checks.

## Binary and library targets

Cargo finds `src/lib.rs` and `src/main.rs` automatically. It uses the package
name for the default binary. If you change the binary name or path, add `[[bin]]`.

```toml
[[bin]]
name = "my-tool"
path = "src/main.rs"
```

If the project is a command-line tool, put the main logic in `src/lib.rs`.
Keep only the entry point in `src/main.rs`. This structure lets you use
`cargo test --doc` and add unit, property, fuzz, and integration tests.

## Further reading

- [The Cargo Book: Manifest format](https://doc.rust-lang.org/cargo/reference/manifest.html)
- [The Cargo Book: Configuring Lints](https://doc.rust-lang.org/cargo/reference/manifest.html#the-lints-section)
- [Rust Edition Guide (2024 Edition)](https://doc.rust-lang.org/edition-guide/rust-2024/index.html)
- [Rust API Guidelines: Crate metadata](https://rust-lang.github.io/api-guidelines/necessities.html#crate-metadata)
