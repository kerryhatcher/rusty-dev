# MSRV Management

The **Minimum Supported Rust Version** (MSRV) is the oldest Rust toolchain
your crate is guaranteed to build with. Declaring and enforcing an MSRV
prevents dependency bumps from silently dropping users on older toolchains.

## Declaring the MSRV

Set `rust-version` in `Cargo.toml`:

```toml
[package]
rust-version = "1.85.1"
```

This field tells `cargo` (and users) the minimum toolchain version. Cargo
refuses to build the crate on an older toolchain, the MSRV-aware resolver uses
it to choose dependency versions, and `cargo-msrv` reads it in CI.

## Choosing an MSRV policy

Write the policy down (README or `CONTRIBUTING.md`) so users know what to
expect. Common choices:

- **Latest stable only** — simplest; suitable for applications you ship as
  binaries.
- **Rolling window** — for example "the last N stable releases" or "any
  toolchain released in the last 6–12 months". Common for libraries.
- **Fixed floor tied to a platform** — for example the `rustc` shipped by a
  Linux distribution or an LTS SDK you must support.

The Rust project itself only supports the **latest stable release**. There
is no LTS channel; fixes ship as point releases of the current stable.
Your MSRV is therefore a promise *you* make, not one the Rust project backs.

## Verifying the MSRV

Use [`cargo-msrv`](https://github.com/foresterre/cargo-msrv) to verify that
the crate still builds on its declared MSRV:

```bash
cargo msrv verify
```

This command:

1. Installs the toolchain specified in `rust-version`.
2. Runs `cargo check` against it (use `--` with a custom command, for example
   `cargo msrv verify -- cargo test`, to run something else).
3. Fails if the build breaks, indicating a code change or dependency bump has
   raised the effective MSRV above the declared one.

`cargo msrv find` bisects toolchains to discover the actual MSRV when you do
not know it. [`cargo-hack`](https://github.com/taiki-e/cargo-hack) offers a
lighter alternative: `cargo hack check --rust-version` checks against the
declared `rust-version`.

### In the justfile

```just
# Verify the crate still builds on its declared MSRV (Cargo.toml's
# rust-version), catching drift from code or dependency changes.
msrv:
    cargo msrv verify
```

## Enforcing in CI

CI runs the full test suite against the pinned MSRV toolchain, not just
`cargo check`. This catches behaviour differences between toolchain versions:

```yaml
jobs:
  msrv:
    name: msrv (1.85.1)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@master
        with:
          toolchain: "1.85.1"
      - uses: Swatinem/rust-cache@v2
      - run: cargo test --locked
```

Pin actions by full commit SHA in a real workflow; see
[CI/CD](ci-cd.md#pinning-action-versions).

### Why run the full test suite instead of just `cargo check`?

- A feature that compiles on stable may behave differently on an older
  toolchain (e.g., const evaluation changes, trait resolution changes).
- The MSRV job is the **canary** — if it breaks, you know exactly which
  dependency bump or language feature caused it.

## Preventing MSRV drift

### Use the MSRV-aware resolver

Since Cargo 1.84, the resolver can prefer dependency versions whose own
`rust-version` is compatible with yours. It is the default for
`edition = "2024"` (which implies `resolver = "3"`). For older editions,
opt in with either:

```toml
# Cargo.toml (requires an MSRV of at least 1.84)
[package]
resolver = "3"
```

```toml
# .cargo/config.toml (works with any MSRV, as long as developers use Cargo ≥ 1.84)
[resolver]
incompatible-rust-versions = "fallback"
```

With this enabled, `cargo update` and `cargo add` stop picking releases that
would raise your effective MSRV, so you no longer need upper-bound version
pins just to protect it. The resolver only considers dependencies that
declare `rust-version`; a dependency without one can still break the MSRV
job, which is why CI keeps the guard.

### Pin only when the resolver cannot help

If a dependency raises its MSRV without declaring it, or in a release the
resolver would otherwise select, pin the upper bound and record the reason
next to the pin:

```toml
# some-crate 2.4 uses let-chains but does not declare rust-version;
# remove this pin once our MSRV reaches 1.88.
some-crate = { version = ">=2.3, <2.4" }
```

### Review dependency MSRVs before updating

Before accepting an update, check the new version's declared `rust-version`:
`cargo info <crate>` (built into Cargo since 1.82) prints it, and the MSRV CI
job verifies the result.

## When to raise the MSRV

- A dependency you need has raised its MSRV and the older version is no
  longer acceptable (for example, it is unmaintained or has an advisory).
- A language or standard-library feature stabilized in a newer toolchain
  would significantly improve the code.
- The toolchain has fallen outside your published MSRV policy window.

When you raise the MSRV, do it in a dedicated commit or PR so the change is
visible in the changelog and release notes. For libraries, many projects
treat an MSRV bump as a minor (not patch) version change.

## Further reading

- [The Cargo Book: `rust-version`](https://doc.rust-lang.org/cargo/reference/rust-version.html)
- [The Cargo Book: resolver and `incompatible-rust-versions`](https://doc.rust-lang.org/cargo/reference/resolver.html#rust-version)
- [Rust 1.84.0 release notes (MSRV-aware resolver)](https://blog.rust-lang.org/2025/01/09/Rust-1.84.0/)
- [cargo-msrv documentation](https://github.com/foresterre/cargo-msrv)
- [dtolnay/rust-toolchain action](https://github.com/dtolnay/rust-toolchain)
- [Rust platform support](https://doc.rust-lang.org/rustc/platform-support.html)
