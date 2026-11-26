# Enterprise Readiness Guide

Enterprise security teams and government procurers do not expect zero defects;
they expect risks to be visible, owned, and systematically controlled. A mature
Rust project provides inspectable evidence answering four questions:

1. **Who is accountable?** Maintainers, security contacts, CODEOWNERS, release
   approvers, and support commitments are public, role-based, and current.
2. **Can we verify a release?** Every release links its immutable source commit,
   protected CI build, locked dependency tree, SHA-256 checksums, CISA-aligned
   SBOM, crates.io OIDC Trusted Publishing provenance, and SLSA build
   attestations.
3. **Can we operate it safely?** Supported platforms, rolling MSRV policy,
   secure defaults, privilege boundaries, resource caps, and upgrade notes are
   documented.
4. **What happens when something breaks?** Private vulnerability reporting,
   response targets, EU CRA / SLA escalation paths, coordinated GitHub + RustSec
   advisories, and blameless post-incident corrective actions are established.

Rust eliminates entire classes of memory-safety bugs in safe code, but it does
not replace a security program: `unsafe`/FFI boundaries, logic and access-control
flaws, integer wraparound, denial of service, CI workflow integrity, and
third-party crates still require explicit engineering controls.

## Golden-pattern maturity model

| Stage | Minimum outcome | Evidence an adopter can inspect |
| --- | --- | --- |
| **1. Foundation** | Legally clear, buildable, and documented | `README.md`, `LICENSE-MIT` + `LICENSE-APACHE`, `CONTRIBUTING.md`, rolling MSRV & platform tiers |
| **2. Controlled development** | Reviewed, deterministic changes | GitHub Rulesets, `CODEOWNERS`, SHA-pinned CI, `zizmor`, `--locked` builds, `#[expect]` lints |
| **3. Secure supply chain** | Constrained, aged, and audited dependencies | Committed `Cargo.lock`, cooldowns (`global-min-publish-age` + Dependabot), `deny.toml`, `supply-chain/` (`cargo vet --locked`) |
| **4. Trusted releases** | Verifiable, secretless release artifacts | `release-plz` PR history, crates.io OIDC Trusted Publishing, `cargo-auditable`, CISA 2026 SBOM, `SHA256SUMS`, SLSA v1.2 attestations |
| **5. Sustainable operations** | Predictable maintenance and incident response | `SECURITY.md`, `GOVERNANCE.md`, `SUPPORT.md`, scheduled advisory scans, RustSec advisory history, deprecation notices |

Treat Stages 1–3 as the baseline for any public repository, and Stages 4–5 as
mandatory before marketing a project as production-ready infrastructure.

## What to publish in the repository

| Artifact | Owner | What it must answer |
| --- | --- | --- |
| `README.md` | maintainers | Purpose, supported OS/architectures, rolling MSRV policy, quick start, verification commands, and safe operational limits |
| `LICENSE-MIT`, `LICENSE-APACHE`, notices | governance/legal | Patent and redistribution rights, plus any required third-party notices |
| `SECURITY.md` | security response owner | Private reporting channels, supported versions, triage SLAs, EU CRA posture, and RustSec disclosure flow |
| `SUPPORT.md` (or README section) | maintainers | Supported release lines, maintenance window, community vs commercial support, and deprecation policy |
| `GOVERNANCE.md` | project lead | Decision rules, maintainer onboarding/emeritus rules, crates.io team ownership, and break-glass controls |
| `CONTRIBUTING.md`, `AGENTS.md`, `CODEOWNERS` | maintainers | Local `just ci` workflow, coding/agent guardrails, dual-license notice, and mandatory reviewers for sensitive paths |
| `CHANGELOG.md` and release notes | release automation (`release-plz`) | User-visible changes, MSRV bumps, breaking-change migration steps, and security fixes |
| `docs/security/` | security lead | Threat model, cryptographic choices (`rustls`, `zeroize`), `unsafe`/FFI inventory, and deployment hardening |

Avoid publishing personal email addresses or phone numbers without consent; use
GitHub Private Vulnerability Reporting, GitHub teams, and role mailboxes so
continuity survives individual turnover.

## Repository and organization controls

Enforce platform controls via GitHub Rulesets and Organization Security
Configurations—not just prose guidelines:

- **Branch & tag rulesets:** Require pull requests, passing status checks,
  resolved conversations, linear history, CODEOWNER review on sensitive paths,
  dismissal of stale approvals, and tag protection locking `v*` tags to the
  release app.
- **Identity & registry resilience:** Require phishing-resistant MFA across org
  members, grant least-privilege team roles, assign crates.io ownership to a
  GitHub Team (`github:org:team`), and publish via crates.io OIDC Trusted
  Publishing rather than personal API tokens.
- **Hardened GitHub Actions:** Set top-level `permissions: contents: read`, pin
  every action by 40-character commit SHA, audit workflows with `zizmor`,
  enable Secret Scanning Push Protection, and isolate release credentials/OIDC
  inside protected GitHub Environments.

## Release evidence packet

For every production release, publish and retain a verifiable evidence set:

1. **Source & change record:** Immutable `vX.Y.Z` tag, `CHANGELOG.md` entry,
   `cargo-semver-checks` compatibility verification, and MSRV compatibility.
2. **Auditable binaries & hashes:** Binaries compiled with `cargo auditable build --release --locked`
   plus `SHA256SUMS`.
3. **CISA 2026-compliant SBOM:** CycloneDX (`cargo-cyclonedx`) or SPDX 2.3
   (`cargo-sbom`) generated from the exact release target/features (excluding
   dev-dependencies), capturing **component hashes**, **licenses**, **SBOM tool
   name**, **transitive coverage**, and **generation context**.
4. **Build & source provenance (SLSA v1.2):** GitHub Artifact Attestations
   (`actions/attest-build-provenance@v4`) binding artifact digests to the
   repository, commit, and release workflow, alongside `gh attestation verify`
   instructions.
5. **CI & risk disposition:** Passing cross-platform test logs, `cargo-deny` /
   `cargo-audit` results, and documented, time-bounded `cargo-vet` exemptions.

## Start new or retrofit an existing project

### 1. Inventory and assign owners

Catalog crates, binaries, container images, registries, supported platforms,
maintainers, secrets, workflows, and downstream consumers. Name a release owner
and a security-response owner, and add crates.io GitHub Team ownership.

### 2. Close public-trust and governance gaps

Add `LICENSE-MIT` + `LICENSE-APACHE`, `SECURITY.md` (with GitHub Private
Vulnerability Reporting enabled), `CONTRIBUTING.md`, `AGENTS.md`, `CODEOWNERS`,
and a realistic support/MSRV policy.

### 3. Lock down paths to `main` and `release`

Enable branch and `v*` tag rulesets, GitHub Immutable Releases, Secret Scanning
Push Protection, least-privilege workflow `permissions:`, full-SHA action pins
(enforced by Actions policy), `zizmor` workflow scanning, and Dependabot with
`groups:` and `cooldown:`.

### 4. Make builds deterministic and modern

Adopt `edition = "2024"` and a rolling MSRV, commit `Cargo.lock`, configure
Cargo's `global-min-publish-age`, enforce `[lints]` with `#[expect(..., reason = "...")]`,
and run `--locked` across `just ci` and GitHub Actions.

### 5. Layer supply-chain and release trust

Enable `cargo-audit` and `cargo-deny`, then establish `cargo-vet` (`--locked`)
with imported peer audits and time-bounded exemptions. Switch releases to
`release-plz` with crates.io OIDC Trusted Publishing, `cargo-auditable`, CISA
2026 SBOMs, and `actions/attest-build-provenance@v4`.

### 6. Operate, test, and improve continuously

Add `proptest`, `cargo-fuzz`, `cargo-mutants`, and Miri/Kani according to your
threat model; rehearse a private advisory + RustSec submission; review `cargo-vet`
and `deny.toml` expirations quarterly; and turn every incident into an automated
regression check.

## Procurement and regulatory posture

Maintain a lightweight procurement packet linking this repository's controls to
adopter frameworks:

- **US Federal (SSDF, OMB M-26-05, & CISA 2026 SBOM):** Federal agencies evaluate
  secure development practices against **NIST SP 800-218 (SSDF v1.1)**, AI
  governance supplement **SP 800-218A**, and track the **SP 800-218 Rev. 1
  (SSDF v1.2) draft** (map to final v1.1 until v1.2 is finalized). Under **OMB
  Memorandum M-26-05** (which rescinded the blanket M-22-18/M-23-16 universal
  mandate in favor of risk-based agency procurement), agencies still routinely
  require CISA Secure Software Development Attestations and machine-readable
  SBOMs meeting **CISA's July 2026 Minimum Elements** via contract clauses.
  Obtain legal/compliance review before signing formal government attestations.
- **European Union (Cyber Resilience Act — CRA):** Commercial manufacturers
  placing software on the EU market are subject to **Article 14 mandatory 24h/72h
  reporting** of actively exploited vulnerabilities (live **September 11, 2026**)
  and full CE-marking, security-lifecycle, and SBOM mandates taking effect
  **December 11, 2027** (when deferred Open-Source Steward obligations also
  apply). Automated SBOMs, `cargo-auditable`, and coordinated disclosure make
  24-hour impact triage achievable.
- **Transparent public signals:** [OpenSSF Best Practices Badge](https://www.bestpractices.dev/),
  [OpenSSF Scorecard](https://scorecard.dev/), and the tiered
  [OpenSSF OSPS Baseline](https://baseline.openssf.org/) give prospective
  adopters automated visibility and a structured control catalog complementing
  customer risk review.

## Source documents

- [NIST SP 800-218: Secure Software Development Framework (SSDF)](https://doi.org/10.6028/NIST.SP.800-218) & [SP 800-218 Rev. 1 (SSDF v1.2 draft)](https://csrc.nist.gov/pubs/sp/800/218/r1/ipd)
- [CISA 2026 Minimum Elements for a Software Bill of Materials (SBOM)](https://www.cisa.gov/sbom)
- [CISA Software Acquisition Guide for Government Enterprise Consumers](https://www.cisa.gov/resources-tools/resources/software-acquisition-guide-government-enterprise-consumers)
- [EU Cyber Resilience Act (Regulation (EU) 2024/2847)](https://eur-lex.europa.eu/eli/reg/2024/2847/oj)
- [SLSA v1.2 specification](https://slsa.dev/spec/v1.2/)
- [OpenSSF Best Practices Badge](https://www.bestpractices.dev/), [OpenSSF Scorecard](https://scorecard.dev/), & [OpenSSF OSPS Baseline](https://baseline.openssf.org/)
- [GitHub Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
