# Enterprise Readiness Guide

Give adopters records that show how the project controls risks. The records
must identify the persons responsible for each control. They must give
instructions to examine a release and manage incidents.

1. Publish the maintainer and security roles, `CODEOWNERS`, release approvers, and support policy.
2. Link each release to its immutable source commit and protected CI build.
   Give the locked dependency versions, SHA-256 checksums, SBOM, Trusted
   Publishing provenance, and SLSA attestations.
3. Record the supported platforms, minimum supported Rust version (MSRV) policy, secure defaults, privilege
   limits, resource limits, and upgrade instructions.
4. Give the private channel for vulnerability reports. Give response times
   and the escalation procedure for regulatory or service-level obligations.
   Record the GitHub and RustSec disclosure process. Record corrective actions
   after an incident.

Safe Rust prevents many memory-safety defects. Other controls are necessary
for `unsafe` code, foreign function interfaces (FFI), and access control.
Use controls for integer wraparound, denial of service, CI workflow security,
and third-party crates.

## Project maturity stages

| Stage | Minimum result | Records for adopters |
| --- | --- | --- |
| 1. Foundation | License terms, build instructions, and support policy | `README.md`, `LICENSE-MIT`, `LICENSE-APACHE`, `CONTRIBUTING.md`, minimum supported Rust version (MSRV), and platform tiers |
| 2. Controlled development | Reviews and deterministic builds | GitHub Rulesets, `CODEOWNERS`, full commit SHAs for CI actions, `zizmor`, `--locked`, and `#[expect]` |
| 3. Secure supply chain | Dependency audits and minimum publication age | `Cargo.lock`, Cargo `global-min-publish-age`, Dependabot, `deny.toml`, and `cargo vet --locked` |
| 4. Release verification | Release files that adopters can check | `release-plz` pull requests, crates.io OIDC Trusted Publishing, `cargo-auditable`, CISA 2026 SBOM, `SHA256SUMS`, and SLSA v1.2 attestations |
| 5. Maintenance | Support and incident response | `SECURITY.md`, `GOVERNANCE.md`, `SUPPORT.md`, scheduled scans, RustSec advisories, and deprecation notices |

Complete stages 1 to 3 for a public repository. Before you offer the project
for production infrastructure, complete stages 4 and 5.

## What to publish in the repository

| File | Owner | Information |
| --- | --- | --- |
| `README.md` | Maintainers | Purpose, supported operating systems and architectures, MSRV, setup, checks, and safe limits |
| `LICENSE-MIT`, `LICENSE-APACHE`, and notices | Governance or legal team | Patent rights, redistribution rights, and third-party notices |
| `SECURITY.md` | Security response owner | Private reports, supported versions, initial response times, CRA obligations, and RustSec procedure |
| `SUPPORT.md` or `README.md` | Maintainers | Supported releases, maintenance period, community and commercial support, and deprecation policy |
| `GOVERNANCE.md` | Project lead | Decision rules, maintainer roles, crates.io team ownership, and emergency access |
| `CONTRIBUTING.md`, `AGENTS.md`, and `CODEOWNERS` | Maintainers | Local checks, instructions for contributors and coding agents, license terms, and mandatory reviews |
| `CHANGELOG.md` and release notes | `release-plz` | Changes that affect users, MSRV changes, migration steps, and security fixes |
| `docs/security/` | Security lead | Threat model, cryptography (such as `rustls` and `zeroize`), `unsafe` code, foreign function interfaces, and deployment controls |

Do not publish a personal email address or phone number without consent. Use
GitHub private vulnerability reporting, team accounts, and role email
addresses. These channels stay available when a maintainer leaves.

## Repository and organization controls

Use GitHub Rulesets and Organization Security Configurations to apply the
controls.

- Make pull requests, status checks, conversation resolution, and linear
  history mandatory. Make Code Owner review mandatory for sensitive paths.
  Dismiss previous approvals when new commits change a pull request.
  Limit updates to `v*` tags to the release GitHub App.
- Make phishing-resistant multi-factor authentication mandatory for
  organization members. Give each team only the necessary permissions.
  Assign crates.io ownership to a GitHub team (`github:org:team`). Use crates.io
  OIDC Trusted Publishing.
- Set `permissions: contents: read` at the top of the workflow. Use each
  action's full 40-character commit SHA. Check the workflow with `zizmor`.
  Enable Secret Scanning Push Protection. Use protected GitHub environments
  for release credentials and OIDC.

## Release records

For each production release, publish and keep these records.

1. **Source and changes.** Give the immutable `vX.Y.Z` tag and the
   `CHANGELOG.md` entry. Include the API and MSRV check results.
2. **Binaries and checksums.** Build binaries with `cargo auditable build --release --locked`.
   Include `SHA256SUMS`.
3. **SBOM.** Use CycloneDX (`cargo-cyclonedx`) or SPDX 2.3 (`cargo-sbom`).
   Use the target and features of the release. Exclude development
   dependencies. Include component hashes, licenses, and the SBOM tool name.
   Record the transitive dependencies and how the tool made the SBOM.
4. **Build and source provenance.** Use GitHub Artifact Attestations
   (`actions/attest-build-provenance@v4`). Link each artifact digest to the
   repository, commit, and release workflow. Give the instructions for
   `gh attestation verify`.
5. **CI and audit results.** Include successful test logs for each platform.
   Include results from `cargo-deny` and `cargo-audit`. Give the records of
   `cargo-vet` exemptions and their time limits.

## Apply the controls to a project

### 1. Project inventory and owners

Make an inventory of crates, binaries, container images, registries,
platforms, maintainers, secrets, workflows, and downstream users. Name a
release owner. Name a security response owner. Assign crates.io ownership
to a GitHub team.

### 2. License, support, and governance

Add `LICENSE-MIT` and `LICENSE-APACHE`. Add `SECURITY.md`. Enable GitHub
private vulnerability reporting. Add `CONTRIBUTING.md`, `AGENTS.md`, and
`CODEOWNERS`. Publish the support and MSRV policies.

### 3. Repository controls

Enable branch rulesets and `v*` tag rulesets. Enable immutable releases.
Enable Secret Scanning Push Protection. Set only the necessary workflow
permissions. Make full commit SHAs mandatory for actions. Check workflows
with `zizmor`. Configure Dependabot `groups:` and `cooldown:`.

### 4. Build controls

Set `edition = "2024"`. Select a rolling MSRV policy. Commit `Cargo.lock`.
Set Cargo's `global-min-publish-age`. Configure `[lints]` and use
`#[expect(..., reason = "...")]` for exceptions. Use `--locked` in CI and
`just ci` recipes where applicable.

### 5. Dependency and release checks

Enable `cargo-audit` and `cargo-deny`. Configure `cargo-vet` with peer
audits and exemptions with time limits. Use `cargo vet --locked` in CI.
Configure releases with `release-plz` and crates.io OIDC Trusted Publishing.
Use `cargo-auditable` for binaries. Generate a CISA 2026 SBOM. Add build
attestations with `actions/attest-build-provenance@v4`.

### 6. Tests and incident response

Select tests that apply to the threat model. Tools include `proptest`,
`cargo-fuzz`, `cargo-mutants`, Miri, and Kani. Do an exercise for private
disclosure and RustSec submission. Review `cargo-vet` and `deny.toml`
expiration dates each quarter. Add a regression check after each incident.

## Procurement and regulatory references

Keep records that link the repository controls to the applicable frameworks.

- **US federal procurement.** Refer to NIST SP 800-218 (SSDF v1.1), SP 800-218A,
  and the SP 800-218 Rev. 1 draft (SSDF v1.2). Use the final v1.1 as the
  reference until NIST publishes the final v1.2.

  OMB Memorandum M-26-05 replaced the general attestation requirement in
  M-22-18 and M-23-16. The policy now uses risk to determine the applicable
  requirements. An agency can make CISA attestations and SBOMs
  mandatory in a contract. Refer to CISA's July 2026 Minimum Elements for
  SBOMs. Get legal or compliance review before you sign an attestation.
- **European Union.** Article 14 of the Cyber Resilience Act (CRA) sets
  24-hour and 72-hour reporting deadlines for actively exploited
  vulnerabilities. These obligations started on September 11, 2026.

  Refer to the CRA for CE marking, software lifecycle, and SBOM obligations.
  Refer to the CRA also for Open-Source Software Steward obligations.
  These obligations apply from December 11, 2027.

  Use SBOMs, `cargo-auditable`, and coordinated disclosure to help examine
  the effects in 24 hours or less.
- **Public project records.** The [OpenSSF Best Practices Badge](https://www.bestpractices.dev/),
  [OpenSSF Scorecard](https://scorecard.dev/), and
  [OpenSSF OSPS Baseline](https://baseline.openssf.org/) give adopters
  information about project controls.

## Source documents

- [NIST SP 800-218: Secure Software Development Framework (SSDF)](https://doi.org/10.6028/NIST.SP.800-218) & [SP 800-218 Rev. 1 (SSDF v1.2 draft)](https://csrc.nist.gov/pubs/sp/800/218/r1/ipd)
- [CISA 2026 Minimum Elements for a Software Bill of Materials (SBOM)](https://www.cisa.gov/sbom)
- [CISA Software Acquisition Guide for Government Enterprise Consumers](https://www.cisa.gov/resources-tools/resources/software-acquisition-guide-government-enterprise-consumers)
- [EU Cyber Resilience Act (Regulation (EU) 2024/2847)](https://eur-lex.europa.eu/eli/reg/2024/2847/oj)
- [SLSA v1.2 specification](https://slsa.dev/spec/v1.2/)
- [OpenSSF Best Practices Badge](https://www.bestpractices.dev/), [OpenSSF Scorecard](https://scorecard.dev/), & [OpenSSF OSPS Baseline](https://baseline.openssf.org/)
- [GitHub Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
