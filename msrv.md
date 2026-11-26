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
- Consequently, you rarely need brittle `<x.y` upper-bound version pins in
  `Cargo.toml` just to protect MSRV. (To inspect the newest versions regardless
  of MSRV when evaluating an MSRV bump, pass `cargo update --ignore-rust-version`
  or check crate metadata with the built-in `cargo info <crate>` command.)

### Resolver limits (why the CI gate is still required)

Resolver v3's `fallback` policy is a **preference, not a hard filter**:

1. If *no* release matching your semver requirement supports your `rust-version`,
   Cargo still selects a newer release rather than failing resolution.
2. Workspace version/feature unification across crates with different MSRVs can
   pull a newer shared version.
3. Dependencies that omit `package.rust-version` cannot be filtered by the
   resolver—if such a crate silently raises its MSRV, pin its upper bound with
   a comment noting when the pin can be dropped.

## Verifying the MSRV locally

Use [`cargo-msrv`](https://github.com/foresterre/cargo-msrv) (or
`cargo hack check --rust-version` from [`cargo-hack`](https://github.com/taiki-e/cargo-hack))
locally to verify that your crate compiles cleanly on the exact toolchain
declared in `rust-version`:

```bash
cargo msrv verify
# Need to discover an unknown MSRV by bisecting toolchains? Run:
# cargo msrv find
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
    env:
      # Override any committed `rust-toolchain.toml` so cargo uses 1.96.
      RUSTUP_TOOLCHAIN: "1.96"
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
        with:
          toolchain: "1.96"
      - uses: Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3
      - run: cargo test --all-features --locked
```

### Why run the full test suite instead of `cargo check`?

- Standard-library behavior, `const` evaluation, or transitive crates without
  an explicit `rust-version` field can still fail at link or test time on an
  older compiler.
- For published libraries, consider also checking direct lower bounds with
  `cargo +nightly update -Z direct-minimal-versions` so minimum declared semver
  bounds remain honest.

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
