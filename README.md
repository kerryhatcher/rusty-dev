# Rust

Production Rust project setup — tooling, CI/CD, security, testing, release,
and governance patterns that make the project credible to maintainers and
defensible to enterprise and government adopters. The goal is evidence, not
checkboxes: a user should be able to see how changes are controlled, how
releases are produced, what is in them, and how the project responds when
something goes wrong.

This is a practical pattern, not a claim of compliance. Map it to your
organization's legal, contractual, and regulatory obligations. In particular,
US federal consumers commonly assess suppliers against the [NIST Secure
Software Development Framework (SSDF)](https://doi.org/10.6028/NIST.SP.800-218),
and commercial products placed on the EU market face mandatory obligations
under the [EU Cyber Resilience Act (CRA)](https://eur-lex.europa.eu/eli/reg/2024/2847/oj).

## Contents

- [Enterprise readiness guide](enterprise-readiness.md) — maturity model,
  adopter evidence, ownership, regulatory posture, and a retrofit sequence
- [Secure development lifecycle](secure-development.md) — threat modeling,
  secure defaults, ANSSI & Edition 2024 safety rules, testing, and SSDF mapping
- [Project scaffolding](scaffolding.md) — `Cargo.toml` setup, Edition 2024,
  rolling MSRV, `[lints]` configuration, and `unsafe_code = "forbid"`
- [Code quality gates](code-quality.md) — `rustfmt`, `clippy` (`#[expect]`),
  `rustdoc` checks, and `cargo-semver-checks`
- [Testing strategy](testing.md) — unit, integration, doctests, `cargo-nextest`,
  property-based testing, mutation testing (`cargo-mutants`), and Miri/Kani
- [Supply chain security](supply-chain.md) — `cargo-deny`, `cargo-vet`,
  `cargo-audit`, and dependency trust
- [Security scanning](security-scanning.md) — Trivy, Push Protection, `zizmor`
  workflow analysis, and `unsafe` tracking (`cargo-geiger` / `cargo-issafe`)
- [MSRV management](msrv.md) — rolling MSRV policy, Cargo Resolver v3,
  verification, and CI enforcement
- [CI/CD pipeline](ci-cd.md) — GitHub Actions matrix builds, SHA-pinned actions,
  separate job design, and `zizmor` verification
- [Release automation](releases.md) — Rust-native `release-plz`, Conventional
  Commits, crates.io OIDC Trusted Publishing, SBOMs, and provenance attestations
- [Dependency management](dependencies.md) — Dependabot groups & cooldowns,
  Cargo `global-min-publish-age`, lockfile policy, and dependency hygiene
- [Local development](local-dev.md) — `justfile`, `AGENTS.md` / `CLAUDE.md`,
  `cargo-binstall`, `CONTRIBUTING.md`, and the developer experience
- [Security policy](security-policy.md) — `SECURITY.md`, private vulnerability
  reporting, EU CRA timelines, and coordinated RustSec disclosure
- [Project governance](governance.md) — `GOVERNANCE.md`, Contributor Covenant
  v3.0, dual licensing, crates.io team ownership, and rulesets

## The non-negotiable release baseline

Before asking a risk-conscious organization to run a release, make sure it
has a supported-version policy, private vulnerability reporting, protected
default branch, reviewed and SHA-pinned CI inputs, a committed lockfile,
dependency/license/advisory policy with cooldown gates, crates.io OIDC Trusted
Publishing (where published), a published SBOM meeting CISA 2026 minimum
elements, release provenance attestations, checksums, and a documented way to
verify them. The enterprise guide explains the evidence each control should
produce.

## Source documents

- [NIST SP 800-218: Secure Software Development Framework (SSDF)](https://doi.org/10.6028/NIST.SP.800-218)
- [ANSSI Secure Rust Guidelines](https://anssi-fr.github.io/rust-guide/)
- [OpenSSF Best Practices Badge](https://www.bestpractices.dev/)
- [SLSA v1.2 specification](https://slsa.dev/spec/v1.2/)
- [CISA 2026 Minimum Elements for a Software Bill of Materials (SBOM)](https://www.cisa.gov/sbom)
- [CISA Software Acquisition Guide for Government Enterprise Consumers](https://www.cisa.gov/resources-tools/resources/software-acquisition-guide-government-enterprise-consumers)
