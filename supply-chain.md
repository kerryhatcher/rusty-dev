# Supply Chain Security

Rust's dependency ecosystem is one of its greatest strengths — and one of its
largest attack surfaces. Every crate you depend on is a potential vector for
malicious code, vulnerable libraries, or license violations. Three tools work
together to manage this risk.

No tool can prove that a dependency is safe. The policy goal is to make every
accepted dependency and exception explicit, reviewable, and reversible. Keep
the policy files and the lockfile in version control; use `--locked` in CI and
release builds so the resolved graph is the graph that was reviewed.

## `cargo-deny`: license, ban, and duplicate checking

`cargo-deny` checks your dependency tree against a policy file (`deny.toml`).
It covers four areas. Generate a commented starting file with
`cargo deny init`, then tighten it:

### Configuration

```toml
# deny.toml

[graph]
all-features = false
no-default-features = false

[output]
feature-depth = 1

# `cargo deny check advisories` — RustSec vulnerabilities, unmaintained and
# unsound crates, and yanked versions.
[advisories]
# Only flag unmaintained crates you depend on directly; transitive ones are
# reported by `cargo audit` and tracked through upstream.
unmaintained = "workspace"
yanked = "deny"
# Each ignore needs an id and a reason, e.g.
# { id = "RUSTSEC-0000-0000", reason = "not reachable: we never call X" }
ignore = []

# `cargo deny check licenses` — only these licenses are allowed.
[licenses]
allow = ["MIT", "Apache-2.0", "Unicode-3.0"]
confidence-threshold = 0.8

[licenses.private]
ignore = false

# `cargo deny check bans` — duplicate/banned/wildcard-version crates.
[bans]
multiple-versions = "warn"
# crates.io rejects wildcard requirements anyway; deny them everywhere except
# path dependencies between private (unpublished) workspace crates.
wildcards = "deny"
allow-wildcard-paths = true
highlight = "all"
workspace-default-features = "allow"
external-default-features = "allow"
allow-workspace = false

# `cargo deny check sources` — only allow crates.io.
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
| `[advisories]` | `cargo deny check advisories` | Known vulnerabilities, unmaintained/unsound crates, yanked versions |
| `[licenses]` | `cargo deny check licenses` | Copyleft or unapproved licenses in the tree |
| `[bans]` | `cargo deny check bans` | Duplicate versions of the same crate, banned crates |
| `[sources]` | `cargo deny check sources` | Dependencies from untrusted registries or git repos |

### Key decisions

- **License allowlist** — start with `["MIT", "Apache-2.0", "Unicode-3.0"]`
  and add licenses only after reviewing them. Every addition is a conscious
  decision.
- **Source restrictions** — deny unknown registries and unknown git sources.
  A dependency pulled from a random GitHub repo is an unvetted supply-chain
  risk.
- **Multiple versions** — warn on duplicates. Two versions of the same crate
  double the audit surface and may indicate a semver mismatch.

## `cargo-vet`: supply chain audits

`cargo-vet` (from Mozilla) establishes a **trust policy** for every
dependency. Each crate must be either:

1. **Audited** — someone with authority has reviewed the source and vouches
   for it.
2. **Exempted** — the project explicitly accepts the risk for a specific
   version.
3. **Imported** — an audit from a trusted third party (Google, Mozilla) is
   accepted.

### Configuration

```toml
# supply-chain/config.toml

[cargo-vet]
version = "0.10"

# Import audits from Google and Mozilla.
[imports.google]
url = "https://raw.githubusercontent.com/google/rust-crate-audits/main/audits.toml"

[imports.mozilla]
url = "https://raw.githubusercontent.com/mozilla/supply-chain/main/audits.toml"

[policy.my-crate]
audit-as-crates-io = false

# Exemptions for crates that have not been audited.
[[exemptions.serde]]
version = "1.0.229"
criteria = "safe-to-deploy"

[[exemptions.tempfile]]
version = "3.10.1"
criteria = "safe-to-run"
```

### Audit criteria

| Criteria | Meaning |
|----------|---------|
| `safe-to-deploy` | The crate is safe to ship to end users. No malicious or vulnerable code. |
| `safe-to-run` | The crate is safe to run during development or testing. Not necessarily safe to ship. |

### Workflow

1. **Bootstrap** — `cargo vet init` creates `supply-chain/` and records an
   exemption for every existing dependency, so the check passes on day one.
   Those exemptions are your audit backlog, not a statement that anything was
   reviewed.
2. **New dependency** — run `cargo vet` to see what is unvetted. If someone
   reviews the code, record it with `cargo vet certify` (an audit in
   `audits.toml`). Only if you knowingly accept the crate *without* review,
   add an exemption with a reason.
3. **Version change** — `cargo vet` checks whether the delta has been audited.
   `cargo vet suggest` lists the smallest diffs you could review, and
   `cargo vet diff` shows them. Prefer certifying the delta over adding a new
   exemption.
4. **Import audits** — Google and Mozilla maintain public audit sets.
   Importing them covers many common crates (serde, quote, syn, etc.).
   `cargo vet trust` can also trust a specific publisher of a crate.
5. **Prune** — run `cargo vet prune` after updates to drop exemptions that
   audits or imports now cover.

### Exemption discipline

An exemption is a recorded risk acceptance, not an audit. Require an exact
version, the scope/criterion, a concise reason, an owner, and an expiry or
review date in the `notes` field or linked issue. Review exemptions on every
dependency update and at least quarterly. Prefer a differential audit of the
new version over perpetually extending an exemption.

### Files

```
supply-chain/
├── config.toml    # Policy, imports, exemptions
├── audits.toml    # Your own audit entries (initially empty)
└── imports.lock   # Pinned import state (auto-generated)
```

## `cargo-audit`: RustSec advisory database

`cargo-audit` checks `Cargo.lock` against the
[RustSec Advisory Database](https://rustsec.org) — a curated collection of
security advisories for Rust crates.

```bash
cargo audit
```

This is the fastest check to run and the one most likely to catch something
actionable. It overlaps with `cargo deny check advisories`; running both is
cheap, but one is enough if you want a single source of truth. Run it in CI
and on a schedule (see [CI/CD](ci-cd.md#evidence-retention-and-scheduled-checks)),
because new advisories appear without any change to your code. `cargo audit bin`
scans a compiled binary built with `cargo auditable`.

### What it catches

- **Vulnerabilities** — versions with a RustSec advisory (errors), with the
  patched version range when one exists.
- **Unmaintained and unsound crates** — informational advisories (warnings by
  default; `--deny warnings` makes them fail).
- **Yanked versions** — versions the author has yanked. Yanked versions stay
  downloadable for existing lockfiles but should not be used for new
  resolutions.

It does **not** report merely outdated dependencies; use `cargo outdated` or
Dependabot for that.

## Putting it together

In CI, run all three checks in the security job:

```yaml
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: taiki-e/install-action@v2
        with:
          tool: cargo-audit,cargo-deny
      - run: cargo audit
      - run: cargo deny check
```

And in the vet job:

```yaml
jobs:
  vet:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@stable
      - uses: taiki-e/install-action@v2
        with:
          tool: cargo-vet
      - run: cargo vet check
```

Pin these actions by full commit SHA in a real workflow; see
[CI/CD](ci-cd.md#pinning-action-versions).

## Further reading

- [cargo-deny documentation](https://embarkstudios.github.io/cargo-deny/)
- [cargo-vet documentation](https://mozilla.github.io/cargo-vet/)
- [cargo-audit documentation](https://github.com/rustsec/rustsec)
- [RustSec Advisory Database](https://rustsec.org)
- [Cargo Vet configuration and policy](https://mozilla.github.io/cargo-vet/config.html)
- [NIST SSDF: third-party software component practices](https://doi.org/10.6028/NIST.SP.800-218)
