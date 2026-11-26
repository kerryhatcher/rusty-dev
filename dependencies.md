# Dependency Management

Dependencies are the largest external risk surface in a Rust project. Managing
them proactively—with automated grouping, release-age cooldowns, MSRV-aware
resolution, and minimal feature sets—keeps the dependency tree small,
auditable, and resilient against supply-chain compromises.

## Dependabot with grouping and cooldowns

[Dependabot](https://docs.github.com/en/code-security/dependabot) automates
dependency updates by opening pull requests when newer versions pass your
configured policy:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "cargo"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "chore" # PR title "chore(deps): bump …" (no release on its own)
      include: "scope"
    cooldown:
      default-days: 7
      semver-major-days: 14
      semver-minor-days: 7
      semver-patch-days: 3
    groups:
      cargo-minor-and-patch:
        update-types:
          - "minor"
          - "patch"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "ci" # PR title "ci(deps): bump …"
      include: "scope"
    cooldown:
      default-days: 7
    groups:
      actions:
        patterns:
          - "*"
```

### Why `groups:` and `cooldown:` both matter

- **True batching requires `groups:`** — `interval: "weekly"` alone still opens
  *one separate PR per outdated crate* every week. Configuring `groups:`
  combines routine minor/patch updates into a single weekly PR while keeping
  major semver bumps isolated for focused review.
- **Supply-chain cooldown (`cooldown:`)** — "publish-and-pounce" attacks rely
  on automated bots ingesting malicious releases within hours of publication,
  before community detection and registry takedown. A 3-to-7 day cooldown lets
  routine releases age safely while **security advisory updates bypass the
  cooldown automatically**.

### What Dependabot covers (and does not)

- **Routine version updates** — updates explicitly declared dependencies in
  `Cargo.toml` (and `Cargo.lock`) plus SHA-pinned GitHub Actions (updating both
  the commit SHA and its `# vX.Y.Z` comment).
- **Security updates** — opens immediate PRs (bypassing cooldown) for vulnerable
  dependencies, including lockfile-only transitive crates.
- **Not covered** — `rust-toolchain.toml` is not updated by Dependabot; bump it
  deliberately or use [Renovate](https://docs.renovatebot.com/) if you want
  automated toolchain PRs.

## Native Cargo publish-age cooldown (Rust 1.100+)

Dependabot cooldowns do not stop a developer's manual `cargo update` or newly
resolved transitive dependencies from pulling a brand-new release published
minutes ago. Enforce a matching minimum publish age natively in Cargo
(`.cargo/config.toml`, stabilized in Cargo 1.100):

```toml
# .cargo/config.toml
[registry]
global-min-publish-age = "7 days"
```

When an emergency security patch was published within the window, update that
specific package deliberately after verifying the advisory.

## Version specification strategies

### Prefer standard semver ranges (avoid `<x.y` upper bounds)

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = { version = "1", features = ["preserve_order"] }
flate2 = { version = "1", default-features = false, features = ["rust_backend"] }
```

Standard Cargo semver ranges (`"1"`, `"0.8"`) accept non-breaking minor and
patch updates while automatically excluding the next breaking major version.

Avoid restrictive minor upper bounds like `">=1.1, <1.2"` in published
libraries:

- **Edition 2024 (`resolver = "3"`) is already MSRV-aware** — Cargo's resolver
  checks `package.rust-version` across the dependency graph and automatically
  falls back to MSRV-compatible versions during `cargo update` rather than
  breaking older toolchains.
- **Upper bounds fragment downstream trees** — pinning `<1.2` in a library
  prevents downstream applications from unifying dependency versions or picking
  up `1.2.x` security fixes. Add an upper-bound pin only for a concrete known
  defect or missing upstream `rust-version` metadata, and document the reason
  beside the pin.
- **Set honest lower bounds in libraries** — if you rely on an API added in
  `serde 1.0.200`, declare `"1.0.200"`, not `"1"`. Verify direct lower bounds
  with `cargo +nightly update -Z direct-minimal-versions` followed by a check
  build.

## Dependency hygiene

### Keep the tree small and prune unused crates

Every dependency adds CVE exposure, maintainer trust surface, compile time, and
`unsafe` blocks. Two guardrails keep the graph lean:

1. **Write trivial helpers inline** — if a utility takes 30–50 lines of safe
   standard-library Rust, write it directly instead of importing a micro-crate
   and its transitive dependencies. Inspect transitive weight and duplicate
   versions with `cargo tree` and `cargo tree -d`.
2. **Enable `unused_crate_dependencies = "warn"`** in `[lints.rust]` (backed by
   Cargo 1.100's unused-dependency diagnostics, or `cargo-machete` across complex
   multi-target workspaces) so refactored-away dependencies cannot linger in
   `Cargo.toml`.

### Disable default features and prefer pure-Rust backends

```toml
flate2 = { version = "1", default-features = false, features = ["rust_backend"] }
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }
```

Disabling default features strips unneeded optional dependencies, and choosing
pure-Rust/memory-safe backends (`miniz_oxide` instead of `libz-sys`, `rustls`
instead of `openssl-sys`) eliminates C build toolchains, simplifies
cross-compilation, and shrinks the `unsafe` FFI surface.

### Justify every addition

Every PR adding a new dependency should state in its commit message or PR
description why existing dependencies or `std` are insufficient, its license,
its maintenance posture, and its `cargo vet` disposition.

## Lockfile management

### Commit `Cargo.lock` for applications—and usually libraries too

- **Applications, CLIs, and services:** Always commit `Cargo.lock` and pass
  `--locked` in CI and release builds so every build is deterministic.
- **Libraries:** Modern Cargo (`cargo new --lib` since Rust 1.75) **no longer
  adds `Cargo.lock` to `.gitignore` by default**. Committing `Cargo.lock` in a
  library repository gives contributors deterministic CI, reliable MSRV checks,
  and working `git bisect`. Downstream consumers of your library on crates.io
  are unaffected—Cargo always ignores a dependency's `Cargo.lock` and resolves
  against `Cargo.toml`.
- **Catching upstream breakage in libraries:** If you commit `Cargo.lock` in a
  library, add a non-blocking scheduled CI job on `stable` that runs
  `CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS=allow cargo update` followed by
  `cargo test` so you get early warning if a brand-new upstream release (even
  one above your MSRV floor) breaks compatibility.

### `cargo update` discipline

- Run `cargo update` deliberately (or review grouped Dependabot PRs).
- Inspect `Cargo.lock` diffs (`cargo vet diff` or `git diff Cargo.lock`) to see
  added or upgraded transitive crates.
- Run `just ci` after every lockfile change.

## Further reading

- [Dependabot options reference (`groups` and `cooldown`)](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
- [The Cargo Book: Specifying Dependencies](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html)
- [The Cargo Book: Resolver MSRV-aware version selection](https://doc.rust-lang.org/cargo/reference/resolver.html#rust-version)
- [Rust Blog: Committing Lockfiles](https://blog.rust-lang.org/2023/08/29/committing-lockfiles/)
