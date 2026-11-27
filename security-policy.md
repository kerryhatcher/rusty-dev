# Security Policy

Use `SECURITY.md` to give researchers a private channel for vulnerability
reports. State the response times and supported versions. Give the procedure
for coordinated disclosure with RustSec.

## The `SECURITY.md` file

Put `SECURITY.md` in the repository root. GitHub shows this file in the
**Security** tab.

### Reporting a vulnerability

```markdown
# Security Policy

## Reporting a vulnerability

Do not report vulnerabilities in public GitHub issues. Use one of these
private channels.

- Use [GitHub private vulnerability reporting](https://github.com/you/my-crate/security/advisories/new)
  when possible. GitHub keeps the severity assessment, private fork, CVE
  assignment, and advisory in one place.
- Send an email to **security@example.com**. Use `my-crate security` as the
  subject.

Include this information in the report.

- The affected version or commit SHA
- The target operating system and architecture
- The necessary configuration or Cargo features
- The security effects
- The smallest example that shows the defect
```

### Response expectations and regulatory timelines

```markdown
## Response times

| Action | Target time |
| ------ | ----------- |
| Confirm receipt of the report | In 3 business days or less |
| Do the initial severity assessment | In 7 business days or less |
| Publish a fix or give a mitigation plan with dates | In 30 days or less. We give priority to active exploitation. |
```

Set response times that are possible for your maintainers.

#### EU Cyber Resilience Act (CRA)

Article 14 reporting obligations started on September 11, 2026. They apply
to commercial manufacturers that put products with digital elements on the
EU market. They cover actively exploited vulnerabilities and severe
incidents.

Use ENISA's Single Reporting Platform. The reporting period starts when you
first know about the vulnerability or incident. Send an early warning as
soon as possible. The maximum time is 24 hours from the start of the
reporting period.

If the early warning does not contain the necessary information, send a
notification as soon as possible. The maximum time is 72 hours from the
start of the reporting period.

If the earlier reports do not contain the necessary information, send a final report.

- For a vulnerability, send it in 14 days or less after a corrective or
  mitigating measure becomes available.
- For an incident, send it in one month or less after you send the incident notification.

For provisions on open-source projects and Open-Source Software Stewards,
refer to the [EU Cyber Resilience Act](https://eur-lex.europa.eu/eli/reg/2024/2847/oj).
These provisions give information about applicability, fines, and the
December 11, 2027 start date.

If the crate has commercial support or generates revenue, include the reporting deadlines in the response procedure.

### Supported versions

```markdown
## Supported versions

| Version | Support status |
| ------- | -------------- |
| Latest minor release (`0.4.x` or `1.2.x`) | We support this release. |
| Older releases | Install the latest release. |
```

Most open-source crates apply fixes to the latest release line only.
If an agreement includes older releases, identify each branch in the policy.
Give the end date for support of each branch.

### Coordinated disclosure and RustSec

```markdown
## Disclosure

1. Do a test of the fix in a private temporary GitHub fork.
2. Publish a release with the fix.
3. Publish a [GitHub Security Advisory](https://github.com/you/my-crate/security/advisories).
4. If applicable, request a CVE ID through GitHub.
5. If the vulnerability affects a crate on crates.io, submit a
   [RustSec advisory](https://github.com/rustsec/advisory-db). Include a link
   to the GitHub advisory. Give the affected versions and the versions that
   contain the fix.
6. If download of an affected version can cause serious harm, yank that version on crates.io.

`cargo audit` and `cargo deny` read RustSec advisories. These tools can give
alerts to developers during CI checks.

We publish the name of a reporter only with explicit permission.
```

### Scope notes

```markdown
## Scope notes

This policy applies to these types of defects.

- Memory unsafety or arbitrary code execution
- Privilege escalation or a defect that lets a user bypass authentication
  or authorization
- A path that gives access outside the permitted directory
- Incorrect use of cryptography
- A panic or denial of service from untrusted input in a library or server

CI uses `cargo audit` and `cargo deny` to check transitive dependencies
for public advisories. If the dependency has a new fix, open a public issue or pull request.
```

## Enable GitHub private vulnerability reporting

1. Open the repository on GitHub.
2. Select **Settings**.
3. In the left sidebar under **Security and quality**, select **Advanced Security**.
4. Under **Private vulnerability reporting**, select **Enable**.
5. If you want a report form, add `.github/VULNERABILITY_REPORT.yml`.
   Include fields for the affected version, target triple, Cargo features,
   and an example of the defect.

Organization owners can use Organization Security Configurations to enable
private vulnerability reporting for all current and future public repositories.

## Further reading

- [GitHub: Privately reporting a security vulnerability](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
- [RustSec Advisory Database](https://github.com/rustsec/advisory-db)
- [EU Cyber Resilience Act (Regulation (EU) 2024/2847)](https://eur-lex.europa.eu/eli/reg/2024/2847/oj)
