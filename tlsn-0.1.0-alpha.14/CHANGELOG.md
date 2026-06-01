# Changelog — Local Modifications over TLSNotary v0.1.0-alpha.14

This file documents every change made to this local copy relative to the
upstream release [`tlsnotary/tlsn @ v0.1.0-alpha.14`](https://github.com/tlsnotary/tlsn/tree/v0.1.0-alpha.14).

> **Scope:** All real source changes are confined to `crates/harness`. Every
> other crate (`attestation`, `core`, `components/*`, `tls`, `mpc-tls`,
> `formats`, `tlsn`, `wasm`, `examples`, `server-fixture`, `data-fixtures`) is
> byte-for-byte identical to upstream — the only apparent differences were
> CRLF vs. LF line endings, now normalized via `.gitattributes`.

---

## Summary

Added a **selective-disclosure sweep** capability to the benchmark harness: a
new `reveal-recv-percent` parameter that controls what percentage of the
transcript bytes are revealed in the zero-knowledge proof. This makes it
possible to measure how proof cost scales with disclosure granularity, on both
the Native and Browser (WASM) execution targets. The feature is purely additive
and backward-compatible (defaults to 100%, leaving the three upstream sweeps
unchanged).

---

## Changed file tree

Only the paths below differ from upstream. Legend: `[M]` modified, `[+]` new
source/config/doc, `[+data]` generated benchmark output, `[+build]` compiled
artifact (not source).

```
tlsn-0.1.0-alpha.14/
├── .gitattributes                                  [+]      line-ending normalization
├── CHANGELOG.md                                    [+]      this file
└── crates/
    └── harness/
        ├── core/src/bench.rs                       [M]      + reveal-recv-percent config/metric fields
        ├── executor/src/bench/prover.rs            [M]      + percentage-driven disclosure logic
        ├── bench_proof_sweep.toml                  [+]      new sweep test case (10%..100%)
        ├── TLSNotary_EXPERIMENT_ANALYSIS.md        [+]      full 4-experiment analysis
        ├── PROOF_REVEAL_SWEEP_ANALYSIS.md          [+]      proof-reveal deep-dive
        ├── tlsn-bandwidth-native.csv               [+data]
        ├── tlsn-bandwidth-browser.csv              [+data]
        ├── tlsn-latency-native.csv                 [+data]
        ├── tlsn-latency-browser.csv                [+data]
        ├── tlsn-download-native.csv                [+data]
        ├── tlsn-download-browser.csv               [+data]
        ├── tlsn-proof-reveal-native.csv            [+data]
        ├── tlsn-proof-reveal-browser.csv           [+data]
        ├── native.csv                              [+data]
        ├── browser.csv                             [+data]
        ├── bin/                                     [+build] runner, executor-native, server-fixture, wasm-server
        └── static/generated/                       [+build] compiled WASM executor output
```

> Everything else in the tree is byte-for-byte identical to upstream
> v0.1.0-alpha.14 (earlier apparent diffs were CRLF vs. LF only).

---

## Source code changes

### `crates/harness/core/src/bench.rs`

Built on top of the existing benchmark config/metrics structures:

- **New constant** `DEFAULT_REVEAL_RECV_PERCENT = 100`.
- **New config field** `reveal-recv-percent: Option<usize>` added to both the
  per-`bench` struct and the `group` struct, with the existing
  config-inheritance logic extended so a `bench` inherits the value from its
  `group` when unspecified, then falls back to the default.
- **New resolved field** `reveal_recv_percent: usize` on the materialized
  `Config`.
- **New metric field** `reveal_recv_percent_actual: Option<f64>` threaded
  through the metrics structs so the *actual* revealed percentage is recorded
  in the CSV output (it can differ from the requested value because at least
  1 byte is always kept hidden).

### `crates/harness/executor/src/bench/prover.rs`

Replaced the original binary "reveal all / hide 1 byte" logic with a
percentage-driven disclosure calculation:

- The reveal range for the **sent** and **received** transcripts is now derived
  from `reveal_recv_percent` (clamped to `1..=100`), applied **symmetrically**
  to both directions.
- Range end is computed as `(len * pct / 100).min(len - 1)`, guaranteeing at
  least 1 byte stays hidden so the `reveal-all` fast path is never triggered
  and the realistic ZK selective-disclosure code path is always measured.
- The actual revealed percentage is computed and reported as
  `reveal_recv_percent_actual`.

---

## New files

### Benchmark configuration (new test case)

- `crates/harness/bench_proof_sweep.toml` — defines one `proof_sweep` group and
  ten benches sweeping `reveal-recv-percent` from 10% to 100% in steps of 10%,
  at fixed 100 Mbps / 25 ms / 10 KB upload / 20 KB download.

  > The three upstream sweep configs (`bench_bandwidth_sweep.toml`,
  > `bench_latency_sweep.toml`, `bench_download_sweep.toml`) are **unchanged**.

### Analysis documents

- `crates/harness/TLSNotary_EXPERIMENT_ANALYSIS.md` — full experiment chapter
  covering all four sweeps (bandwidth, latency, download size, proof reveal),
  cross-experiment analysis, and deployment latency estimates.
- `crates/harness/PROOF_REVEAL_SWEEP_ANALYSIS.md` — focused deep-dive on the new
  proof-reveal sweep.

### Experiment result data (benchmark output)

CSV outputs produced by running the sweeps on both targets:

- `tlsn-bandwidth-{native,browser}.csv`
- `tlsn-latency-{native,browser}.csv`
- `tlsn-download-{native,browser}.csv`
- `tlsn-proof-reveal-{native,browser}.csv`
- plus `native.csv` / `browser.csv`

### Build artifacts (not source)

- `crates/harness/bin/` — compiled `runner`, `executor-native`, `server-fixture`,
  `wasm-server` binaries.
- `crates/harness/static/generated/` — compiled WASM executor output.

---

## How to reproduce the experiments

```bash
cd crates/harness
sudo ./bin/runner setup

# Native (4 CSVs)
sudo ./bin/runner --target native bench --config bench_bandwidth_sweep.toml --output tlsn-bandwidth-native.csv
sudo ./bin/runner --target native bench --config bench_latency_sweep.toml   --output tlsn-latency-native.csv
sudo ./bin/runner --target native bench --config bench_download_sweep.toml  --output tlsn-download-native.csv
sudo ./bin/runner --target native bench --config bench_proof_sweep.toml     --output tlsn-proof-reveal-native.csv

# Browser (4 CSVs)
sudo ./bin/runner --target browser bench --config bench_bandwidth_sweep.toml --output tlsn-bandwidth-browser.csv
sudo ./bin/runner --target browser bench --config bench_latency_sweep.toml   --output tlsn-latency-browser.csv
sudo ./bin/runner --target browser bench --config bench_download_sweep.toml  --output tlsn-download-browser.csv
sudo ./bin/runner --target browser bench --config bench_proof_sweep.toml     --output tlsn-proof-reveal-browser.csv

# Cleanup network namespaces / traffic shaping
sudo ./bin/runner clean
```

---

## Tooling

- `.gitattributes` added at the project root (`* text=auto eol=lf`) to keep
  line endings normalized to LF and avoid CRLF noise when diffing against
  upstream.
