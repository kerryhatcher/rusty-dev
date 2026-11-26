# MSRV Management

The **Minimum Supported Rust Version** (MSRV) is the oldest Rust toolchain your
crate promises to build and pass tests with. Declaring an explicit MSRV policy,
using Edition 2024's MSRV-aware resolver, and testing that exact version in CI
prevents silent breakage for users on slightly older toolchains.

## Choosing a rolling MSRV policy

Upstream Rust ships a new stable release **every 6 weeks** and **does not
provide LTS branches or backport security fixes to older stable releases**—once
a new stable version is released (e.g., `1.100.0`), the previous stable release
(`1.99.x`) immediately reaches upstream end-of-life.

Because of this, freezing an MSRV indefinitely leaves users on unpatched
compilers while starving your codebase of standard-library and language
improvements. Pick an explicit policy and document it in `README.md`:

| Project type | Recommended MSRV policy | Example (when stable is `1.100`) |
|--------------|-------------------------|----------------------------------|
| **Applications / CLIs** | Latest stable or **N-2** (~3 months) | `"1.98"` – `"1.100"` |
| **General libraries** | **N-4 rolling window** (~6 months) | `"1.96"` |
| **Foundational / distro-packaged libraries** | Edition floor (`"1.85"` for Edition 2024) or target Linux distribution toolchain | `"1.85"` – `"1.92"` |

Declare your chosen floor in `Cargo.toml`:

```toml
[package]
edition = "2024"
rust-version = "1.96"
```

In workspaces, set `rust-version = "1.96"` in `[workspace.package]` and inherit
it with `rust-version.workspace = true` in every crate.

## How Cargo Resolver v3 prevents MSRV drift

In **Edition 2024** (or whenever `resolver = "3"` is set on Rust 1.84+), Cargo's
dependency resolver is **MSRV-aware by default**
(`incompatible-rust-versions = "fallback"`):

- When you run `cargo add` or `cargo update`, Cargo inspects each candidate
  dependency's `package.rust-version` metadata.
- If the newest version of a dependency requires Rust `1.99` and your crate
  declares `rust-version = "1.96"`, Cargo automatically selects the newest
  compatible version that still supports `1.96` instead of breaking your MSRV
  build.
- Consequently, you **do not** need brittle `<x.y` upper-bound version pins in
  `Cargo.toml` just to protect MSRV. (If you ever want to inspect the newest
  versions regardless of MSRV when evaluating an MSRV bump, pass
  `cargo update --ignore-rust-version` or inspect crate metadata with the
  built-in `cargo info <crate>` command.)

## Verifying the MSRV locally

Use [`cargo-msrv`](https://github.com/foresterre/cargo-msrv) locally to verify
that your crate compiles cleanly on the exact toolchain declared in
`rust-version`:

```bash
cargo msrv verify
```

### In the `justfile`

```makefile
# Verify the crate still builds on its declared MSRV (Cargo.toml's rust-version).
msrv:
    cargo msrv verify
```

## Enforcing MSRV in CI

CI runs the full test suite—not just `cargo check`—against the pinned MSRV
toolchain with `--locked`:

```yaml
jobs:
  msrv:
    name: msrv (1.96)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: dtolnay/rust-toolchain@e97e2d8cc328f1b50210efc529dca0028893a2d9 # v1
        with:
          toolchain: "1.96"
      - uses: Swatinem/rust-cache@c19371144df3bb44fab255c43d04cbc2ab54d1c4 # v2.9.1
      - run: cargo test --all-features --locked
```

### Why run the full test suite instead of `cargo check`?

- Standard-library behavior, `const` evaluation, or transitive crates without
  an explicit `rust-version` field can still fail at link or test time on an
  older compiler.
- For published libraries that omit `Cargo.lock` or support wide version ranges,
  consider an additional check with `-Z minimal-versions` (on nightly) or
  [`cargo-hack`](https://github.com/taiki-e/cargo-hack) to verify your declared
  minimum dependency bounds actually compile.

## How to bump the MSRV

1. Check whether raising MSRV falls within your documented rolling window (for
   example, bumping `rust-version` to `N-4` in a minor release, not a patch
   release).
2. Update `rust-version` in `Cargo.toml`, the CI `msrv` job name/toolchain, and
   `AGENTS.md` in a dedicated commit (`chore: bump MSRV to 1.96` or `feat:` per
   your semver policy) so it stands out in `CHANGELOG.md`.
3. Run `cargo update` afterward if newer MSRV-gated dependency versions were
   previously held back by Resolver v3.

## Further reading

- [The Cargo Book: MSRV-aware Resolver (`rust-version`)](https://doc.rust-lang.org/cargo/reference/resolver.html#rust-version)
- [The Cargo Book: `cargo info`](https://doc.rust-lang.org/cargo/commands/cargo-info.html)
- [cargo-msrv documentation](https://github.com/foresterre/cargo-msrv)
- [Rust Release Channel & Platform Support](https://doc.rust-lang.org/rustc/platform-support.html)
