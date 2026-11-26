# Testing Strategy

A Rust project needs tests at multiple levels. The goal is not an arbitrary
line-coverage percentage, but a **layered safety net that catches regressions,
edge-case panics, and subtle behavioral drift before they ship**.

## Fast, isolated execution: `cargo-nextest` + doctests

Standard `cargo test` runs all tests inside a single shared process per test
binary, where global state or environment mutation can cause flaky interference.
Use [`cargo-nextest`](https://nexte.st/) as the primary runner, paired with
`cargo test --doc` (since `nextest` does not execute rustdoc doctests):

```bash
cargo nextest run --locked
cargo test --doc --locked
```

### Why `cargo-nextest`?

- **Process-per-test isolation** — each test runs in its own OS process; panics,
  aborts, working-directory changes, or leaky threads never poison sibling tests.
- **Speed & timeouts** — up to 3x faster execution on multi-core runners, built-in
  slow-test warnings, leak detection, and JUnit XML output for CI evidence.
- **Doctest pairing** — keeping `cargo test --doc --locked` ensures every code
  example in `///` API documentation compiles and passes.

## Unit tests

Unit tests live in a `mod tests` block **beside the code they test**:

```rust
// src/payload.rs

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_name_defaults_to_claude_when_missing() {
        let payload: Payload = serde_json::from_str("{}").unwrap();
        assert_eq!(payload.model_name(), "Claude");
    }

    #[test]
    fn model_name_uses_display_name_when_present() {
        let payload: Payload =
            serde_json::from_str(r#"{"model":{"display_name":"Sonnet"}}"#).unwrap();
        assert_eq!(payload.model_name(), "Sonnet");
    }
}
```

### Rules for unit tests

1. **Test observable behavior**, not brittle implementation details.
2. **One behavior per test** where practical. A test named
   `model_name_defaults_to_claude_when_missing` should verify exactly that.
3. **Test edge cases** — empty strings, zero/boundary values, malformed UTF-8,
   wrong types, and missing fields. Every fallback branch deserves a test.
4. **Use `#[expect(clippy::float_cmp, reason = "...")]`** when asserting against
   exact float literals, documenting why exact equality is valid.

## Integration and CLI tests

Integration tests live in `tests/` and exercise your public library API or
compiled binary from the outside:

```rust
// tests/cli.rs

use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn minimal_payload_shows_model_and_dirname_only() {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_ferrisbar"));
    cmd.env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().expect("failed to spawn binary");
    child
        .stdin
        .take()
        .expect("child stdin handle")
        .write_all(br#"{"model":{"display_name":"Sonnet"}}"#)
        .expect("failed to write to child stdin");

    let output = child.wait_with_output().expect("failed to wait on child");
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout),
        "\x1b[2mSonnet\x1b[0m"
    );
}
```

### Key patterns

- **Use `env!("CARGO_BIN_EXE_<name>")`** (or [`assert_cmd`](https://docs.rs/assert_cmd)
  / [`snapbox`](https://docs.rs/snapbox) for ergonomic CLI assertions) to invoke
  the exact binary Cargo compiled for the test run.
- **Snapshot complex outputs with [`insta`](https://insta.rs/)** — for large
  JSON, diagnostic messages, or rendered CLI output, `insta` keeps expectations
  readable and reviewable via `cargo insta review`.
- **Isolate the environment** — clear or override `HOME`, `XDG_CONFIG_HOME`,
  `APPDATA`, and tool-specific env vars so host developer configs never leak
  into tests.
- **Use `tempfile::tempdir()`** for filesystem tests so temporary directories
  are cleaned up automatically on drop.

## Property-based testing

For parsers, state machines, and boundary math, use property-based testing with
[`proptest`](https://docs.rs/proptest) to explore thousands of generated inputs
and automatically shrink counterexamples to minimal reproducers:

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn compute_used_stays_within_percentage_bounds(
        remaining in 0.0f64..1_000_000.0,
        total in 1.0f64..1_000_000.0,
        acw in 0.0f64..1_000_000.0,
    ) {
        let used = compute_used(remaining, total, acw);
        prop_assert!((0..=100).contains(&used));
    }
}
```

## Mutation testing, coverage, and `unsafe` verification

- **Mutation testing ([`cargo-mutants`](https://mutants.rs/))** — introduces
  small semantic changes (e.g., replacing `<` with `<=`, deleting a branch, or
  returning early) and verifies that your test suite actually fails. Run it
  periodically or on changed diffs (`cargo mutants --in-diff git.diff`) to find
  weakly tested logic that high line coverage hides.
- **Code coverage ([`cargo-llvm-cov`](https://github.com/taiki-e/cargo-llvm-cov))**
  — uses LLVM source-based instrumentation (`cargo llvm-cov nextest`) to show
  which error paths and edge cases have never executed. Treat coverage as a
  diagnostic map, not a vanity target.
- **Undefined behavior & formal proofs (`Miri` and `Kani`)** — if your crate
  contains any `unsafe` blocks, run `cargo +nightly miri test` in CI to detect
  aliasing violations, uninitialized reads, and invalid pointer provenance, and
  consider [`kani`](https://model-checking.github.io/kani/) bounded model
  checking for critical invariants.

## Testing philosophy

### A bug fix ships with the regression test that would have caught it

Write the failing test that reproduces the defect first, fix the code, and
verify the test passes. The PR diff proves both the root cause and the fix.

### Never panic on untrusted input

A library or CLI tool that panics (`unwrap`, `expect`, out-of-bounds slice
indexing) on malformed external input is a denial-of-service bug. Test that
hostile, truncated, empty, and wrong-typed inputs return structured errors or
degrade gracefully.

### Test precedence and fallback chains

When configuration comes from multiple sources (CLI flags > env vars > config
file > built-in defaults), test every override pair explicitly.

## Further reading

- [The Rust Book: Writing Automated Tests](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [cargo-nextest documentation](https://nexte.st/)
- [proptest book](https://proptest-rs.github.io/proptest/)
- [cargo-mutants documentation](https://mutants.rs/)
- [Miri: Undefined Behavior detector for Rust](https://github.com/rust-lang/miri)
