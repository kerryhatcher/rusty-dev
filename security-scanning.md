# Security Scanning

Scan the repository for vulnerabilities and secrets. Check the workflows for
security defects. Record the use of `unsafe` code in the dependency tree.

## Secret protection and filesystem scans

### GitHub Push Protection

CI scanners examine a commit after the push. If a secret becomes public in a
branch or pull request, replace it immediately. An unauthorized person can use the
secret to get access to the service.

Enable **GitHub Secret Scanning and Push Protection**. The option is in
**Settings**, under **Security and quality**, in **Advanced Security**.
GitHub blocks pushes that contain recognizable tokens or keys. For an
additional local check, you can use a pre-commit scanner such as
[`gitleaks`](https://github.com/gitleaks/gitleaks).

### Repository & lockfile scanning: Trivy

[Trivy](https://trivy.dev) scans the repository for known vulnerabilities and
secrets in files. The scan includes `Cargo.lock`, containerfiles, scripts,
and configuration files.

```bash
trivy fs --scanners vuln,secret --exit-code 1 --skip-dirs target .
```

- `--scanners vuln,secret` selects vulnerability and secret scans.
- `--exit-code 1` gives a failure exit code when the scan finds a problem.
- `--skip-dirs target` omits compiled files and decreases the scan time.

> **Caution.** Make sure that the scanner action uses a full 40-character
> commit SHA from its source repository.
> Set the Trivy binary version in `version:`. Use a read-only job with no
> secrets for each scan. A malicious scanner can get credentials from runner
> memory or environment variables.
>
> In March 2026, attackers published Trivy `v0.69.4` with malicious code. They
> also moved more than 75 action tags to malicious code (`CVE-2026-33634`).

## CI workflow static analysis: `zizmor`

A workflow defect can let an attacker steal release credentials. Examples
include a template injection, an action without a fixed commit SHA, or too many
permissions for `pull_request_target`.

Use [`zizmor`](https://docs.zizmor.sh/) to check `.github/workflows/` locally.
Use the same check in CI.

```bash
zizmor .github/workflows
```

## Checks for `unsafe` code

### 1. Compiler and Clippy checks

Start with `unsafe_code = "forbid"` in `[lints.rust]`:

```toml
[lints.rust]
unsafe_code = "forbid"
```

If `unsafe` is necessary, keep the Edition 2024 warning `unsafe_op_in_unsafe_fn` active.
Set `clippy::undocumented_unsafe_blocks = "deny"`. Clippy then rejects an
`unsafe` block that has no `// SAFETY:` comment for its invariant.

### 2. Dependency-tree `unsafe` metrics (`cargo-geiger` and alternatives)

[`cargo-geiger`](https://github.com/geiger-rs/cargo-geiger) counts `unsafe`
functions, expressions, traits, and implementations in the crate and its
transitive dependencies.

```makefile
# Ignore cargo-geiger failure exit codes because this recipe gives information only.
geiger:
    -cargo geiger
```

### How to use the results

- Use the counts to identify changes for review. Do not use the counts as a
  limit for the check result. A count does not show how well reviewers
  examined the code. Examine unexpected increases after a dependency change.
- `cargo-geiger` has many dependencies. New Rust syntax can make a scanner update necessary.
  For a smaller syntax scanner, use
  [`cargo-issafe`](https://crates.io/crates/cargo-issafe) or
  [`cargo-trust`](https://github.com/ids1024/cargo-trust).
- For call-graph analysis of `unsafe`, filesystem, and network operations,
  you can use [`cargo-scan`](https://github.com/PLSysSec/cargo-scan).

## Security scans in CI

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
