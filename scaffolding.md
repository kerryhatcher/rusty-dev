# Project Scaffolding

A Rust project's `Cargo.toml` is its identity document. Getting the metadata,
lints, and constraints right on day one avoids a cascade of fixes later.

## The `Cargo.toml` skeleton

```toml
[package]
name = "my-crate"
version = "0.1.0"
edition = "2024"
rust-version = "1.85.1"
description = "A short, clear description of what this crate does"
license = "MIT OR Apache-2.0"
repository = "https://github.com/you/my-crate"
readme = "README.md"
keywords = ["cli", "tool", "productivity"]
categories = ["command-line-utilities"]
exclude = ["docs/", "assets/"]
```

### Key fields

| Field | Purpose |
|-------|---------|
| `edition` | Use `"2024"` for new crates (stable since Rust 1.85). The edition selects language rules and defaults, including the MSRV-aware dependency resolver (`resolver = "3"`). Migrate older crates with `cargo fix --edition`. |
| `rust-version` | The **minimum supported Rust version** (MSRV). Declare it explicitly so `cargo`, the resolver, and CI can enforce it. Edition 2024 requires at least 1.85. |
| `license` | Use `"MIT OR Apache-2.0"` — the standard dual-license in the Rust ecosystem. See [licensing](#licensing). |
| `description` | Required (with `license` or `license-file`) for `cargo publish`. |
| `repository` | Link to the source. Not strictly required, but `cargo publish` warns without one of `repository`, `homepage`, or `documentation`, and adopters expect it. |
| `keywords` / `categories` | Help people discover the crate on crates.io (at most five keywords). Keep them accurate. |
| `exclude` | Files to omit from the published crate. Keeps the tarball small. Check the result with `cargo package --list`. |

## Toolchain pinning

Pin the toolchain developers and CI use for day-to-day work in
`rust-toolchain.toml` so everyone gets the same `rustfmt` and `clippy`
behaviour. This is separate from the MSRV, which is the *oldest* toolchain
you support:

```toml
# rust-toolchain.toml
[toolchain]
channel = "1.100.0"
components = ["rustfmt", "clippy"]
```

Bump the pinned channel deliberately (Dependabot does not update this file;
Renovate can). If you prefer to track the latest stable, use
`channel = "stable"` and accept that a new release can introduce new lints.

## Lints

Configure lints in `Cargo.toml` (stable since Rust 1.74) rather than in
crate-root attributes, so every target in the package shares one policy:

```toml
[lints.rust]
unsafe_code = "forbid"

[lints.clippy]
# Groups get a lower priority so individual lints below can override them.
# Without `priority = -1`, clippy's `lint_groups_priority` lint fails the
# build as soon as you add a single per-lint override.
all = { level = "warn", priority = -1 }
pedantic = { level = "warn", priority = -1 }
nursery = { level = "warn", priority = -1 }

# Per-lint overrides go here, each with a reason in a comment.
module_name_repetitions = "allow" # noisy for public re-exports
```

`nursery` lints are still under development and can produce false positives;
keep the group only if your team is willing to suppress the occasional bad
suggestion. Never enable the `restriction` group wholesale. Pick individual
restriction lints (for example `clippy::unwrap_used` or
`clippy::allow_attributes_without_reason`) instead.

Then in CI, run clippy with `-D warnings` so any new lint fails the build:

```bash
cargo clippy --all-targets --locked -- -D warnings
```

When a lint is genuinely wrong for a specific piece of code, suppress it with
`#[expect(..., reason = "...")]` (stable since Rust 1.81). Unlike `#[allow]`,
`#[expect]` itself warns when the lint stops firing, so stale suppressions do
not accumulate, and the `reason` is recorded in the code:

```rust
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "clamp(0.0, 100.0) guarantees the value fits in u8"
)]
let pct = used.clamp(0.0, 100.0) as u8;
```

## Forbidding unsafe code

If your crate does not need `unsafe`, forbid it — either with
`unsafe_code = "forbid"` under `[lints.rust]` as above, or at the crate root:

```rust
#![forbid(unsafe_code)]
```

This is a compile-time guarantee that no `unsafe` block in your crate's own
source, including code produced by your own `macro_rules!` macros, can sneak
in, and `forbid` cannot be overridden with a later `#[allow]`. It also makes
`cargo-geiger` findings trivially actionable: any `unsafe` in the dependency
tree is someone else's code to track.

If you do need `unsafe`, edition 2024 already tightens the defaults
(`unsafe_op_in_unsafe_fn` warns, `extern` blocks must be `unsafe extern`, and
`std::env::set_var`/`remove_var` are `unsafe`). Add
`undocumented_unsafe_blocks = "warn"` under `[lints.clippy]` so every block
carries a `// SAFETY:` comment.

## Dependency declarations

Declare dependencies thoughtfully:

```toml
# Caret range — accepts any semver-compatible update.
serde = { version = "1", features = ["derive"] }

# Disable default features you do not need; every feature is code to audit.
toml = { version = "1", default-features = false, features = ["std", "parse", "serde"] }

# Opt out of C dependencies when possible. rust_backend routes through
# pure-Rust miniz_oxide instead of libz-sys, keeping a C toolchain out
# of the build and cargo-geiger's unsafe count down.
flate2 = { version = "1", default-features = false, features = ["rust_backend"] }
```

### Rules of thumb

1. **Prefer caret ranges** (`"1"`, `"0.3"`) for well-maintained crates.
   They let `cargo update` apply compatible releases. The lockfile, not the
   version requirement, is what makes a build reproducible.
2. **Let the resolver protect the MSRV.** With edition 2024 (or
   `resolver = "3"`), Cargo prefers dependency versions whose `rust-version`
   is compatible with yours, so you rarely need upper-bound pins just to hold
   the MSRV. See [MSRV management](msrv.md#preventing-msrv-drift).
3. **Pin an upper bound only for a concrete reason** — a known-bad release,
   a behaviour change you have not adopted, or a version that pulls in a C
   toolchain — and record the reason next to the pin.
4. **Disable default features** when you only need a subset.
5. **Prefer pure-Rust backends** over C libraries. They eliminate build-time
   toolchain requirements and reduce the `unsafe` surface.

## Licensing

The Rust ecosystem standard is **dual-licensed under MIT OR Apache-2.0**.
This means:

- Users can choose which license to follow.
- Apache-2.0's patent grant protects contributors and users.
- MIT is compatible with GPL projects (including GPLv2, which Apache-2.0 is
  not).

Include both `LICENSE-MIT` and `LICENSE-APACHE` files in the repository root.
Add a note in `CONTRIBUTING.md` that contributions are dual-licensed under
the same terms.

## Dev-dependencies

Keep dev-dependencies separate and minimal:

```toml
[dev-dependencies]
tempfile = "3"    # temporary directories for integration tests
filetime = "0.2"  # file timestamp manipulation in tests
```

Dev-dependencies never ship to end users, but they still execute on developer
machines and CI runners, which often hold credentials. `cargo-vet` therefore
holds them to `safe-to-run` rather than `safe-to-deploy`, and they still
appear in `cargo-deny` and `cargo-audit` scans. Treat build-dependencies and
proc-macros as code that runs at build time with full access.

## Binary targets

Cargo auto-discovers `src/main.rs` (a binary named after the package) and
`src/lib.rs` (the library), so most crates need no target sections at all.
Add an explicit section only to rename a target or change its path:

```toml
[[bin]]
name = "my-tool"
path = "src/main.rs"
```

## Further reading

- [The Cargo Book: Manifest format](https://doc.rust-lang.org/cargo/reference/manifest.html)
- [The Cargo Book: `[lints]`](https://doc.rust-lang.org/cargo/reference/manifest.html#the-lints-section)
- [Rust Reference: lint check attributes (`expect`)](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes)
- [Rust API Guidelines: Crate metadata](https://rust-lang.github.io/api-guidelines/necessities.html#crate-metadata)
- [Rust Edition Guide: Rust 2024](https://doc.rust-lang.org/edition-guide/rust-2024/index.html)
- [rustup: toolchain file](https://rust-lang.github.io/rustup/overrides.html#the-toolchain-file)
