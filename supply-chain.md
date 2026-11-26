# Supply Chain Security

Rust's crate ecosystem is both a productivity multiplier and a primary supply-chain
attack surface. Every direct or transitive crate can introduce vulnerabilities,
unmaintained dependencies, copyleft license obligations, or malicious build
scripts. Three complementary tools—`cargo-deny`, `cargo-vet`, and
`cargo-audit`—combined with release-age cooldowns make every dependency and
exception explicit, reviewable, and reversible.

Keep all policy files (`deny.toml`, `supply-chain/`) and `Cargo.lock` in version
control, and always pass `--locked` in CI and release builds so the graph being
built is the exact graph that was reviewed.

## `cargo-deny`: advisories, licenses, bans, and sources

[`cargo-deny`](https://embarkstudios.github.io/cargo-deny/) enforces structural,
legal, and source policies across your dependency graph via `deny.toml`
(compatible with `cargo-deny` 0.20+):

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

# `cargo deny check advisories` — vulnerabilities, unsoundness, and unmaintained crates.
[advisories]
unmaintained = "workspace"
unsound = "all"
yanked = "deny"
# Require advisory exceptions to expire so temporary waivers never become permanent.
ignore-expiry = "90d"
ignore = [
    # { id = "RUSTSEC-YYYY-NNNN", reason = "Not reachable; upstream fix tracked in #123", expiry = "60d" }
]

# `cargo deny check licenses` — SPDX license allowlist.
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

# `cargo deny check bans` — duplicate versions, wildcards, C-wrapper bans, std overlaps.
[bans]
multiple-versions = "warn"
wildcards = "deny"
highlight = "all"
deny = [
    { crate = "openssl-sys", use-instead = "rustls" },
]

# Flag crates superseded by modern Rust `std`/`core` (e.g., lazy_static, once_cell).
[bans.std-replacements]
scope = "workspace"

# `cargo deny check sources` — restrict packages exclusively to crates.io.
[sources]
unknown-registry = "deny"
unknown-git = "deny"
allow-registry = ["https://github.com/rust-lang/crates.io-index"]

[sources.allow-org]
github = []
gitlab = []
bitbucket = []
```

### What each section protects

| Section | Command | What it catches |
|---------|---------|-----------------|
| `[advisories]` | `cargo deny check advisories` | RustSec CVEs, unsound crates, yanked versions, unmaintained dependencies, and expired waivers |
| `[licenses]` | `cargo deny check licenses` | Unapproved or copyleft SPDX licenses across all target platforms |
| `[bans]` | `cargo deny check bans` | Wildcard dependencies, duplicate versions, banned C wrappers (`openssl-sys`), and crates absorbed into `std` |
| `[sources]` | `cargo deny check sources` | Unvetted git repositories or alternate registries |

## `cargo-vet`: cryptographic human audit policy

[`cargo-vet`](https://mozilla.github.io/cargo-vet/) ensures every third-party
crate in `Cargo.lock` is covered by a human code review—either audited directly
by your team, imported from trusted peer organizations, or covered by an
explicit, version-pinned exemption:

```toml
# supply-chain/config.toml

[cargo-vet]
version = "0.10"

# Import public human-reviewed audit sets from Google, Mozilla, ISRG, and Bytecode Alliance.
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

# Explicit, version-pinned exemptions where no external audit exists yet.
[[exemptions.my-small-dep]]
version = "0.4.2"
criteria = "safe-to-deploy"
notes = "Reviewed by @owner on 2026-11-01; revisit by 2027-02-01 (#42)"
```

### Audit criteria

| Criteria | Meaning |
|----------|---------|
| `safe-to-deploy` | Safe to ship in production binaries: no malicious code or severe trustworthiness defects. |
| `safe-to-run` | Safe to execute during local development/CI (`[dev-dependencies]`, test helpers): will not exfiltrate secrets or compromise workstations. |

### Workflow and `--locked` discipline

1. **Inspect deltas before certifying** — when updating a crate, run
   `cargo vet diff <crate> <old> <new>` to audit only the changed lines, then
   record the review with `cargo vet certify`.
2. **Keep exemptions time-bounded** — record an owner, rationale, and review
   date in `notes`. Prefer differential audits over rolling exemptions forward.
3. **Always run `cargo vet --locked` in CI** — without `--locked`, `cargo-vet`
   can fetch live remote `audits.toml` files at build time instead of verifying
   strictly against your reviewed `supply-chain/imports.lock`.

```text
supply-chain/
├── config.toml    # Policy, trusted imports, and documented exemptions
├── audits.toml    # First-party audits performed by your maintainers
└── imports.lock   # Locked snapshot of imported audits (enforced by --locked)
```

## `cargo-audit`: RustSec advisory & binary scanning

[`cargo-audit`](https://github.com/rustsec/rustsec) checks `Cargo.lock`—and
compiled binaries built with `cargo-auditable`—against the
[RustSec Advisory Database](https://rustsec.org):

```bash
# Audit Cargo.lock in source/CI
cargo audit

# Audit a compiled release binary (requires cargo-audit built with `binary-scanning`)
cargo audit bin target/release/my-crate
```

While `cargo-deny check advisories` and `cargo-audit` both consult RustSec for
`Cargo.lock`, `cargo-audit` provides fast standalone CLI triage and post-build
binary inspection via `cargo-auditable`.

## Putting it together in CI

Run `cargo-audit` and `cargo-deny` in the `security` job, and run
`cargo vet --locked` in the `vet` job with SHA-pinned actions:

```yaml
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: dtolnay/rust-toolchain@e97e2d8cc328f1b50210efc529dca0028893a2d9 # v1
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@c19371144df3bb44fab255c43d04cbc2ab54d1c4 # v2.9.1
      - uses: taiki-e/install-action@75a7c0f8cb8b77ef2757283626db49f6920f75a7 # v2.90.6
        with:
          tool: cargo-audit,cargo-deny
      - run: cargo audit
      - run: cargo deny check

  vet:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: dtolnay/rust-toolchain@e97e2d8cc328f1b50210efc529dca0028893a2d9 # v1
        with:
          toolchain: stable
      - uses: Swatinem/rust-cache@c19371144df3bb44fab255c43d04cbc2ab54d1c4 # v2.9.1
      - uses: taiki-e/install-action@75a7c0f8cb8b77ef2757283626db49f6920f75a7 # v2.90.6
        with:
          tool: cargo-vet
      - run: cargo vet --locked
```

Pair these gates with **Dependabot `cooldown`** and Cargo 1.100's
**`global-min-publish-age`** (see [Dependency Management](dependencies.md)) so
brand-new compromised releases are held back before they ever reach your lockfile.

## Further reading

- [cargo-deny documentation](https://embarkstudios.github.io/cargo-deny/)
- [cargo-vet documentation](https://mozilla.github.io/cargo-vet/)
- [RustSec Advisory Database & cargo-audit](https://rustsec.org)
- [NIST SP 800-218 SSDF](https://doi.org/10.6028/NIST.SP.800-218)
