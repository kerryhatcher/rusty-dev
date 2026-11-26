# Project Scaffolding

A Rust project's `Cargo.toml` is its identity document. Getting the metadata,
edition, lints, and constraints right on day one avoids a cascade of fixes
later.

## The `Cargo.toml` skeleton

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
| `edition` | Use `"2024"` (stabilized in Rust 1.85). Enables Cargo Resolver v3 (MSRV-aware dependency resolution), `rustfmt` 2024 style defaults, `unsafe_op_in_unsafe_fn` warnings, `unsafe extern` blocks, and `#[unsafe(...)]` attributes. |
| `rust-version` | The **minimum supported Rust version** (MSRV). Declare a deliberate rolling floor (e.g., N-4 / ~6 months behind current stable `1.100`, such as `"1.96"`) so Cargo's resolver and CI enforce it. See [MSRV Management](msrv.md). |
| `license` | Use `"MIT OR Apache-2.0"` — the standard dual-license in the Rust ecosystem. See [licensing](#licensing). |
| `repository` | Link to the source. Required for `cargo publish` and crates.io provenance links. |
| `keywords` / `categories` | Help people discover the crate on crates.io (up to 5 each). Keep them accurate. |
| `exclude` | Repo-only files to omit from the published `.crate` tarball. Keeps downloads small and reviewable. |

## Lints

Configure both `rustc` and `clippy` lints declaratively in `Cargo.toml`:

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

In multi-crate workspaces, define `[workspace.lints.rust]` and
`[workspace.lints.clippy]` once in the root `Cargo.toml`, and inherit them in
each member crate with:

```toml
[lints]
workspace = true
```

### Why this exact lint setup?

- **`priority = -1` on groups (`all`, `pedantic`)** — Cargo requires lint
  groups to have a lower priority than individual lints (`0` by default) so you
  can selectively tune or relax specific lints in `Cargo.toml` without conflict.
- **No `nursery` in hard CI gates** — Clippy's `nursery` group contains
  unfinished, experimental lints that frequently produce false positives or
  change behavior on routine 6-week `stable` Rust upgrades. Pair `all` +
  `pedantic` with targeted `restriction` lints (`dbg_macro`, `todo`,
  `undocumented_unsafe_blocks`) for strictness without false-alarm CI breakage.
- **`unused_crate_dependencies = "warn"`** — flags dependencies declared in
  `Cargo.toml` that are no longer imported in code, preventing dependency-tree
  bloat (reinforced by Cargo 1.100's unused-dependency diagnostics).

In CI, run clippy with `-D warnings` so any warning fails the build:

```bash
cargo clippy --all-targets --all-features --locked -- -D warnings
```

### Suppressing lints with `#[expect(..., reason = "...")]`

When a lint is genuinely wrong for a specific piece of code, use Rust 1.81+'s
`#[expect]` attribute with an inline `reason` string (enforced at compile time
by `clippy::allow_attributes` and `clippy::allow_attributes_without_reason`):

```rust
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "clamp(0.0, 100.0) guarantees the value fits in u8 with no truncation or sign loss"
)]
let pct = used.clamp(0.0, 100.0) as u8;
```

Unlike `#[allow(...)]`, which silently stays behind forever after code is
refactored, `#[expect(...)]` emits an `unfulfilled_lint_expectations` compiler
warning as soon as the underlying code stops triggering the lint—forcing dead
suppressions to be cleaned up.

## Forbidding unsafe code

Setting `unsafe_code = "forbid"` in `[lints.rust]` (or `#![forbid(unsafe_code)]`
at the crate root) provides a compile-time guarantee that no `unsafe` block—even
inside macro expansions—can enter your crate.

If your crate *must* use `unsafe` for FFI or low-level primitives, change
`unsafe_code` from `"forbid"` to `"warn"` or `"allow"` selectively, keep
Edition 2024's default `unsafe_op_in_unsafe_fn` warning active, and keep
`clippy::undocumented_unsafe_blocks = "deny"` so every `unsafe` block requires
a `// SAFETY:` invariant justification.

## Dependency declarations

Declare dependencies cleanly and rely on Edition 2024's MSRV-aware resolver:

```toml
[dependencies]
# Standard semver range — accepts 1.x updates while excluding 2.0.
# With Edition 2024 (Resolver v3), `cargo update` automatically prefers
# versions compatible with your `package.rust-version`.
serde = { version = "1", features = ["derive"] }

# Disable default features when you only need a subset.
toml = { version = "0.8", default-features = false, features = ["parse"] }

# Opt out of C dependencies when possible. rust_backend routes through
# pure-Rust miniz_oxide instead of libz-sys, keeping a C toolchain out
# of the build and unsafe FFI out of the tree.
flate2 = { version = "1", default-features = false, features = ["rust_backend"] }
```

### Rules of thumb

1. **Use standard semver ranges** (`"1"`, `"0.8"`) and **avoid `<x.y` upper
   bounds in libraries.** Upper-bound minor pins block downstream consumers
   from unifying versions or taking security patches, and Edition 2024's
   Resolver v3 already prevents `cargo update` from selecting dependencies
   above your declared `rust-version`.
2. **Disable default features** when you only need a subset. Every enabled
   feature widens the dependency graph and audit surface.
3. **Prefer pure-Rust backends** (`rustls`, `miniz_oxide`, `gix`) over C
   wrappers (`openssl-sys`, `libz-sys`, `libgit2-sys`). They simplify
   cross-compilation and eliminate C memory-safety risks.

## Licensing

The Rust ecosystem standard is **dual-licensed under MIT OR Apache-2.0**:

- Users can choose which license to follow.
- Apache-2.0's patent grant protects contributors and users.
- MIT remains compatible with GPLv2-only consumers.

Include both `LICENSE-MIT` and `LICENSE-APACHE` files in the repository root,
and state in `CONTRIBUTING.md` that contributions are dual-licensed under the
same terms.

## Dev-dependencies

Keep `[dev-dependencies]` minimal:

```toml
[dev-dependencies]
tempfile = "3"    # temporary directories for integration tests
proptest = "1"    # property-based testing
```

While dev-dependencies are never linked into shipped release binaries
(`safe-to-deploy` in `cargo-vet`), their build scripts (`build.rs`), procedural
macros, and test helpers **execute arbitrary code on developer machines and CI
runners** (`safe-to-run`). Keep them vetted and scanned in `cargo-deny` and
`cargo-audit`.

## Binary and library targets

```toml
[[bin]]
name = "my-crate"
path = "src/main.rs"
```

If your project is primarily a CLI binary, put core logic in `src/lib.rs` and
keep `src/main.rs` as a thin entrypoint—this makes unit, property, fuzz, and
benchmark targets straightforward to wire up.

## Further reading

- [The Cargo Book: Manifest format](https://doc.rust-lang.org/cargo/reference/manifest.html)
- [The Cargo Book: Configuring Lints](https://doc.rust-lang.org/cargo/reference/manifest.html#the-lints-section)
- [Rust Edition Guide (2024 Edition)](https://doc.rust-lang.org/edition-guide/rust-2024/index.html)
- [Rust API Guidelines: Crate metadata](https://rust-lang.github.io/api-guidelines/necessities.html#crate-metadata)
