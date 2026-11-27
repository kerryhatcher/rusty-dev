# Minimum Supported Rust Version

The minimum supported Rust version (MSRV) is the earliest toolchain on which
the crate builds and gives satisfactory test results. Cargo Resolver v3 uses the MSRV to select
dependency versions. A continuous integration (CI) job does the checks on that toolchain.

## MSRV policy

Rust makes a stable release at six-week intervals. Rust does not maintain long-term
support branches or add security fixes to previous stable releases. For
example, when Rust publishes `1.100.0`, upstream support for `1.99.x` ends.

A fixed MSRV can keep users on compilers without security fixes. It also limits
access to changes in the language and the standard library. Select a policy
for your project. Record the policy in `README.md`.

| Project type | Recommended MSRV | Example when stable is `1.100` |
|--------------|------------------|--------------------------------|
| Applications and command-line tools | The latest stable release or two releases earlier (N-2, approximately three months) | `"1.98"` to `"1.100"` |
| General libraries | Four releases before the latest stable release (N-4, approximately six months) | `"1.96"` |
| Base libraries and libraries in Linux packages | The minimum for the Rust edition or the toolchain of the target Linux distribution | `"1.85"` to `"1.92"` |

Set `rust-version` in `Cargo.toml`.

```toml
[package]
edition = "2024"
rust-version = "1.96"
```

If you use a workspace, set `rust-version = "1.96"` in `[workspace.package]`.
Set `rust-version.workspace = true` in each member crate.

## How Cargo Resolver v3 uses the MSRV

Cargo selects Resolver v3 by default if the root package uses Rust Edition 2024.
In a virtual workspace, the editions of member crates do not set the resolver.
For Resolver v3 in a virtual workspace, set `resolver = "3"` in `[workspace]`.
To use Resolver v3, use Rust 1.84 or a newer version. Resolver v3 sets `incompatible-rust-versions`
to `"fallback"` by default.

When you use `cargo add` or `cargo update`, Cargo reads the
`package.rust-version` value of each candidate dependency. For example, the latest dependency version can make Rust `1.99` necessary.
For a crate with `rust-version = "1.96"`, Cargo usually selects the latest
dependency version that supports `1.96`.

To examine newer versions without the MSRV limit, use
`cargo update --ignore-rust-version`. To read the metadata for a crate, use
`cargo info <crate>`.

### Resolver limits

The `fallback` policy gives priority to versions that support the MSRV.
The continuous integration (CI) check is necessary for these cases.

1. No version in the permitted range supports the MSRV. Cargo can select a
   version that cannot build with the MSRV.
2. Workspace crates share a dependency version. The shared version can be incompatible
   with the MSRV of one or more crates.
3. A dependency has no `package.rust-version` value. Cargo cannot use the MSRV
   to select a version of that dependency.

If a dependency becomes incompatible with the MSRV, set an upper version limit for that dependency.
Add a comment that gives the condition for removal of the limit.

## Local MSRV check

Use [`cargo-msrv`](https://github.com/foresterre/cargo-msrv) to check the toolchain
in `rust-version`. As an alternative, use `cargo hack check --rust-version`
with [`cargo-hack`](https://github.com/taiki-e/cargo-hack).

```bash
cargo msrv verify
# If you do not know the MSRV, use this command.
# cargo msrv find
```

### In the `justfile`

```makefile
# Check the toolchain in rust-version in Cargo.toml.
msrv:
    cargo msrv verify
```

## Enforcing MSRV in CI

The CI job starts the full test suite on the toolchain in `rust-version`. It
uses `--locked` to use the dependency versions in `Cargo.lock`.

```yaml
jobs:
  msrv:
    name: msrv (1.96)
    runs-on: ubuntu-latest
    env:
      # Use Rust 1.96 instead of the version in rust-toolchain.toml.
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

### Full test suite

`cargo check` does not link binaries or start tests. Standard library
behavior, `const` evaluation, or a dependency with no `rust-version` can cause
a failure during a build or test on the MSRV.

For a published library, you can also check the lowest permitted versions of
direct dependencies. Use `cargo +nightly update -Z direct-minimal-versions`
before you build the library.

## Increase the MSRV

1. Make sure that the new MSRV agrees with the version policy. For example,
   the policy can permit an increase to N-4 in a minor release only.
2. Set `rust-version` in `Cargo.toml`.
3. Put the new MSRV in the `msrv` job name.
4. Set `env.RUSTUP_TOOLCHAIN` in the job to the new MSRV.
5. Set the toolchain action's `with.toolchain` input to the new MSRV.
6. Update `AGENTS.md`.
7. Commit these changes together. Use a commit title that agrees with your
   Semantic Versioning policy, for example `chore: bump MSRV to 1.96`.
8. If the previous MSRV limited dependency versions, use `cargo update`.

## Further reading

- [The Cargo Book: MSRV-aware Resolver (`rust-version`)](https://doc.rust-lang.org/cargo/reference/resolver.html#rust-version)
- [The Cargo Book: `cargo info`](https://doc.rust-lang.org/cargo/commands/cargo-info.html)
- [cargo-msrv documentation](https://github.com/foresterre/cargo-msrv)
- [Rust Release Channel & Platform Support](https://doc.rust-lang.org/rustc/platform-support.html)
