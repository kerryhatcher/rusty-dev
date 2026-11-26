# Security Scanning

Beyond Cargo dependency policy, a production Rust repository should prevent
secrets from entering Git history, scan filesystem artifacts for multi-ecosystem
vulnerabilities, statically audit CI workflows for injection flaws, and monitor
`unsafe` code across the dependency tree.

## Secret prevention and Trivy filesystem scanning

### Pre-receive defense: GitHub Push Protection

CI scanners run *after* a commit has already been pushed—if a secret reaches a
public branch or pull request, consider it compromised and rotate it immediately.
Enable **GitHub Secret Scanning and Push Protection** (**Settings → Security and
quality → Advanced Security**) so GitHub rejects pushes containing recognizable
tokens, cloud keys, or private keys before they enter Git history. Optionally
pair this locally with a pre-commit scanner like [`gitleaks`](https://github.com/gitleaks/gitleaks).

### Repository & lockfile scanning: Trivy

[Trivy](https://trivy.dev) scans your repository (`Cargo.lock`, containerfiles,
scripts, and configuration files) for known CVEs and hardcoded secrets:

```bash
trivy fs --scanners vuln,secret --exit-code 1 --skip-dirs target .
```

- `--scanners vuln,secret` — focuses on vulnerability and secret detection.
- `--exit-code 1` — fails CI when findings exist.
- `--skip-dirs target` — skips compiled build artifacts for speed and signal.

> **Pin both the scanner action SHA and the Trivy binary `version:`:** In March
> 2026, attackers published a malicious Trivy release (`v0.69.4`) and rewrote
> 75+ tags of `aquasecurity/trivy-action` and `setup-trivy` to
> credential-stealing code (`CVE-2026-33634` / `GHSA-69fq-xp46-6x23`). Security
> scanners execute with full access to runner memory and environment: always pin
> the action to a verified 40-char commit SHA, pin the `version:` input rather
> than floating on `latest`, and run scanners in read-only jobs holding zero
> secrets.

## CI workflow static analysis: `zizmor`

A memory-safe Rust binary cannot protect your users if a GitHub Actions workflow
has a template-injection bug (`${{ github.event.pull_request.title }}` in `run:`),
an unpinned action, or dangerous `pull_request_target` permissions that let an
attacker steal release credentials.

Use [`zizmor`](https://docs.zizmor.sh/) (written in Rust) locally and in CI to
statically audit `.github/workflows/`:

```bash
zizmor .github/workflows
```

## Tracking `unsafe` code in your tree

### 1. Compiler and Clippy enforcement (your own code)

Start with `unsafe_code = "forbid"` in `[lints.rust]`:

```toml
[lints.rust]
unsafe_code = "forbid"
```

If a crate genuinely requires `unsafe` (for FFI or verified low-level
primitives), Edition 2024 warns on `unsafe_op_in_unsafe_fn` by default, and
`clippy::undocumented_unsafe_blocks = "deny"` ensures every `unsafe` block
documents its `// SAFETY:` invariant at compile time.

### 2. Dependency-tree `unsafe` metrics (`cargo-geiger` and alternatives)

[`cargo-geiger`](https://github.com/geiger-rs/cargo-geiger) counts `unsafe`
functions, expressions, traits, and `impl`s across your crate and every
transitive dependency:

```makefile
# Informational metric — leading `-` ignores cargo-geiger's nonzero exit codes
# on macro/resolver quirks.
geiger:
    -cargo geiger
```

### Practical guidance on `unsafe` scanners

- **Treat counts as a triage signal, not a pass/fail gate** — a small, heavily
  audited `unsafe` block in `std` or `zerocopy` is safer than sprawling,
  unreviewed safe logic. Watch for unexpected jumps when updating or choosing
  dependencies.
- **Tooling alternatives** — `cargo-geiger` has a large dependency tree and
  slower maintenance cadence on brand-new Rust syntax. If you want a tiny, fast
  structural scanner, consider [`cargo-issafe`](https://crates.io/crates/cargo-issafe)
  or [`cargo-trust`](https://github.com/ids1024/cargo-trust); for call-graph
  effect tracking (unsafe, filesystem, and network reachability), evaluate
  [`cargo-scan`](https://github.com/PLSysSec/cargo-scan).

## Putting it together in CI

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
          tool: just,cargo-audit,cargo-deny,cargo-geiger
      - run: cargo audit
      - run: cargo deny check
      - uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
        with:
          version: "v0.76.2"
          scan-type: fs
          scanners: vuln,secret
          exit-code: "1"
          skip-dirs: target
      - uses: zizmorcore/zizmor-action@45d7276c9ca790aabd705e31ca99c6185c3e76dd # v0.8.1
        with:
          advanced-security: false
      - run: just geiger
```

## Further reading

- [Trivy documentation](https://trivy.dev)
- [zizmor documentation](https://docs.zizmor.sh/)
- [GitHub Secret Scanning & Push Protection](https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection)
- [cargo-geiger](https://github.com/geiger-rs/cargo-geiger)
