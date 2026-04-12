# USPEX Analyzer 
# —— v1.0.1

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

For best results, please upload the core USPEX output files for every calculation:

| File | Description | Recommendation |
|------|-------------|----------------|
| `Individuals` | All predicted structures, including generation, composition, enthalpy/fitness, and fingerprint information | Recommended for all calculations |
| `origin` | Parent-child genealogy and variation history of structures | Recommended for all calculations |
| `Parameters.txt` | Element information and run metadata | Recommended for all calculations |
| `gatheredPOSCARS` | Relaxed crystal structures in POSCAR format | Recommended for all calculations |

Additional files are useful for specific USPEX workflows:

| File | Description | When to upload |
|------|-------------|----------------|
| `extended_convex_hull` | Convex hull data for variable-composition calculations | Upload for variable-composition searches |
| `Pareto_ranking` | Ranking results for multi-objective optimization | Upload for multi-objective runs |
| `MLProperties` | ML-predicted properties from elastic-modulus machine-learning models | Upload for `optType 1201–1207` |

### Notes

- For best results, upload the core files: `Individuals`, `origin`, `Parameters.txt`, and `gatheredPOSCARS`.
- If the run is a variable-composition calculation, also upload `extended_convex_hull`.
- If the run is a multi-objective optimization, also upload `Pareto_ranking`.
- If the run uses the elastic-modulus machine-learning model (`optType 1201–1207`), you may also upload `MLProperties`.

Missing files won't crash the app — features just gracefully degrade.

