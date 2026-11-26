# Project Governance

Governance documents tell contributors and adopters how decisions are made, who
holds privileges, how community standards are enforced, and how the project
survives maintainer turnover.

## Governance and continuity (`GOVERNANCE.md`)

Add a concise `GOVERNANCE.md` as soon as the project has multiple maintainers or
downstream production users. Document:

- **Maintainer roles and lifecycle** — how contributors become reviewers or
  maintainers, and how inactive maintainers step down to emeritus status.
- **Decision-making** — consensus, maintainer vote, or project lead tie-break,
  plus where architectural decisions (`docs/adr/`) are recorded.
- **`CODEOWNERS` boundaries** — `.github/workflows/`, `deny.toml`,
  `supply-chain/`, `SECURITY.md`, cryptography, auth, and any `unsafe`/FFI
  modules require named expert review.
- **Release & security ownership** — named roles (using team handles and role
  mailboxes, not personal email addresses) plus a logged, time-bounded
  break-glass procedure for critical incidents.
- **Crates.io & GitHub succession resilience** — at least two organization
  owners with hardware/phishing-resistant MFA; **GitHub Team ownership on
  crates.io** (`cargo owner --add github:your-org:maintainers`) rather than a
  single individual account; and **crates.io OIDC Trusted Publishing** so
  releases never depend on one person's personal API token.

Publish a clear support statement (in `SUPPORT.md` or `README.md`) covering
supported release branches, rolling MSRV policy, tier-1 platforms, help
channels, and deprecation notice periods.

## Code of Conduct (`CODE_OF_CONDUCT.md`)

Adopt the [Contributor Covenant](https://www.contributor-covenant.org) so
community expectations and enforcement procedures are clear to everyone:

- **Contributor Covenant v3.0** ([v3.0 specification](https://www.contributor-covenant.org/version/3/0/))
  is the current major version, offering clearer international language,
  structured repair/enforcement guidance, and official builder options
  (v2.1 remains widely used and recognized as well).
- Always provide a monitored, non-personal reporting contact (e.g.,
  `conduct@example.com`) and state who receives reports so conflicts of interest
  are handled fairly.
- Apply standards equally to maintainers, sponsors, and newcomers.

## Licensing

The Rust ecosystem standard is **dual-licensing under `MIT OR Apache-2.0`**:

- **MIT** — simple, permissive, and GPLv2-compatible.
- **Apache-2.0** — provides an explicit patent license and retaliation clause
  that enterprise legal teams strongly prefer.

Include both license texts in the repository root:

```text
LICENSE-MIT      # Full MIT license text
LICENSE-APACHE   # Full Apache License 2.0 text
```

State contribution licensing explicitly in `CONTRIBUTING.md` (matching Apache-2.0
Section 5):

> Unless you explicitly state otherwise, any contribution intentionally
> submitted for inclusion in this project by you, as defined in the Apache-2.0
> license, shall be dual-licensed as above (`MIT OR Apache-2.0`), without any
> additional terms or conditions.

## The `CONTRIBUTING.md` file

Structure `CONTRIBUTING.md` so a first-time contributor can go from clone to
green PR without guesswork:

1. **Welcome, Code of Conduct, and Security link** — point security findings to
   `SECURITY.md` before someone files a public issue.
2. **Setup in 60 seconds** — `rustup` + `cargo binstall` command for local tools.
3. **Check suite reference** — `just` recipes (`just ci`, `just fmt-fix`,
   `just lint`, `just test`).
4. **Code standards** — Edition 2024, rolling MSRV, `#[expect(..., reason = "...")]`
   lint policy, regression tests, dependency minimalism, and panic rules.
5. **PR and release workflow** — Conventional Commits and automated
   `release-plz` Release PRs.

### Example code standards snippet

```markdown
## Code standards

- **Tests ship with the change.** Unit tests live in `mod tests` beside the
  code; integration tests live in `tests/`. Every bug fix includes a test that
  fails without the fix.
- **Clippy warnings are errors.** `all`, `pedantic`, and targeted policy lints
  are enforced with `-D warnings`. When a lint must be suppressed, use
  `#[expect(clippy::..., reason = "...")]`—never undocumented `#[allow]`.
- **Keep dependencies minimal.** Justify any new crate in the PR description and
  include its `cargo vet` audit or time-bounded exemption.
- **Never panic on untrusted input.** External input must return structured
  errors or degrade gracefully.
```

### Example pull-request snippet

```markdown
## Pull requests

1. Branch off `main` (direct pushes are blocked by repository rulesets).
2. Use [Conventional Commits](https://www.conventionalcommits.org) (`feat:`,
   `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`, `test:`).
3. Run `just ci` locally before requesting review.
4. Do not hand-edit `version` in `Cargo.toml` or `CHANGELOG.md`; `release-plz`
   manages both via automated Release PRs.
```

## Branch and tag protection with GitHub Rulesets

Use GitHub **Repository or Organization Rulesets** (preferable to legacy branch
protection rules because rulesets cover both branches and release tags `v*`,
support audit-friendly JSON export, and stack cleanly across an organization):

1. Target the default branch (`main`), long-lived release branches, and `v*`
   release tags.
2. Enable:
   - **Restrict creations, updates, and deletions** on `v*` tags to the release
     GitHub App only.
   - **Require a pull request before merging** with **at least one independent
     approving review** and **Require review from Code Owners**.
   - **Dismiss stale pull request approvals when new commits are pushed** and
     **Require approval of the most recent reviewable push**.
   - **Require status checks to pass** (`test`, `lint & doc`, `semver`, `msrv`,
     `security`, `vet`) with **Require branches to be up to date** (or enable
     **GitHub Merge Queue** on busy repositories).
   - **Require conversation resolution**, **Require linear history**, and
     **Block force pushes**.
   - **Require signed commits** where compatible with your automated GitHub App
     bot commits (commits created via GitHub's GraphQL/REST API or
     `actions/create-github-app-token` can be web-flow signed automatically).

## Further reading

- [Contributor Covenant v3.0](https://www.contributor-covenant.org/version/3/0/)
- [The Cargo Book: `cargo owner` (GitHub team ownership)](https://doc.rust-lang.org/cargo/commands/cargo-owner.html)
- [GitHub Rulesets documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Rust API Guidelines: Licensing & Metadata](https://rust-lang.github.io/api-guidelines/necessities.html)
