# Supply Chain Security

A direct or transitive crate can add a vulnerability or a malicious build script.
It can also add a dependency with no maintainer or copyleft license obligations.
Use `cargo-deny`, `cargo-vet`, and `cargo-audit` to check dependencies. Set
a minimum publication age to give reviewers time to identify a malicious
release.

Commit `deny.toml`, `supply-chain/`, and `Cargo.lock`. Use `--locked` in CI
and release builds. This makes the builds use the dependency versions from
the review.

## `cargo-deny`: advisories, licenses, bans, and sources

[`cargo-deny`](https://embarkstudios.github.io/cargo-deny/) uses `deny.toml`
to check dependency versions, advisories, licenses, and sources. This example
uses `cargo-deny` 0.20 or later.

```toml
# deny.toml

[graph]
targets = [
    "x86_64-unknown-linux-gnu",
    "aarch64-unknown-linux-gnu",
    "aarch64-apple-darwin",
    "x86_64-pc-windows-msvc",
]
all-features = true

[output]
feature-depth = 1

# This check identifies vulnerabilities, unsound crates, and crates with no maintainer.
[advisories]
unmaintained = "workspace"
unsound = "all"
yanked = "deny"
# Set an expiration date for each advisory exception.
ignore-expiry = "90d"
ignore = [
    # { id = "RUSTSEC-YYYY-NNNN", reason = "Not reachable; upstream fix tracked in #123", expiry = "60d" }
]

# This list identifies the permitted SPDX licenses.
[licenses]
confidence-threshold = 0.93
allow = [
    "MIT",
    "Apache-2.0",
    "Apache-2.0 WITH LLVM-exception",
    "Unicode-3.0",
    "BSD-3-Clause",
]

[licenses.private]
ignore = false

# This check identifies duplicate versions, wildcards, C wrappers, and crates that overlap std.
[bans]
multiple-versions = "warn"
wildcards = "deny"
allow-wildcard-paths = true # Permit private path dependencies in this workspace only.
highlight = "all"
deny = [
    { crate = "openssl-sys", use-instead = "rustls" },
]

# Identify crates that std or core replaces, for example lazy_static and once_cell.
[bans.std-replacements]
scope = "workspace"

# Permit packages from crates.io only.
[sources]
unknown-registry = "deny"
unknown-git = "deny"
allow-registry = ["https://github.com/rust-lang/crates.io-index"]

[sources.allow-org]
github = []
gitlab = []
bitbucket = []
```

### Dependency checks

| Section | Command | Conditions that the check identifies |
|---------|---------|--------------------------------------|
| `[advisories]` | `cargo deny check advisories` | RustSec CVEs, unsound crates, yanked versions, crates with no maintainer, and expired exceptions |
| `[licenses]` | `cargo deny check licenses` | SPDX licenses outside the permitted list, such as copyleft licenses |
| `[bans]` | `cargo deny check bans` | Wildcard dependencies, duplicate versions, prohibited C wrappers (such as `openssl-sys`), and crates that `std` replaces |
| `[sources]` | `cargo deny check sources` | Git repositories or registries that the policy does not permit |

## `cargo-vet` audits

[`cargo-vet`](https://mozilla.github.io/cargo-vet/) checks that each third-party
crate in `Cargo.lock` has an audit or an exemption. Your team can do its own
audit or import an audit from another organization. An exemption applies to
a specific version.

```toml
# supply-chain/config.toml

[cargo-vet]
version = "0.10"

# Import audit records from Google, Mozilla, ISRG, and Bytecode Alliance.
[imports.google]
url = "https://raw.githubusercontent.com/google/rust-crate-audits/main/audits.toml"

[imports.mozilla]
url = "https://raw.githubusercontent.com/mozilla/supply-chain/main/audits.toml"

[imports.isrg]
url = "https://raw.githubusercontent.com/divviup/libprio-rs/main/supply-chain/audits.toml"

[imports.bytecode-alliance]
url = "https://raw.githubusercontent.com/bytecodealliance/wasmtime/main/supply-chain/audits.toml"

[policy.my-crate]
audit-as-crates-io = false

# Exemptions for specific versions with no external audit.
[[exemptions.my-small-dep]]
version = "0.4.2"
criteria = "safe-to-deploy"
notes = "Reviewed by @owner on 2026-11-01; revisit by 2027-02-01 (#42)"
```

### Audit criteria

| Criteria | Meaning |
|----------|---------|
| `safe-to-deploy` | The crate is safe for use in release binaries. It has no malicious code or severe defects that prevent safe use. |
| `safe-to-run` | The crate is safe for local development and CI. It will not send secrets to unauthorized recipients or give unauthorized access to a computer. |

### Audit procedure

1. Use `cargo vet init`. The command creates `supply-chain/` and adds exemptions
   for current dependencies. These exemptions identify audits that are still necessary.
2. Use `cargo vet suggest` to identify small changes for review.
3. Examine a version change with `cargo vet diff <crate> <old> <new>`.
4. Record an audit with `cargo vet certify`. If you trust a publisher, you can
   record that decision with `cargo vet trust`.
5. If you accept the risk of an unaudited version, add an exemption. In
   `notes`, identify the owner. Give the conditions for the exemption and the review date.
6. After dependency updates, use `cargo vet prune` to remove exemptions that do not apply.
7. Use `cargo vet --locked` in CI. With `--locked`, the command uses the reviewed
   `supply-chain/imports.lock`. Without it, the command can download remote
   `audits.toml` files during the build.

```text
supply-chain/
├── config.toml    # Policy, trusted imports, and documented exemptions
├── audits.toml    # Audits from your maintainers
└── imports.lock   # Versions of audits that --locked uses
```

## `cargo-audit`: RustSec advisory & binary scanning

[`cargo-audit`](https://github.com/rustsec/rustsec) compares `Cargo.lock`
with the [RustSec Advisory Database](https://rustsec.org). It can also check
binaries that you compile with `cargo-auditable`.

```bash
# Audit Cargo.lock locally or in CI.
cargo audit

# To audit a release binary, configure cargo-audit with binary-scanning.
cargo audit bin target/release/my-crate
```

Both `cargo deny check advisories` and `cargo audit` use RustSec for
`Cargo.lock`. The checks give different results.

- With the example `deny.toml`, `cargo deny check advisories` fails for
  vulnerabilities, unsound crates, yanked versions, and direct workspace
  dependencies with no maintainer.
- `cargo audit` fails for vulnerabilities. It gives warnings for
  `unmaintained` and `unsound` advisories. Use `--deny warnings` to make these
  warnings cause failure. The command does not report a crate only because a
  newer version is available.
- Crates.io keeps a yanked version available for current lockfiles. New
  dependency selections usually exclude it. Block yanked versions in CI.
- `cargo audit bin` checks binaries that you compile with `cargo-auditable`.
  The check can operate without the source or the lockfile.

## Supply chain checks in CI

Use `cargo-audit` and `cargo-deny` in the `security` job. Use
`cargo vet --locked` in the `vet` job. Pin GitHub Actions to full commit SHAs.

```yaml
jobs:
  security:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3
      - uses: taiki-e/install-action@073e1fd0bc889c9aee68dbaaa927cde1b5653a83 # v2.90.11
        with:
          tool: cargo-audit,cargo-deny
      - run: cargo audit
      - run: cargo deny check

  vet:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@df2a88e9fe4098bad09cb42c3dec7187f15861fc # master
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3
      - uses: taiki-e/install-action@073e1fd0bc889c9aee68dbaaa927cde1b5653a83 # v2.90.11
        with:
          tool: cargo-vet
      - run: cargo vet --locked
```

Set a minimum publication age with [Dependabot and Cargo](dependencies.md).
The interval gives reviewers time to find a malicious release before it enters
the lockfile.

## Further reading

- [cargo-deny documentation](https://embarkstudios.github.io/cargo-deny/)
- [cargo-vet documentation](https://mozilla.github.io/cargo-vet/)
- [RustSec Advisory Database & cargo-audit](https://rustsec.org)
- [NIST SP 800-218 SSDF](https://doi.org/10.6028/NIST.SP.800-218)
