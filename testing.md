# Testing Strategy

Use different types of tests to find regressions, panics, and changes in
behavior before a release. Line coverage shows which code the tests execute.

## Test commands

For each test binary, `cargo test` uses one process for all tests. Changes to
global state or environment variables can affect other tests in that process.
Use [`cargo-nextest`](https://nexte.st/) for the main test suite. If the crate
has a library target, use `cargo test --doc` for doctests.

```bash
cargo nextest run --locked
# If the package has a library target (src/lib.rs), start the doctests.
# If the package has only a binary target, omit this command.
cargo test --doc --locked
```

### Why `cargo-nextest`?

- `cargo-nextest` uses one operating system process for each test. A panic,
  abort, working directory change, or thread leak stays in that process.
- `cargo-nextest` can complete tests up to three times faster on multi-core
  runners. It also gives slow-test warnings, detects leaks, and writes JUnit XML.
- `cargo test --doc --locked` compiles and executes the applicable examples
  in the API documentation of a library target.

## Unit tests

Put unit tests in a `mod tests` block next to the code.

```rust
// src/config.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_defaults_when_missing() {
        let cfg: Config = serde_json::from_str("{}").unwrap();
        assert_eq!(cfg.display_name(), "default");
    }

    #[test]
    fn name_uses_configured_value_when_present() {
        let cfg: Config = serde_json::from_str(r#"{"name":"alpha"}"#).unwrap();
        assert_eq!(cfg.display_name(), "alpha");
    }
}
```

### Rules for unit tests

1. Write assertions for inputs and outputs. A test in `mod tests` can call
   private functions in the parent module.
2. If possible, use one test for each behavior. For example,
   `name_defaults_when_missing` checks the default for a missing name.
3. Add tests for empty strings, zero, limit values, incorrect UTF-8, incorrect types, and missing fields.
4. Add a test for each fallback branch.
5. If an assertion compares exact floating-point values, add
   `#[expect(clippy::float_cmp, reason = "...")]`. In `reason`, record why the test uses exact equality.

## Integration and CLI tests

Put integration tests in `tests/`. These tests use the public API or start the
compiled binary.

```rust
// tests/cli.rs

use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn valid_input_prints_configured_name() {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_my-crate"));
    cmd.env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().expect("failed to spawn binary");
    child
        .stdin
        .take()
        .expect("child stdin handle")
        .write_all(br#"{"name":"alpha"}"#)
        .expect("failed to write to child stdin");

    let output = child.wait_with_output().expect("failed to wait on child");
    assert!(output.status.success());
    assert_eq!(String::from_utf8_lossy(&output.stdout), "alpha\n");
}
```

### Integration test methods

- Use `env!("CARGO_BIN_EXE_<name>")`, [`assert_cmd`](https://docs.rs/assert_cmd),
  or [`snapbox`](https://docs.rs/snapbox) to start the test binary that Cargo compiled.
- Use [`insta`](https://insta.rs/) to save snapshots for large JSON, diagnostic messages, or CLI output.
  Review snapshots with `cargo insta review`.
- Set the environment on the child `Command`. Use `.env()`, `.env_remove()`,
  or `.env_clear()` for `HOME`, `XDG_CONFIG_HOME`, `APPDATA`, and application variables.
- Do not call `std::env::set_var` or `std::env::remove_var` in multithreaded tests.
  In Edition 2024, these functions are `unsafe`. Changes to process-wide
  environment variables can cause a race condition.
- Use `tempfile::tempdir()` in filesystem tests. It removes a temporary
  directory when its handle goes out of scope.

## Property-based testing

Use [`proptest`](https://docs.rs/proptest) for parsers, state machines, and
calculations at limits. It generates many inputs and reduces a failure to a
small example. For example, `any::<f64>()` can generate `NaN` and `±Infinity`.

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn percent_stays_within_0_to_100(used in any::<f64>(), total in any::<f64>()) {
        let pct = compute_percent(used, total);
        prop_assert!((0..=100).contains(&pct));
    }
}
```

## Mutation testing, coverage, and `unsafe` verification

- [`cargo-mutants`](https://mutants.rs/) changes the code and checks if the test
  suite detects the change. For example, it can change `<` to `<=`, remove a
  branch, or make a function return early. Use it at intervals or for a
  change with `cargo mutants --in-diff git.diff`. This can identify defects in
  a test suite with high line coverage.
- [`cargo-llvm-cov`](https://github.com/taiki-e/cargo-llvm-cov) measures code coverage.
  Use `cargo llvm-cov nextest` to find error paths and edge cases that the
  tests do not execute.
- If the crate contains `unsafe` blocks, use `cargo +nightly miri test` in CI.
  Miri can identify aliasing violations, uninitialized reads, and incorrect
  pointer provenance. For critical invariants, you can use bounded model checking
  with [Kani](https://model-checking.github.io/kani/).

## Regression tests

1. Write a regression test that detects the defect.
2. Correct the code.
3. Make sure that the test gives a satisfactory result.

Include the test and the code change in the same pull request.

### Never panic on untrusted input

A panic on malformed external input can cause a denial of service.
`unwrap`, `expect`, and a slice index outside its limits can cause panics.

Add tests for hostile, truncated, empty, and incorrectly typed inputs. Make
sure that each test gives the expected exit code. Make sure that the output
contains no Rust panic backtrace.

```rust
#[test]
fn invalid_json_returns_usage_error_without_panicking() {
    let out = run_with_stdin("not json");
    assert_eq!(out.status.code(), Some(2));
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("invalid configuration"));
    assert!(!stderr.contains("panicked at"));
}
```

### Configuration priority

Use this order of priority for configuration.

1. Command-line flags
2. Environment variables
3. Configuration file
4. Default values

Add a test for each pair of sources to make sure that the higher-priority source takes effect.

## Further reading

- [The Rust Book: Writing Automated Tests](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [cargo-nextest documentation](https://nexte.st/)
- [proptest book](https://proptest-rs.github.io/proptest/)
- [cargo-mutants documentation](https://mutants.rs/)
- [Miri: Undefined Behavior detector for Rust](https://github.com/rust-lang/miri)
