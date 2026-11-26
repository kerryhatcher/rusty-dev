# Security Policy

Every public Rust project needs a clear, honest `SECURITY.md`. It tells security
researchers how to report vulnerabilities privately, sets realistic response
targets, clarifies supported versions, and connects fixes to the RustSec
advisory ecosystem.

## The `SECURITY.md` file

Place `SECURITY.md` in the repository root so GitHub automatically surfaces it
under your repository's **Security** tab.

### Reporting a vulnerability

```markdown
# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report privately through either channel:

- [GitHub's private vulnerability reporting](https://github.com/you/my-crate/security/advisories/new)
  — preferred, since it keeps triage, the private fix fork, CVE assignment, and
  advisory publication in one place.
- Email **security@example.com** with `my-crate security` in the subject line.

A useful report includes the affected version or commit SHA, target OS/arch,
required configuration or Cargo features, security impact, and a minimal
reproducer.
```

### Response expectations and regulatory timelines

```markdown
## What to expect

| Stage | Target |
| ----- | ------ |
| Acknowledgement of your report | within 3 business days |
| Initial triage and severity assessment | within 7 business days |
| Fix released, or a mitigation plan with dates | within 30 days (faster for actively exploited flaws) |
```

Commit only to timelines your maintainers can reliably honor.

> **EU Cyber Resilience Act (CRA) note:** As of **September 11, 2026**,
> commercial manufacturers placing "products with digital elements" on the EU
> market face mandatory **24-hour early warning** and **72-hour notification**
> obligations via ENISA's Single Reporting Platform for **actively exploited
> vulnerabilities** and severe incidents (Article 14). Non-commercial open-source
> projects and **Open-Source Software Stewards** are exempt from administrative
> fines and had compliance obligations deferred until **December 11, 2027**—but
> if your crate is commercially backed or monetized, align your internal
> escalation playbook with the 24h/72h clock.

### Supported versions

```markdown
## Supported versions

| Version | Supported |
| ------- | --------- |
| Latest minor release (`0.4.x` / `1.2.x`) | ✅ |
| Older releases | ❌ — upgrade to the latest release |
```

Most open-source crates patch only the latest release line. If enterprise
customers require backports to an older major branch, state the exact branches
and end-of-support dates explicitly.

### Coordinated disclosure and RustSec

```markdown
## Disclosure

We follow coordinated vulnerability disclosure:

1. Once a fix is tested in a private GitHub temporary fork, we ship a patched
   release and publish a [GitHub Security Advisory](https://github.com/you/my-crate/security/advisories)
   (requesting a CVE ID directly through GitHub where applicable).
2. For any vulnerability affecting a crate published on crates.io, we submit an
   advisory to the [RustSec Advisory Database](https://github.com/rustsec/advisory-db)
   linking the GitHub Security Advisory, affected version ranges, and patched
   versions—and yank severely broken versions on crates.io only when keeping
   them downloadable poses acute harm.

Submitting to RustSec is essential: `cargo audit` and `cargo deny` read RustSec
directly, so RustSec is what alerts downstream Rust developers in CI.

We credit reporters only with explicit permission; otherwise reports remain
anonymous.
```

### Scope notes

```markdown
## Scope notes

In-scope findings include memory unsafety, arbitrary code execution, privilege
escalation, authentication/authorization bypass, path traversal outside intended
directories, cryptographic misuse, or untrusted input causing panics/DoS in
library or server contexts.

Publicly known vulnerabilities in transitive dependencies are monitored in CI by
`cargo audit` and `cargo deny`. If an upstream patch was just released, a normal
issue or PR is welcome.
```

## Enabling GitHub private vulnerability reporting

Enable private reporting so researchers never have to guess an email address:

1. Open your repository on GitHub and click **Settings**.
2. In the left sidebar under **Security and quality**, click **Advanced Security**.
3. Locate **Private vulnerability reporting** and click **Enable**.
4. *(Optional)* Add `.github/VULNERABILITY_REPORT.yml` to present researchers
   with structured fields (affected version, target triple, Cargo features, PoC)
   upon submission.

Organization owners can enable Private Vulnerability Reporting automatically for
all current and future public repositories via Organization Security
Configurations.

## Further reading

- [GitHub: Privately reporting a security vulnerability](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
- [RustSec Advisory Database](https://github.com/rustsec/advisory-db)
- [EU Cyber Resilience Act (Regulation (EU) 2024/2847)](https://eur-lex.europa.eu/eli/reg/2024/2847/oj)
