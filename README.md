# 2025 NFL qb statistics

A local Flask + pandas API and HTML/CSS/JavaScript + D3 dashboard for comparing
2025 NFL quarterback production. Explore season rankings, a player's weekly
passing trend, and team QB production. No database, Node.js, or frontend build
step is required. Hosting is localhost-only.

## Install

Use Python **3.11 or newer** (verified with Python 3.14.7). The checked-in CSV is
enough to run the dashboard; downloading fresh data is optional. D3 7.9.0 is
bundled in `frontend/vendor/`, so no CDN access is needed at runtime.

Download/extract the project or clone it, then open a terminal **in the repository
root**, the folder containing `backend`, `frontend`, and `data`:

```bash
git clone https://github.com/manwillerc/NFL-QB-Dashboard.git
cd NFL-QB-Dashboard
python --version
python -m pip install -r requirements.txt
```

If you downloaded a ZIP, skip the `git clone` line and change into its extracted
folder. The remaining commands are the same. Activate your Python environment
(for example, `conda activate dvjupyter` if you already have that environment)
before installing dependencies. `python --version` must report Python 3.11 or
newer. These commands use the active environment; a project `.venv` is not required.

## Start both servers

Keep two terminals open. **Both commands below start from the repository root.**
Activate the same Python environment in both terminals (for example,
`conda activate dvjupyter` if that is your environment).

Terminal 1 — Flask API, port **8000**:

```bash
python backend/app.py
```

Terminal 2 — frontend, port **5173**:

```bash
python -m http.server 5173 --bind 127.0.0.1 --directory frontend
```

Open **http://localhost:5173**. Keep the API running while using the dashboard.
Use Ctrl+C in each terminal to stop the servers. Do not open `index.html` with a
`file://` URL.

If your terminal is already **inside `frontend/`**, use this instead for Terminal 2:

```bash
python -m http.server 5173 --bind 127.0.0.1
```

If your terminal is already **inside `backend/`**, use this for Terminal 1:

```bash
python app.py
```

## Explore the dashboard

1. Change the rankings metric between passing yards, passing TDs, and
   interceptions thrown. Sort highest or lowest first. These are totals, not
   rates; fewer interceptions is generally preferable. Scroll to see all QBs.
2. **Pair A — rankings → weekly trend:** click a QB bar or name. The bar becomes
   orange and the trend shows that player's weekly passing yards. The QB dropdown
   offers an equivalent selection control.
3. **Pair B — team scatterplot → rankings:** click a team point. Rankings now show
   that team's QBs, with totals calculated only from games played for that team.
   The selected team turns orange; the scatterplot retains every team for context.
4. Combine the selections. The weekly chart shows only appearances for the
   selected team. Changing teams retains an eligible QB; otherwise it clears the
   QB and asks you to select another. Joe Flacco has both CLE and CIN records in
   the supplied data and can demonstrate this behavior.
5. **Clear QB** leaves the team filter active and clears the weekly chart.
   **Clear Team** restores all-team rankings and the selected QB's full-season
   trend. **Reset All** restores passing yards, highest first, all teams, and the
   season passing-yards leader as the selected QB.

Hover or focus chart marks for details. Tab moves between controls and marks;
Enter or Space activates selectable bars/points. Escape dismisses the tooltip.
Weekly dots also show details when tapped. Selection labels display the current
QB and team. Layouts adapt to narrow screens.

## API

Base URL: `http://127.0.0.1:8000`. Both data endpoints accept optional `team` and
`player_id` parameters, including both together. Team IDs are case-sensitive.
Find player IDs in `/api/summary`; do not substitute player names for IDs.

| Endpoint | Response |
| --- | --- |
| `/api/health` | Status, regular-season row/player/team counts, and data-cleaning counts |
| `/api/qbs` | `{ "rows": [...], "count": ... }` with cleaned weekly records |
| `/api/summary` | `{ "qbs": [...], "teams": [...], "metadata": {...} }` with totals and methodology |
| `/api/qbs?team=CLE` | Weekly records played for CLE |
| `/api/summary?team=CIN` | Player and team totals for CIN records only |

Quick checks in another terminal:

```bash
curl --fail http://127.0.0.1:8000/api/health
curl --fail 'http://127.0.0.1:8000/api/qbs?team=CLE'
curl --fail 'http://127.0.0.1:8000/api/summary?team=CIN'
```

Invalid, blank, repeated, or unknown filters return HTTP 400 with a JSON `error`.
Valid filters with no matching combination return empty lists (HTTP 200). CORS
allows the local frontend origins `http://localhost:5173` and
`http://127.0.0.1:5173`. The frontend fetches the weekly and summary endpoints once,
then uses shared JavaScript state for immediate linked updates without refetching.

## Data and methodology

Source: [nflverse player statistics](https://github.com/nflverse/nflverse-data/releases/tag/player_stats),
downloaded with [nflreadpy](https://github.com/nflverse/nflreadpy) using
`load_player_stats(seasons=[2025])` and filtered to `position == 'QB'`.

The supplied `data/qb_stats_2025.csv` contains 692 rows and 150 columns. The API
uses **664 regular-season rows**, covering **81 QBs, 32 teams, and weeks 1–18**;
it excludes 28 postseason rows. The supplied snapshot totals 122,227 QB passing
yards, 805 passing TDs, and 378 interceptions. These are documentation checkpoints,
not values embedded in the chart code; a later source refresh may change them.

- The API loads the CSV once at startup, using a path relative to `app.py`.
  Restart Flask after changing the dataset.
- Relevant columns include `player_id`, `player_display_name`, `season`,
  `season_type`, `week`, `game_id`, `team`, `opponent_team`, `attempts`,
  `passing_yards`, `passing_tds`, and `passing_interceptions`.
- Player totals use `player_id`, not name. Each weekly record retains its actual
  team, so midseason team changes do not credit a player's entire season to one
  team. The dropdown lists a player's team affiliations.
- Required identifiers and numeric fields must be present and valid. Missing or
  nonfinite required numbers cause a clear startup error rather than silent
  imputation. Legitimate negative passing yards and zero-attempt records remain.
- Exact duplicate records are removed; conflicting duplicate player/season/type/
  week keys stop startup to prevent accidental double-counting. The original CSV
  has neither kind of duplicate. Responses use standard JSON with nulls for any
  missing serialized values.
- Missing weeks appear as line gaps, not zero-yard games. The data does not
  explain whether missing appearances mean injury, inactivity, or a bye. A zero
  dot represents an actual recorded zero-yard appearance.
- All team metrics are **QB passing production**, excluding non-QB passes. These
  are not total team passing offense or net passing yards after sacks. Raw totals
  reflect playing time as well as performance; the dashboard does not establish
  causal explanations or rank efficiency.

### Optional: refresh the CSV

The app itself only needs `requirements.txt`. To download again, install the
additional downloader dependencies and run from the repository root:

```bash
python -m pip install nflreadpy pyarrow
python data/get_data.py
```

This requires internet access and **replaces** `data/qb_stats_2025.csv` with current
2025 QB records from nflverse, including postseason records for the API to exclude.
Keep a copy of the supplied snapshot if you want to preserve the documented
counts. The script always writes beside itself, regardless of the working
directory. The dashboard does not require this optional refresh.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `python` not found or the wrong version runs | Activate your Python 3.11+ environment, then check `python --version`. For an existing Conda environment, use `conda activate dvjupyter` (or your own environment name). |
| `ModuleNotFoundError` | Install with `python -m pip install -r requirements.txt` from the root. Using a different Python environment will not see these packages. |
| API cannot load / request times out | Start Terminal 1; open `/api/health`. The dashboard times out after 10 seconds and offers Try again. |
| HTTP 404 or directory listing in the frontend | Start the root frontend command with `--directory frontend`, or omit that option when already inside `frontend/`. |
| Port already in use | Stop your previous server in its terminal with Ctrl+C, then restart. Ports 8000 and 5173 are the configured pair. |
| CORS error | Open `http://localhost:5173` or `http://127.0.0.1:5173`; other frontend origins are not allowed. |
| Dataset missing or required columns invalid | Restore the supplied CSV or intentionally refresh it with the optional downloader. Read Flask's startup error for the affected column. |
| Edits or CSV changes do not appear | Refresh the browser for frontend edits; restart Flask for CSV/backend changes. |

## Project files and submission

```text
backend/app.py                Flask API and validation
data/qb_stats_2025.csv        Supplied real dataset
data/get_data.py              Optional downloader
frontend/index.html          Dashboard structure
frontend/styles.css          Responsive styles
frontend/app.js              D3 charts and shared interaction state
frontend/vendor/             D3 bundle and its license
requirements.txt             Runtime Python dependencies
.gitignore                   Local environments, caches, and secrets excluded
README.md                    Setup, controls, API, and data notes
```

## Submission notes

Include the backend, frontend, dataset, downloader, requirements, and README in
the submission ZIP. Exclude `.venv`, `node_modules`, `.git`, editor settings,
caches, and secrets; `.gitignore` alone does not exclude files from a manually
created ZIP. Keep the D3 license with its bundled library.

The student must supply their own narrated demo and final report. Review and
understand the implementation, verify findings against the data, and accurately
disclose AI assistance. Codex assisted with backend/frontend implementation,
interaction design, testing, and documentation; personal development hours,
reflections, sketches, and narration must come from the student.
