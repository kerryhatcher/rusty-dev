# Rust

These guides give instructions to configure a production Rust project. They
show how to control changes and build releases. They show how to record
what a release contains. They also give the procedure for security incidents.

Compare these procedures with the legal, contractual, and regulatory
requirements for your organization. US federal buyers commonly use the
[NIST Secure Software Development Framework (SSDF)](https://doi.org/10.6028/NIST.SP.800-218)
to examine supplier practices. The
[EU Cyber Resilience Act (CRA)](https://eur-lex.europa.eu/eli/reg/2024/2847/oj)
specifies requirements for commercial products on the EU market. Use these
guides as examples. Do a compliance assessment for the applicable requirements.

## Contents

- [Enterprise readiness guide](enterprise-readiness.md) — Project controls, owners, and records for adopters
- [Secure development lifecycle](secure-development.md) — Threat models, secure defaults, Rust safety checks, and SSDF
- [Project configuration](scaffolding.md) — Cargo metadata, Rust edition, toolchain, and lints
- [Code quality checks](code-quality.md) — Format, lint, documentation, and API compatibility checks
- [Testing strategy](testing.md) — Test types, test tools, and tests for `unsafe` code
- [Supply chain security](supply-chain.md) — Dependency checks with `cargo-deny`, `cargo-vet`, and `cargo-audit`
- [Security scanning](security-scanning.md) — Scans for secrets, vulnerabilities, workflow errors, and `unsafe` code
- [Minimum supported Rust version](msrv.md) — Version policy, Cargo Resolver v3, and CI checks
- [CI/CD pipeline](ci-cd.md) — GitHub Actions jobs, test platforms, and action versions
- [Release automation](releases.md) — Release pull requests, Trusted Publishing, and release verification
- [Dependency management](dependencies.md) — Dependabot, minimum publication age, and the lockfile
- [Local development](local-dev.md) — Tool installation, `justfile`, and contributor instructions
- [Security policy](security-policy.md) — Private vulnerability reports, response times, and RustSec advisories
- [Project governance](governance.md) — Roles, licenses, repository rules, and the code of conduct

## Minimum release requirements

Before you give a release to an organization, make sure that the project has
these controls.

- Publish a policy that identifies the supported versions.
- Provide a private channel for vulnerability reports.
- Enable branch protection for the default branch.
- Review the inputs that continuous integration (CI) uses.
- Pin GitHub Actions to full commit SHAs.
- Commit the lockfile.
- Set rules for dependencies, licenses, advisories, and minimum publication age.
- If you publish to crates.io, use OIDC Trusted Publishing.

Provide these files and instructions with the release.

- Publish a software bill of materials (SBOM) with the minimum elements that CISA specifies for 2026.
- Publish build provenance attestations.
- Publish checksums.
- Give adopters the commands to check the release files.

For a list of the records for each control, refer to the
[enterprise readiness guide](enterprise-readiness.md).

## Source documents

- [NIST SP 800-218: Secure Software Development Framework (SSDF)](https://doi.org/10.6028/NIST.SP.800-218)
- [ANSSI Secure Rust Guidelines](https://anssi-fr.github.io/rust-guide/)
- [OpenSSF Best Practices Badge](https://www.bestpractices.dev/), [OpenSSF Scorecard](https://scorecard.dev/), and [OpenSSF OSPS Baseline](https://baseline.openssf.org/)
- [SLSA v1.2 specification](https://slsa.dev/spec/v1.2/)
- [CISA 2026 Minimum Elements for a Software Bill of Materials (SBOM)](https://www.cisa.gov/sbom)
- [CISA Software Acquisition Guide for Government Enterprise Consumers](https://www.cisa.gov/resources-tools/resources/software-acquisition-guide-government-enterprise-consumers)
