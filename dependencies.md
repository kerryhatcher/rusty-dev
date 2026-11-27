# Dependency Management

Each dependency can add a security risk. Use Dependabot to group updates and
set a minimum publication age. Use Cargo to select versions that support the
minimum supported Rust version (MSRV). Enable only the necessary features.

## Dependabot groups and minimum publication age

[Dependabot](https://docs.github.com/en/code-security/dependabot) opens pull
requests for updates that meet the dependency policy.

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "cargo"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "chore" # release_commits excludes titles such as "chore(deps): bump …".
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

### Purposes of `groups:` and `cooldown:`

- With only `interval: "weekly"`, Dependabot opens a different pull request for
  each outdated crate. Use `groups:` to put minor and patch updates in one
  weekly pull request. Review major updates in different pull requests.
- Use `cooldown:` to give reviewers time to find malicious releases before
  Dependabot selects them. An interval of three to seven days is an example.
  Security advisory updates can ignore this interval automatically.

### Updates that Dependabot can make

- Dependabot updates dependencies in `Cargo.toml` and `Cargo.lock`.
  For GitHub Actions, it updates the commit SHA and the version comment.
- Dependabot opens security update pull requests immediately. This also
  applies to transitive dependencies that appear only in `Cargo.lock`.
- Dependabot does not update `rust-toolchain.toml`. To update this file
  automatically, use [Renovate](https://docs.renovatebot.com/).

## Cargo minimum publication age (Rust 1.100 or later)

Dependabot's minimum publication age applies to Dependabot only. A manual
`cargo update` or a new transitive dependency can select a recent release.
Set the same minimum age in `.cargo/config.toml`. Cargo 1.100 added this option.

```toml
# .cargo/config.toml
[registry]
global-min-publish-age = "7 days"
```

If a necessary security patch is newer than the minimum age, examine the advisory.
Then use this command to select the patch.

```bash
CARGO_RESOLVER_INCOMPATIBLE_PUBLISH_AGE=allow cargo update -p '<crate>' --precise '<version>'
```

Replace `<crate>` and `<version>` with the crate name and patch version.
The override applies to all versions that Cargo selects for this command.
Examine new transitive versions in the `Cargo.lock` diff.

## Version requirements

### Standard Semantic Versioning ranges

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = { version = "1", features = ["preserve_order"] }
flate2 = { version = "1", default-features = false, features = ["rust_backend"] }
```

Standard Cargo ranges such as `"1"` and `"0.8"` permit compatible updates.
They exclude the next incompatible version.

- Use standard ranges in published libraries. Cargo Resolver v3 gives priority
  to dependencies that support `package.rust-version`.
- Use a minor-version upper limit such as `<1.2` only for a known defect or missing MSRV metadata.
  Record why the limit is necessary. An upper limit can prevent a user from
  using one dependency version or getting a security fix.
- Set the lowest version that has the APIs your library uses. For example,
  if an API first appears in Serde 1.0.200, set `"1.0.200"`.
- To check the lower limits for direct dependencies, use
  `cargo +nightly update -Z direct-minimal-versions`. Then build the library.

## Dependency maintenance

### Unused dependencies

Each dependency adds code to compile and review. It can also add
vulnerabilities or `unsafe` code.

1. If 30 to 50 lines of standard library code are sufficient, write the function in the crate.
2. Examine the dependency tree with `cargo tree`.
3. Examine duplicate versions with `cargo tree -d`.
4. Set `unused_crate_dependencies = "warn"` in `[lints.rust]`.

Cargo 1.100 gives diagnostics for unused dependencies. You can also use
`cargo-machete` for workspaces with multiple targets.
   `Cargo.toml`.

### Default features and pure-Rust backends

```toml
flate2 = { version = "1", default-features = false, features = ["rust_backend"] }
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }
```

If only some features are necessary, disable the default features.
When possible, use a pure-Rust backend such as `miniz_oxide` or `rustls`.
You can then build without a C toolchain. It can also decrease the amount
of `unsafe` code at the foreign function interface (FFI).

### New dependencies

If you add a dependency, show why it is necessary in the commit message or pull request.
Give the license, maintenance status, and `cargo vet` audit or exemption status.

## Lockfile management

### When to commit `Cargo.lock`

- For an application, command-line tool, or service, commit `Cargo.lock`.
  Use `--locked` in CI and release builds.
- For a library, usually commit `Cargo.lock`. This gives CI and MSRV checks a
  fixed set of dependency versions. It also supports `git bisect`. Cargo
  `new --lib` no longer adds the lockfile to `.gitignore` as of Rust 1.75.
- Cargo uses the dependencies' `Cargo.toml` files to select versions for users
  of a published library. It ignores the dependencies' lockfiles.
- If you commit a library lockfile, add a scheduled, non-blocking CI job on `stable`.
  Use `CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS=allow cargo update` in that job.
  Then start the tests with `cargo test`. The job can identify compatibility
  problems with new dependencies, including versions above the library's MSRV.

### Updates to `Cargo.lock`

1. Use `cargo update` when you plan an update, or review a grouped Dependabot pull request.
2. Examine the changes in `Cargo.lock` with `cargo vet diff` or `git diff Cargo.lock`.
3. Start the checks with `just ci` after each lockfile change.

## Further reading

- [Dependabot options reference (`groups` and `cooldown`)](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
- [The Cargo Book: Specifying Dependencies](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html)
- [The Cargo Book: Resolver MSRV-aware version selection](https://doc.rust-lang.org/cargo/reference/resolver.html#rust-version)
- [Rust Blog: Committing Lockfiles](https://blog.rust-lang.org/2023/08/29/committing-lockfiles/)
