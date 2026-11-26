# Secure Development Lifecycle

Secure development is a repeatable loop of design decisions, compiler-enforced
invariants, adversarial tests, and verifiable records—not a scanner run the day
before a release. This guide adapts the **NIST SSDF (SP 800-218)** and the
**ANSSI Secure Rust Guidelines** to modern Edition 2024 Rust projects.

## Secure-by-design principles for Rust

- **Start from a threat model.** Identify assets, trust boundaries, attacker
  capabilities, untrusted entry points, privilege transitions, dependencies, and
  resource-exhaustion vectors before writing code. Update the threat model when
  architecture, protocols, or deployment boundaries change.
- **Choose safe defaults.** Require explicit opt-in for network listeners,
  destructive filesystem writes, telemetry, weak algorithms, and elevated
  privileges. Fail closed on authentication, authorization, and validation.
- **Minimize authority and attack surface.** Keep OS privileges, public APIs,
  enabled Cargo features, dependencies, and data retention minimal. For
  filesystem isolation, prefer capability-oriented APIs such as
  [`cap-std`](https://docs.rs/cap-std) (`Dir` handles backed by `openat2` /
  `O_RESOLVE_BENEATH`) over manual string path sanitization to eliminate path
  traversal and symlink TOCTOU races structurally.
- **Treat all external input as hostile.** Bound payload sizes, allocation
  capacities, recursion depth, decompression ratios, timeouts, and concurrency
  before parsing. Never call `unwrap`, `expect`, or unchecked slice indexing on
  untrusted input.
- **Handle integer arithmetic deliberately.** In Rust, standard `+`, `-`, and
  `*` operators panic on overflow in `debug` builds but **silently wrap in
  `--release` builds** by default. Per ANSSI guidance, use `.checked_*()`,
  `.saturating_*()`, or `TryFrom` conversions on security-sensitive sizes,
  offsets, and quotas—or set `overflow-checks = true` in `[profile.release]`
  where panic/abort is preferable to silent wraparound.
- **Constrain `unsafe` with Edition 2024 rules.** Default to
  `unsafe_code = "forbid"` in `[lints.rust]`. Where `unsafe` or FFI is
  unavoidable, encapsulate it behind a narrow safe module, keep Edition 2024's
  `unsafe_op_in_unsafe_fn`, `unsafe extern`, and `#[unsafe(...)]` checks active,
  and enforce `clippy::undocumented_unsafe_blocks = "deny"`.
- **Use vetted cryptography and secret hygiene.** Never roll custom primitives
  or TLS stacks. Prefer memory-safe stacks such as [`rustls`](https://docs.rs/rustls)
  (backed by `aws-lc-rs` or `ring`), clear secret key material on drop with
  [`zeroize`](https://docs.rs/zeroize) / [`secrecy`](https://docs.rs/secrecy),
  and compare digests/tokens in constant time using [`subtle`](https://docs.rs/subtle).
- **Govern AI-assisted code identically to human code.** Per **NIST SP 800-218A**,
  code generated or refactored by AI assistants must pass human peer review,
  threat-model checks, license/provenance rules, and the full CI security gate.

## Required engineering loop

| When | Required activity | Evidence |
| --- | --- | --- |
| Design or major change | Threat model and security requirements; review trust boundaries and resource limits | ADR/design doc, issue, or `docs/security/threat-model.md` |
| Every change | Independent peer review; formatting, Clippy (`#[expect]`), tests, locked dependencies | Pull request, CI checks, review record |
| Boundary-sensitive change | Negative tests, `proptest` invariants, and `cargo-fuzz` targets for parsers/decoders | Tests, fuzz corpus, scheduled fuzz CI |
| `unsafe` / FFI change | CODEOWNER review, `// SAFETY:` proof comment, Miri / sanitizer / Kani verification | Review approval, Miri/Kani job log |
| Dependency or workflow change | License/source/advisory check, cooldown check, `cargo vet` update, `zizmor` check | PR rationale, `deny.toml`, `supply-chain/` |
| Release | Clean `--locked` `cargo-auditable` build, OIDC publish, CISA-compliant SBOM, SHA-256 hashes, SLSA provenance | Protected release workflow & release assets |
| Incident or escaped defect | Triage, patch, coordinated GitHub + RustSec advisory, blameless root-cause fix | Advisory record and regression test |

## Testing security properties

Match the verification technique to the failure mode:

- **Property testing (`proptest`)** — verify invariants across randomized inputs:
  parsers never panic, serializers round-trip, quotas never overflow, and access
  checks fail closed.
- **Coverage-guided fuzzing (`cargo-fuzz` / `libFuzzer`)** — mandatory for binary
  formats, network protocol frames, archive extractors, and FFI boundaries. Run
  fuzzing continuously (e.g., OSS-Fuzz or scheduled CI budgets) and retain seed
  corpora in Git.
- **Mutation testing (`cargo-mutants`)** — verify that deleting authorization
  checks, boundary guards, or error branches causes tests to fail.
- **Undefined behavior & formal verification (`Miri`, Sanitizers, and `Kani`)** —
  run `cargo +nightly miri test` to catch pointer provenance and aliasing UB in
  `unsafe` Rust, LLVM sanitizers (`ASAN`/`TSAN`/`UBSAN`) across C/FFI boundaries,
  and [`kani`](https://model-checking.github.io/kani/) bounded model checking to
  mathematically prove absence of panics/UB in critical state machines.

## Rust-specific policy decisions

Record these explicitly in repository documentation rather than leaving them
implicit:

| Topic | Policy to record |
| --- | --- |
| `unsafe` | Forbidden globally or restricted to named modules; CODEOWNER requirement; `// SAFETY:` invariant + Miri expectations |
| FFI / native code | Allowed Tier-1 targets, pure-Rust preference (`rustls`, `miniz_oxide`), C compiler flags, ABI validation, CVE ownership |
| Arithmetic & panics | Overflow policy (`checked_*` / `[profile.release] overflow-checks`), non-panicking untrusted input rule, `panic = "abort"` vs unwind |
| Features | Minimal default features, security impact of optional features, feature-combination CI coverage |
| Network and files | Mandatory timeouts, payload caps, TLS 1.2+/1.3 policy (`rustls`), `cap-std` directory confinement, secret redaction in logs |
| Dependencies | Approved registries (`crates.io`), cooldown window (`global-min-publish-age`), rolling MSRV rule, `cargo vet` exemption expiry |

## SSDF crosswalk

The NIST SSDF organizes outcomes into Prepare the Organization (**PO**), Protect
the Software (**PS**), Produce Well-Secured Software (**PW**), and Respond to
Vulnerabilities (**RV**):

| SSDF outcome | Rust project implementation |
| --- | --- |
| **PO**: defined secure-development requirements, roles, and tooling | `GOVERNANCE.md`, `SECURITY.md`, `AGENTS.md`, CODEOWNERS, threat model, documented lint/MSRV/`unsafe` policies |
| **PS**: protected repositories, credentials, and build pipelines | Rulesets, MFA, Push Protection, SHA-pinned actions, `zizmor`, read-only default tokens, crates.io OIDC Trusted Publishing |
| **PW**: secure design, implementation, verification, and release | Safe defaults, Edition 2024 + Clippy gates, `proptest`/`cargo-fuzz`/Miri/Kani, `cargo-deny`, `cargo-vet`, cooldowns, `cargo-auditable`, SBOM, SLSA provenance |
| **RV**: identify, triage, remediate, and learn from vulnerabilities | Private reporting, EU CRA / SLA timelines, scheduled advisory scans, `cargo audit bin`, coordinated RustSec disclosure, regression tests |

## Source documents

- [NIST SP 800-218: Secure Software Development Framework (SSDF v1.1)](https://doi.org/10.6028/NIST.SP.800-218) & [SP 800-218A](https://doi.org/10.6028/NIST.SP.800-218A)
- [ANSSI Secure Rust Guidelines](https://anssi-fr.github.io/rust-guide/)
- [CISA Secure by Design](https://www.cisa.gov/securebydesign)
- [Rust Fuzz Book](https://rust-fuzz.github.io/book/)
- [Kani Rust Verifier](https://model-checking.github.io/kani/)
- [The Rustonomicon: Unsafe Rust](https://doc.rust-lang.org/nomicon/)
