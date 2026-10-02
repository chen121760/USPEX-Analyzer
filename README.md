# USPEX Analyzer —— v1.5.3

A browser-based analysis tool for USPEX crystal structure prediction outputs. Supports 3D bulk, 2D structure search, and variable/fixed-composition calculations. **Now compatible with both USPEX 10.5/10.6 and USPEX 25** — the tool auto-detects your data format and adapts file requirements accordingly. Upload your USPEX output files and interactively explore, visualize, filter, and export your results — all without installing anything.

**Live Demo**: [https://chen121760.github.io/USPEX-Analyzer/](https://chen121760.github.io/USPEX-Analyzer/)

> This tool is listed on the official [USPEX Tools & Utilities](https://uspex-team.org/zh/uspex/tools) page.

## Features

- Data Table — Sortable, searchable table with all structure properties merged from multiple files
- Convex Hull — Explore binary, ternary, and quaternary phase diagrams, switch between 2D and 3D ternary views, and filter structures by fitness. Zoom into a triangular composition region, pan, return to a previous view, or reset. Inspect stable phases, mark candidates, and export charts and data.
- **Hull Workshop** — Combine calculation results for the same element system, pressure, and composition blocks. Import the current project, select saved projects, or load a workshop JSON file. Add candidate structures by composition and enthalpy to evaluate their stability; compare the original and expanded hulls as dashed and solid lines. Fixed-composition groups provide relative-energy rankings.
- Pareto Front — Multi-objective Pareto front visualization (auto-detected)
- Explorer — Universal scatter plot with color mapping, dual-range slider filter, autoplay, and GIF export
- HV Tracker — On-the-fly Pareto front computation on any two axes with hypervolume-vs-generation convergence tracking
- Genealogy — View the parent and offspring relationships of any structure
- Tags — Label structures as Candidate / To Verify / Excluded / custom tags
- Filter & Export — Select structures using AND/OR conditions, tags, component counts, and element fractions, then export the selection as .zip / seeds / .csv / .json.
- **Export Data** — Download chart datasets as Origin-compatible CSV files using the selected fitness range, color range, or Pareto fronts. Export PNG images of the current chart view.
- Project Save/Load — Save all data + annotations as .json, reload anytime
- Times New Roman typography for all Latin text and numbers across the UI and charts
- **Page Guide** — Right-side guide drawer with feature overview and background knowledge for key pages; guide state is project-wide and remembered across pages

## Demo

**Upload & Load**
![Upload & Load](public/GIF/01-update-ezgif.com-video-to-gif-converter.gif)

**Data Table**
![Data Table](public/GIF/02-Table-ezgif.com-video-to-gif-converter.gif)

**Convex Hull**
![Convex Hull](public/GIF/03-ConvexHull-ezgif.com-video-to-gif-converter.gif)

**Hull Workshop**
![Hull Workshop](public/GIF/08-HullWorkshop-ezgif.com-video-to-gif-converter.gif)

**Pareto Front**
![Pareto Front](public/GIF/04-Pareto_front-ezgif.com-video-to-gif-converter.gif)

**Explorer**
![Explorer](public/GIF/05--ezgif.com-video-to-gif-converter.gif)

**Filter**
![Filter](public/GIF/06--ezgif.com-video-to-gif-converter.gif)

**HV Tracker**
![HV Tracker](public/GIF/07-HV-ezgif.com-video-to-gif-converter.gif)

## Supported USPEX Files

The tool auto-detects whether your data comes from USPEX 10.5 (legacy format) or USPEX 25 and adapts file requirements accordingly.

### USPEX 10.5 — Core files (all 4 required)

| File | Description |
|------|-------------|
| `Individuals` | All predicted structures, including generation, composition, enthalpy/fitness, and fingerprint information |
| `origin` | Parent-child genealogy and variation history of structures |
| `Parameters.txt` | Element information and run metadata |
| `gatheredPOSCARS` | Relaxed crystal structures in POSCAR format |

### USPEX 25 — Core files (minimum 2)

| File | Description |
|------|-------------|
| `Individuals` | All predicted structures with USPEX25 column schema (`generation number num_atoms_all energy ...`) |
| `gatheredPOSCARS` | Relaxed crystal structures in POSCAR format (`number=ID` markers) |

### Optional files (workflow-specific, both versions)

| File | Description | When to upload |
|------|-------------|----------------|
| `extended_convex_hull` | Convex hull data for variable-composition calculations | Upload for variable-composition searches |
| `Pareto_ranking` | Ranking results for multi-objective optimization | Upload for multi-objective runs |
| `MLProperties` | ML-predicted properties from elastic-modulus machine-learning models | Upload for `optType 1201–1207` |

### Notes

- If the run is a variable-composition calculation, also upload `extended_convex_hull`.
- If the run is a multi-objective optimization, also upload `Pareto_ranking`.
- If the run uses the elastic-modulus machine-learning model (`optType 1201–1207`), you may also upload `MLProperties`.

