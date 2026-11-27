# Secure Development Lifecycle

Use security controls from design through release and maintenance. Keep
design decisions, test results, and release records. This guide uses the
**NIST SSDF (SP 800-218)** and the **ANSSI Secure Rust Guidelines** for
Edition 2024 Rust projects.

## Secure design for Rust

- Before you write code, make a threat model. Identify assets, trust
  boundaries, attacker capabilities, and entry points for untrusted input.
  Identify privilege changes, dependencies, and resource exhaustion risks.
  Update the threat model when the architecture, protocols, or deployment boundaries change.
- Make network listeners, destructive file operations, telemetry, weak
  algorithms, and elevated privileges opt-in. Fail closed if authentication,
  authorization, or validation fails.
- Limit operating system privileges, public APIs, enabled features,
  dependencies, and data retention. For filesystem isolation, use a
  capability API such as [`cap-std`](https://docs.rs/cap-std) when possible.
  Its `Dir` handles use facilities such as `openat2` or `O_RESOLVE_BENEATH`.
  A capability API can prevent path traversal and races during symlink resolution
  without manual checks of path strings.
- Set limits before you parse external input. Limit payload size, allocation,
  recursion depth, decompression ratio, timeouts, and concurrency. Do not use
  `unwrap`, `expect`, or unchecked slice indexing on untrusted input.
- Check integer arithmetic. By default, `+`, `-`, and `*` panic on overflow
  in debug builds. In release builds, the value wraps. Use `.checked_*()`,
  `.saturating_*()`, or `TryFrom` for security-sensitive sizes, offsets, and quotas.
  If a panic or abort is safer than wraparound, set `overflow-checks = true` in `[profile.release]`.
- Set `unsafe_code = "forbid"` in `[lints.rust]`. If `unsafe` or a foreign
  function interface (FFI) is necessary, put it in a module with a small safe interface.
  Keep the Edition 2024 checks for `unsafe_op_in_unsafe_fn`, `unsafe extern`,
  and `#[unsafe(...)]` active. Set `clippy::undocumented_unsafe_blocks = "deny"`.
- Use reviewed cryptographic libraries. Do not write new cryptographic
  primitives or TLS implementations. Prefer a memory-safe TLS library such as
  [`rustls`](https://docs.rs/rustls) with `aws-lc-rs` or `ring`. Clear key
  material on drop with [`zeroize`](https://docs.rs/zeroize) or
  [`secrecy`](https://docs.rs/secrecy). Compare digests and tokens in
  constant time with [`subtle`](https://docs.rs/subtle).
- Apply the same controls to code from coding agents and persons. Use human
  peer review, threat model checks, license and provenance checks, and CI
  security checks. Refer to NIST SP 800-218A.

## Development and release checks

| When | Actions | Records |
| --- | --- | --- |
| Design or major change | Make a threat model. Review trust boundaries and resource limits. | Architecture decision record, issue, or `docs/security/threat-model.md` |
| Each change | Get an independent review. Check the format, Clippy lints, tests, and locked dependencies. | Pull request, CI results, and review record |
| Change to a trust boundary | Add negative tests and `proptest` checks. Add `cargo-fuzz` targets for parsers and decoders. | Tests, fuzz corpus, and scheduled fuzz tests |
| `unsafe` or FFI change | Get Code Owner review. Document the invariant in a `// SAFETY:` comment. Use Miri, sanitizers, or Kani. | Review approval and job log |
| Dependency or workflow change | Examine licenses, sources, advisories, and minimum publication age. Update the audit records. Check workflows with `zizmor`. | Pull request, `deny.toml`, and `supply-chain/` |
| Release | Build with `cargo-auditable` and `--locked`. Publish with OIDC. Add an SBOM, SHA-256 checksums, and SLSA provenance. | Protected release workflow and release files |
| Incident or defect | Assess the defect. Correct the cause. Coordinate disclosure with GitHub and RustSec. | Advisory and regression test |

## Tests for security properties

Select the test method for the type of failure.

- Use `proptest` to check invariants with random inputs. Make sure that
  parsers do not panic and that serialization preserves data. Check for quota
  overflow and make sure that access checks fail closed.
- Use coverage-guided fuzzing for binary formats, network frames, archive
  extractors, and foreign function interfaces. Use `cargo-fuzz` with
  `libFuzzer`. Schedule the tests in CI or use OSS-Fuzz. Keep the initial
  test inputs in Git.
- Use `cargo-mutants` to check that the suite finds missing authorization
  checks, boundary checks, and error branches.
- Use `cargo +nightly miri test` to find aliasing and pointer provenance
  defects in `unsafe` Rust. Use LLVM sanitizers (`ASAN`, `TSAN`, and `UBSAN`)
  at C interfaces. Use [Kani](https://model-checking.github.io/kani/) to check
  for panics and undefined behavior in critical state machines that the model covers.

## Rust-specific policy decisions

Record the values and conditions for these policies in the repository documentation.

| Topic | Policy |
| --- | --- |
| `unsafe` | Locations that can use `unsafe`, Code Owner review, `// SAFETY:` comments, and Miri checks |
| Foreign function interface (FFI) | Tier 1 targets, pure-Rust alternatives (such as `rustls` and `miniz_oxide`), C compiler flags, ABI checks, and CVE ownership |
| Arithmetic and panics | Overflow checks, for example `checked_*` or `[profile.release] overflow-checks`. Rules for untrusted input and the choice of panic abort or unwind. |
| Features | Necessary default features, security effects of optional features, and feature combinations for CI |
| Network and files | Timeouts, payload limits, TLS 1.2 and 1.3 policy (`rustls`), directory access with `cap-std`, and removal of secrets from logs |
| Dependencies | Permitted registries, minimum publication age, rolling MSRV, and `cargo vet` exemption expiration dates |

## SSDF crosswalk

The NIST SSDF has four groups. The table shows controls for each group.

| SSDF group | Controls for a Rust project |
| --- | --- |
| **Prepare the Organization (PO)** | Roles and procedures in `GOVERNANCE.md`, `SECURITY.md`, `AGENTS.md`, and `CODEOWNERS`. Threat model, lints, MSRV, and `unsafe` policy. |
| **Protect the Software (PS)** | Rulesets, multi-factor authentication, Push Protection, full commit SHAs for actions, `zizmor`, read-only tokens, and crates.io OIDC Trusted Publishing |
| **Produce Well-Secured Software (PW)** | Safe defaults, Edition 2024, Clippy, `proptest`, `cargo-fuzz`, Miri, and Kani. Dependency audits, minimum publication age, `cargo-auditable`, an SBOM, and SLSA provenance. |
| **Respond to Vulnerabilities (RV)** | Private reports, CRA and service-level deadlines, scheduled scans, `cargo audit bin`, RustSec disclosure, and regression tests |

## Source documents

- [NIST SP 800-218: Secure Software Development Framework (SSDF v1.1)](https://doi.org/10.6028/NIST.SP.800-218), [SP 800-218 Rev. 1 (SSDF v1.2 draft)](https://csrc.nist.gov/pubs/sp/800/218/r1/ipd), & [SP 800-218A](https://doi.org/10.6028/NIST.SP.800-218A)
- [ANSSI Secure Rust Guidelines](https://anssi-fr.github.io/rust-guide/)
- [CISA Secure by Design](https://www.cisa.gov/securebydesign)
- [Rust Fuzz Book](https://rust-fuzz.github.io/book/)
- [Kani Rust Verifier](https://model-checking.github.io/kani/)
- [The Rustonomicon: Unsafe Rust](https://doc.rust-lang.org/nomicon/)
