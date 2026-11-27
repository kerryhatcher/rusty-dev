# Project Governance

Governance documents identify who makes decisions and who has access to
project resources. They give the procedures for community standards and for
changes to maintainer roles.

## Governance and continuity (`GOVERNANCE.md`)

When the project has more than one maintainer or a downstream production user,
add `GOVERNANCE.md`. Include this information.

- Give the requirements for reviewers and maintainers. Give the procedure
  for a maintainer to move to emeritus status.
- Select a decision procedure, for example consensus, a maintainer vote,
  or a decision by the project lead. Record architecture decisions in
  `docs/adr/`.
- Set expert review requirements in `CODEOWNERS`. Include workflows, dependency
  policy, security policy, cryptography, authentication, and `unsafe` or FFI modules.
  Examples of paths are `.github/workflows/`, `deny.toml`, `supply-chain/`,
  and `SECURITY.md`.
- Name the release and security roles. Use team accounts and role email
  addresses. Record an emergency access procedure with a time limit and a
  log of each use.
- Give ownership of the organization to two or more persons. Use
  phishing-resistant multi-factor authentication (MFA) for owners.
- Give crate ownership to a GitHub team with `cargo owner --add github:your-org:maintainers`.
  Use crates.io OIDC Trusted Publishing. With this method, the workflow does not use a maintainer's personal API token.

Publish a support policy in `SUPPORT.md` or `README.md`. Give the supported
release branches, minimum supported Rust version (MSRV) policy, Tier 1 platforms,
help channels, and deprecation notice periods.

## Code of Conduct (`CODE_OF_CONDUCT.md`)

Use the [Contributor Covenant](https://www.contributor-covenant.org) to set
community standards and the response procedure. [Version 3.0](https://www.contributor-covenant.org/version/3/0/)
provides guidance for corrective actions and a tool to generate the code of conduct.
Projects also use version 2.1.

Give a role email address for reports, for example `conduct@example.com`.
Make sure that a person monitors this address. Identify who receives reports.
Give a procedure for conflicts of interest. Apply the same standards to
maintainers, sponsors, and new contributors.

## Licensing

Rust projects commonly use `MIT OR Apache-2.0`. The MIT license is compatible
with GPLv2. The Apache 2.0 license gives a patent grant and has a patent
termination clause.

Include the two license files in the repository root:

```text
LICENSE-MIT      # Full MIT license text
LICENSE-APACHE   # Full Apache License 2.0 text
```

Record the license terms for contributions in `CONTRIBUTING.md`. Refer to
Section 5 of the Apache 2.0 license.

> Unless you explicitly state otherwise, any contribution intentionally
> submitted for inclusion in this project by you, as defined in the Apache-2.0
> license, shall be dual-licensed as above (`MIT OR Apache-2.0`), without any
> additional terms or conditions.

## The `CONTRIBUTING.md` file

Include this information in `CONTRIBUTING.md`.

1. Link to the code of conduct and `SECURITY.md`. Direct private reports to the process in `SECURITY.md`.
2. Give the installation commands for `rustup` and `cargo binstall`.
3. Give the purpose of the `just ci`, `just fmt-fix`, `just lint`, and `just test` recipes.
4. State the Rust edition, MSRV, lint policy, test requirements, dependency
   policy, and rules for panics.
5. Give the pull request and release processes. Include
   [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) and
   the release pull requests that `release-plz` creates.

### Example code standards

```markdown
## Code standards

- Put unit tests in `mod tests` next to the code. Put integration tests in
  `tests/`. Add a regression test that fails without the bug fix.
- Enable the `all`, `pedantic`, and applicable policy lints. Set `-D warnings`.
  If a lint does not apply to an item, add `#[expect(clippy::..., reason = "...")]`.
  Do not use `#[allow]` without a reason.
- For a new crate, give the reason in the pull request description. Include
  the `cargo vet` audit or an exemption with a time limit.
- Do not panic on untrusted input. Return a structured error or use a safe
  fallback when the input is incorrect.
```

### Example pull request procedure

```markdown
## Pull requests

1. Create a branch from `main`. Repository rulesets block direct pushes to `main`.
2. Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
   in the pull request title. Examples are `feat:`, `fix:`, `docs:`, `chore:`,
   `ci:`, `refactor:`, and `test:`. CI checks the title. The squash merge
   uses the title as the commit message.
3. Before you request review, start the checks with `just ci`.
4. Do not manually edit `version` in `Cargo.toml`. Do not manually edit
   `CHANGELOG.md`. `release-plz` updates both in a release pull request.
```

## Branch and tag protection with GitHub Rulesets

Use GitHub **Repository or Organization Rulesets**. These rulesets apply to
branches and release tags. You can export the rules as JSON. You can also
apply organization rulesets to more than one repository.

Apply the rules to `main`, active release branches, and `v*` release tags.
For `v*` tags, limit creation, updates, and deletion to the release GitHub App.

For protected branches, enable these options.

- **Require a pull request before merging**
- **Require review from Code Owners** for applicable paths
- **Dismiss stale pull request approvals when new commits are pushed**
- **Require approval of the most recent reviewable push**
- **Require status checks to pass**
- **Require conversation resolution**
- **Require linear history**
- **Block force pushes**

Set the minimum number of independent approvals to one. Make the `test`,
`lint & doc`, `semver`, `msrv`, `security`, `vet`, and `pr-title` checks mandatory.
Refer to [Release automation](releases.md#enforcing-the-convention) for `pr-title`.

Enable **Require branches to be up to date**. If you use a GitHub merge queue,
enable **Only merge non-failing pull requests**.

If the release GitHub App can make signed commits, enable **Require signed commits**.
GitHub can add a web-flow signature to commits from its GraphQL or REST API.

## Further reading

- [Contributor Covenant v3.0](https://www.contributor-covenant.org/version/3/0/)
- [The Cargo Book: `cargo owner` (GitHub team ownership)](https://doc.rust-lang.org/cargo/commands/cargo-owner.html)
- [Conventional Commits 1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/)
- [GitHub Rulesets documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Rust API Guidelines: Licensing & Metadata](https://rust-lang.github.io/api-guidelines/necessities.html)
