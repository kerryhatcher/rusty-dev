# Security Scanning

Beyond supply-chain auditing, a production Rust project needs to scan the
filesystem for vulnerabilities and hardcoded secrets, and track `unsafe` usage
in the dependency tree.

## Trivy: filesystem vulnerability and secret scanning

[Trivy](https://trivy.dev) is a comprehensive scanner that checks the
filesystem for known vulnerabilities and accidentally committed secrets.

```bash
trivy fs --scanners vuln,secret --exit-code 1 --skip-dirs target .
```

### What it catches

- **Vulnerabilities** — CVEs in any language or toolchain file
  (`Cargo.lock`, `package.json`, etc.).
- **Secrets** — hardcoded API keys, passwords, tokens, and private keys
  that should never be committed.

### Configuration

- `--scanners vuln,secret` — only scan for vulnerabilities and secrets.
  Skip the slower malware and misconfiguration scanners unless you need them.
- `--exit-code 1` — fail the build if anything is found.
- `--skip-dirs target` — the `target/` directory is build artifacts, not
  source code. Scanning it is slow and produces noise.

For Rust dependencies, Trivy reads `Cargo.lock` and overlaps with
`cargo audit`/`cargo deny`. Its distinct value is secret scanning and
coverage of non-Rust files (container images, `package-lock.json`, etc.).
A dedicated secret scanner such as GitHub secret scanning with push
protection, or `gitleaks`, is a reasonable alternative.

### Treat the scanner as a dependency too

In March 2026 attackers used stolen credentials to publish a malicious Trivy
release (v0.69.4) and rewrite almost every tag of `aquasecurity/trivy-action`
and `setup-trivy` to credential-stealing code (CVE-2026-33634). Pipelines
that referenced those tags leaked the secrets available to the runner.
Security tools run with the same access as everything else in CI:

- Pin the action by full commit SHA and verify the SHA against the upstream
  release before adopting it.
- Pin the Trivy binary version (`version:` input) rather than `latest`.
- Run scanners in jobs that hold no secrets and have a read-only token.

### When to run

- **CI** — on every commit, as part of the security job.
- **Locally** — before committing, especially if you are working with
  credentials or configuration files.

## `cargo-geiger`: tracking unsafe usage

[cargo-geiger](https://github.com/geiger-rs/cargo-geiger) reports how much
`unsafe` code exists in your crate and its dependency tree.

```bash
cargo geiger
```

### What it reports

- **Your crate** — how many `unsafe` blocks, functions, traits, and
  implementations exist in your own code.
- **Dependencies** — the same metrics for every crate in the tree, recursively.

### How to use it

- **Informational only** — `cargo-geiger` is a metric, not a pass/fail gate.
  The exit code can be nonzero due to internal warnings unrelated to actual
  `unsafe` findings.
- **Trend tracking** — watch the `unsafe` count over time. A sudden increase
  in a dependency's `unsafe` usage is worth investigating.
- **Dependency selection** — when choosing between two crates, prefer the one
  with less `unsafe` code, all else being equal.

### In the justfile

```makefile
# Report unsafe-code usage in this crate and its dependency tree.
# Informational only — not a pass/fail gate (the leading `-` ignores
# cargo-geiger's exit code).
geiger:
    -cargo geiger
```

The leading `-` tells `just` to ignore the recipe's exit code, so CI never
fails on `cargo-geiger` warnings.

## `#![forbid(unsafe_code)]`: the zero-unsafe guarantee

If your crate does not need `unsafe`, add this at the crate root:

```rust
#![forbid(unsafe_code)]
```

(or `unsafe_code = "forbid"` under `[lints.rust]` in `Cargo.toml`; see
[scaffolding](scaffolding.md#forbidding-unsafe-code)).

This is a **compile-time guarantee** that no `unsafe` block exists anywhere
in your crate's own source. Combined with `cargo-geiger`, you can see exactly which
dependencies introduce `unsafe` and make informed decisions about whether
to accept that risk.

## Putting it together

In CI, the security job runs all three:

```yaml
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: dtolnay/rust-toolchain@stable
      - uses: taiki-e/install-action@v2
        with:
          tool: cargo-audit,cargo-deny,cargo-geiger
      - run: cargo audit
      - run: cargo deny check
      - uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
        with:
          scan-type: fs
          scanners: vuln,secret
          exit-code: "1"
          skip-dirs: target
      - run: cargo geiger || true  # informational, never fails the build
```

## Further reading

- [Trivy documentation](https://trivy.dev)
- [cargo-geiger documentation](https://github.com/geiger-rs/cargo-geiger)
- [Aqua Security Trivy GitHub Action](https://github.com/marketplace/actions/aquasecurity-trivy)
- [Aqua: Trivy supply chain attack](https://www.aquasec.com/blog/trivy-supply-chain-attack/) / [GHSA-69fq-xp46-6x23](https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23)
