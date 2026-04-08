# USPEX Analyzer

A browser-based analysis tool for USPEX crystal structure prediction outputs. Upload your USPEX output files and interactively explore, visualize, filter, and export your results — all without installing anything.

**Live Demo**: [https://chen121760.github.io/uspex-analyzer/](https://chen121760.github.io/uspex-analyzer/)

## Features

- ** Data Table** — Sortable, searchable table with all structure properties merged from multiple files
- ** Convex Hull** — Interactive 2D/3D convex hull visualization with hover details
- ** Pareto Front** — Multi-objective Pareto front visualization (auto-detected)
- ** Explorer** — Universal scatter plot: pick any two properties as axes with color mapping
- ** Tags** — Label structures as Candidate / To Verify / Excluded / custom tags
- ** Filter & Export** — Query builder with AND conditions, export as .zip / seeds / .csv
- ** Project Save/Load** — Save all data + annotations as .json, reload anytime

## Supported USPEX Files

| File | Description | Required |
|------|-------------|----------|
| `extended_convex_hull` | Convex hull data with fitness | ✅ (or Individuals) |
| `gatheredPOSCARS` | Relaxed crystal structures | ✅ |
| `Individuals` | All structures with generation & fingerprints | Optional |
| `Parameters.txt` | Element names | Optional |
| `origin` | Parent-child genealogy | Optional |
| `Pareto_ranking` | Multi-objective ranking | Optional |
| `MLProperties` | ML-predicted elastic properties | Optional |
| `convex_hull` | Per-generation hull snapshots | Optional |

Missing files won't crash the app — features just gracefully degrade.

