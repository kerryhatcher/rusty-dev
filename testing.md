# Testing Strategy

A Rust project needs tests at every level. The goal is not a specific coverage
percentage but a **safety net that catches regressions before they ship**.

## Unit tests

Unit tests live in a `mod tests` block **beside the code they test**:

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

`unwrap()` and `expect()` are fine in tests; a panic is a test failure with
a useful message.

### Rules for unit tests

1. **Test behaviour, not implementation details.** Because `mod tests` is a
   child module, it can call private functions, and Rust's convention is to
   use that for focused tests of internal logic. Prefer tests that would
   survive a refactor: assert on what a function returns or does, not on how
   it does it.
2. **One behaviour per test** where practical. A test named
   `name_defaults_when_missing` should test exactly that.
3. **Test edge cases** — empty strings, zero values, wrong types, missing
   fields. Every `unwrap_or_else` or `filter` is a behaviour that needs a
   test.
4. **Test the fallback chain** — when field A is missing, when field A is
   present but wrong-typed, when both A and B are present.
5. **Compare floats deliberately.** If an exact comparison is correct (for
   example, a value that is a literal or a clamp boundary), suppress
   `clippy::float_cmp` narrowly with `#[expect(clippy::float_cmp, reason = "...")]`.
   Otherwise compare with a tolerance.

## Integration tests

Integration tests live in `tests/`. Each file there is compiled as a separate
crate that can use only the public API, or run the compiled binary:

```rust
// tests/cli.rs

use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn valid_input_prints_the_name() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_my-tool"))
        .env_remove("MY_TOOL_CONFIG")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("failed to spawn");

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

### Key patterns

- **Use `env!("CARGO_BIN_EXE_<name>")`** to get the path to the compiled
  binary. Cargo sets it for integration tests and builds the binary first.
- **Isolate from the environment** — set or remove variables on the child
  `Command` (`.env()`, `.env_remove()`, `.env_clear()`) for `HOME`,
  `APPDATA`, `XDG_*`, and your own config variables. Do **not** mutate the
  test process's environment: tests run in parallel threads, and in edition
  2024 `std::env::set_var` and `remove_var` are `unsafe` for exactly that
  reason.
- **Use `tempfile::tempdir()`** for filesystem tests. The `TempDir` is
  automatically cleaned up when it drops.
- **Test the real binary**, not internal functions. Integration tests should
  exercise the same entry point a user would.
- **Consider helper crates** for CLI tests:
  [`assert_cmd`](https://docs.rs/assert_cmd) and
  [`snapbox`](https://docs.rs/snapbox) (or `trycmd` for file-driven cases)
  reduce the spawn/pipe boilerplate above.

### What integration tests cover

- **Happy path** — the most common invocation produces the expected output.
- **Error handling** — invalid input produces a graceful error, not a panic.
- **Edge cases** — empty input, large input, missing environment variables.
- **Filesystem interactions** — config file creation, log file rotation.
- **Concurrency** — multiple processes writing to the same log directory.

## Snapshot testing

When output is large or structured (rendered text, JSON, error messages),
[`insta`](https://insta.rs) records it as a reviewed snapshot file and fails
when it changes. `cargo insta review` shows the diff and accepts or rejects
it. Keep snapshots small and deterministic (no timestamps or absolute paths).

## Property-based testing

For functions with complex logic, use property-based testing with
[`proptest`](https://docs.rs/proptest) (or
[`quickcheck`](https://docs.rs/quickcheck)):

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn percent_is_always_in_range(used in any::<f64>(), total in any::<f64>()) {
        let pct = percent(used, total);
        prop_assert!(pct <= 100);
    }
}
```

Use `prop_assert!` rather than `assert!` inside `proptest!` so failures are
shrunk to a minimal case. `any::<f64>()` includes NaN and infinities, which is
usually what you want to prove robustness against.

## Test runner: `cargo-nextest`

[`cargo-nextest`](https://nexte.st) runs each test in its own process, runs
them in parallel, reports slow and flaky tests, and supports retries and
JUnit output for CI. It does not run doctests, so keep a separate
`cargo test --doc` step:

```bash
cargo nextest run --locked
cargo test --doc --locked
```

## Coverage and mutation testing

- [`cargo-llvm-cov`](https://github.com/taiki-e/cargo-llvm-cov) produces
  source-based coverage (`cargo llvm-cov nextest --lcov --output-path lcov.info`).
  Use it to find untested code, not as a target percentage.
- [`cargo-mutants`](https://mutants.rs) changes your code and checks that
  some test fails. Surviving mutants show assertions that are missing.
  Run it periodically or on changed files (`--in-diff`) rather than on every
  PR.

## Testing philosophy

### A bug fix ships with the test that would have caught it

If a bug is reported, the first thing you write is a failing test that
reproduces it. Then you fix the code. Then the test passes. This ensures:

- The bug is actually fixed (the test proves it).
- The bug never comes back (the test stays in the suite).
- The review is obvious (the diff shows the test and the fix together).

### Never panic on input

A library or CLI tool that panics on unexpected input is a liability. Test
that every error path degrades gracefully:

```rust
#[test]
fn invalid_json_produces_an_error_not_a_panic() {
    let out = run_with_stdin("not json");
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("invalid input"));
}
```

### Test the fallback chain

When a value can come from multiple sources (config file, env var, hardcoded
default), test every priority:

```rust
#[test]
fn env_var_beats_the_config_file() {
    // Write a config file into a TempDir, then run the binary with
    // `.env("MY_TOOL_NAME", "from-env")` and `.current_dir(&dir)`.
    // Assert the env var wins.
}
```

## Further reading

- [The Rust Book: Writing Automated Tests](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [The Rust Book: Test Organization (testing private functions)](https://doc.rust-lang.org/book/ch11-03-test-organization.html)
- [Rust by Example: Testing](https://doc.rust-lang.org/rust-by-example/testing.html)
- [proptest documentation](https://docs.rs/proptest)
- [cargo-nextest](https://nexte.st)
- [insta](https://insta.rs)
- [cargo-llvm-cov](https://github.com/taiki-e/cargo-llvm-cov)
- [cargo-mutants](https://mutants.rs)
