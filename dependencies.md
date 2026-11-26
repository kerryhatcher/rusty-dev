# Dependency Management

Dependencies are the largest source of risk in any Rust project. Managing them
proactively — rather than reactively — keeps the tree small, auditable, and
maintainable.

## Dependabot

[Dependabot](https://docs.github.com/en/code-security/dependabot) automates
dependency updates by opening pull requests when new versions are available.

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "cargo"
    directory: "/"
    schedule:
      interval: "weekly"
    # Wait before proposing a brand-new release. Most malicious or broken
    # releases are caught and yanked within days. Security updates ignore
    # cooldown and still arrive immediately.
    cooldown:
      default-days: 7
    groups:
      cargo-minor-and-patch:
        update-types: ["minor", "patch"]

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    cooldown:
      default-days: 7
    groups:
      actions:
        patterns: ["*"]
```

### Why weekly, grouped, and with a cooldown?

- **Grouping** — without `groups`, Dependabot opens **one PR per
  dependency**, whatever the schedule. A group collapses compatible updates
  into one PR per ecosystem per run. Leave major versions ungrouped so each
  breaking change gets its own review.
- **Cadence** — `weekly` limits how often those PRs appear. Fewer PRs means
  less noise, lower CI cost, and more attention per PR.
- **Cooldown** — delays version updates until a release has been public for a
  while, which avoids being the first to install a compromised or broken
  release. GitHub applies a 3-day default since July 2026; set it explicitly
  so the policy is visible in the repo.
- **Review bandwidth** — a human should review every dependency update,
  including the `cargo vet` and `cargo deny` result.

### What Dependabot covers

- **Cargo dependencies** — `Cargo.toml` requirements and `Cargo.lock`
  updates, including transitive dependencies.
- **GitHub Actions** — action version updates, including SHA-pinned actions
  (it updates the SHA and the version comment together).
- **Not covered** — `rust-toolchain.toml`. Bump it by hand or use
  [Renovate](https://docs.renovatebot.com/), which supports it.

## Version requirement strategies

### Runtime dependencies: caret ranges

```toml
serde = { version = "1", features = ["derive"] }
serde_json = { version = "1", features = ["preserve_order"] }
flate2 = { version = "1", default-features = false, features = ["rust_backend"] }
```

Caret ranges (`"1"`, `"0.3"`) let `cargo update` apply semver-compatible
releases. This is the right choice for well-maintained crates with stable
APIs. Reproducibility comes from the committed `Cargo.lock`, not from tight
requirements in `Cargo.toml`.

For libraries, set the *lower* bound honestly: if you use an API added in
`serde 1.0.200`, require `"1.0.200"`, not `"1"`. Check with
`cargo +nightly update -Z minimal-versions` followed by a build.

### MSRV-sensitive dependencies: let the resolver handle it

With `edition = "2024"` (or `resolver = "3"`), Cargo's MSRV-aware resolver
prefers dependency versions compatible with your `rust-version`, so an
unbounded caret range no longer silently raises your effective MSRV. Add an
upper-bound pin only when a dependency fails to declare `rust-version` or you
have another concrete reason, and record that reason next to the pin. See
[MSRV management](msrv.md#preventing-msrv-drift).

### Dev-dependencies: caret ranges

```toml
[dev-dependencies]
tempfile = "3"
filetime = "0.2"
```

Dev-dependencies never ship to end users, so an unexpected update has less
impact on users. They still run on developer and CI machines, so they are
still in scope for `cargo vet` (`safe-to-run`) and advisory scanning.

## Dependency hygiene

### Keep the tree small

Every dependency is a vector for:

- **Vulnerabilities** — more crates means more advisories to track.
- **Supply-chain attacks** — more crates means more maintainers to trust.
- **Build time** — more crates means longer `cargo build`.
- **`unsafe` code** — more crates means more `unsafe` blocks in the tree.

A rule of thumb: **if you can implement it in 50 lines of Rust without pulling
in a crate, do it yourself.** The cost of auditing and maintaining a
dependency often exceeds the cost of writing the code. Use `cargo tree` (and
`cargo tree -d` for duplicates) to see what each addition really pulls in.

### Disable default features

```toml
flate2 = { version = "1", default-features = false, features = ["rust_backend"] }
```

Default features often pull in unnecessary dependencies. Disable them and
opt in to only what you need.

### Prefer pure-Rust backends

The `rust_backend` feature above uses `miniz_oxide` (pure Rust) instead of
`libz-sys` (C library binding). This:

- Eliminates the need for a C toolchain in the build.
- Reduces the `unsafe` count in the dependency tree.
- Simplifies cross-compilation.

### Remove unused dependencies

Recent Cargo warns about unused dependencies (`cargo::unused_dependencies`).
Tools such as [`cargo-machete`](https://github.com/bnjbvr/cargo-machete) or
[`cargo-shear`](https://github.com/Boshen/cargo-shear) can find them in CI.

### Review every addition

A new dependency should be justified in the commit message or PR description:

```
feat: add TOML config file support

Adds `toml` 1.x (default features off; std, parse, serde) for parsing the
config file. Declares rust-version 1.85, within our 1.85.1 MSRV. Imported
audits cover it; no new cargo-vet exemption needed.
```

## Lockfile management

### Commit `Cargo.lock`

Commit `Cargo.lock` for **every** project, application or library. This has
been Cargo's default guidance since August 2023, and `cargo new` no longer
adds `Cargo.lock` to `.gitignore`. It makes CI reproducible and lets
`cargo audit`, `cargo deny`, Dependabot, and Trivy see the exact graph.

For a **published library**, the lockfile is used only for the library's own
CI and development; downstream users resolve their own versions. Because of
that, also run CI periodically against the newest compatible versions
(`cargo update` in a scheduled job) so you find breakage before your users do.

### `cargo update` discipline

- Run `cargo update` deliberately, not automatically.
- Review the diff before committing — know what changed and why.
- Run the full CI suite after updating to catch regressions.
- Use `--locked` in CI and release builds so a stale or missing lockfile
  fails instead of silently resolving a new graph.

## Further reading

- [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [GitHub blog: group your updates, slow the cadence](https://github.blog/security/supply-chain-security/tame-dependabot-group-your-updates-slow-the-cadence-keep-security-fast/)
- [The Cargo Book: Specifying Dependencies](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html)
- [Cargo blog: change in guidance on committing lockfiles](https://blog.rust-lang.org/2023/08/29/committing-lockfiles/)
- [Rust API Guidelines: Dependency hygiene](https://rust-lang.github.io/api-guidelines/necessities.html#crate-metadata)
