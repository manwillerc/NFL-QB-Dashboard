"""Regular-season QB data API. Run with: python backend/app.py."""

import json
from pathlib import Path

import pandas as pd
from flask import Flask, jsonify, request

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "qb_stats_2025.csv"
METRICS = ["passing_yards", "passing_tds", "passing_interceptions"]
COLUMNS = [
    "player_id", "player_display_name", "position", "season", "season_type",
    "week", "game_id", "team", "opponent_team", "attempts", *METRICS,
]


def load_data(path):
    if not path.is_file():
        raise ValueError(f"Dataset missing: {path}. Run data/get_data.py first.")
    try:
        frame = pd.read_csv(path, dtype=str)
    except pd.errors.EmptyDataError as exc:
        raise ValueError(f"Dataset is empty: {path}. Restore or download the CSV.") from exc
    except (pd.errors.ParserError, UnicodeDecodeError) as exc:
        raise ValueError(f"Cannot read dataset: {path}. Restore a valid UTF-8 CSV.") from exc
    missing = sorted(set(COLUMNS) - set(frame.columns))
    if missing:
        raise ValueError(f"Dataset missing required columns: {', '.join(missing)}")
    source_rows = len(frame)
    frame = frame[COLUMNS].copy()
    text_columns = [c for c in COLUMNS if c not in ["season", "week", "attempts", *METRICS]]
    for column in text_columns:
        frame[column] = frame[column].str.strip()
        if frame[column].isna().any() or frame[column].eq("").any():
            raise ValueError(f"Dataset has missing values in {column}.")
    for column in ["season", "week", "attempts", *METRICS]:
        values = pd.to_numeric(frame[column], errors="coerce")
        if values.isna().any() or values.isin([float("inf"), float("-inf")]).any():
            raise ValueError(f"Dataset has missing or invalid numeric values in {column}.")
        if (values % 1 != 0).any():
            raise ValueError(f"Dataset has non-integer values in {column}.")
        frame[column] = values.astype(int)
    if not frame["season"].eq(2025).all() or not frame["position"].eq("QB").all():
        raise ValueError("Expected only 2025 QB records in the dataset.")
    if not frame["season_type"].isin(["REG", "POST"]).all():
        raise ValueError("Unexpected season_type; expected REG or POST.")
    before = len(frame)
    frame = frame.drop_duplicates()
    duplicates_removed = before - len(frame)
    key = ["player_id", "season", "season_type", "week"]
    if frame.duplicated(key).any():
        raise ValueError("Conflicting duplicate player/week records; resolve these before starting.")
    regular = frame.loc[frame["season_type"].eq("REG")].copy()
    if regular.empty or not regular["week"].between(1, 18).all():
        raise ValueError("Expected regular-season records in weeks 1–18.")
    if (regular[["attempts", "passing_tds", "passing_interceptions"]] < 0).any().any():
        raise ValueError("Attempts, TDs, and interceptions must be nonnegative.")
    return regular.sort_values(["player_id", "week"]), {
        "source_rows": source_rows,
        "excluded_postseason_rows": int(frame["season_type"].eq("POST").sum()),
        "exact_duplicates_removed": duplicates_removed,
    }


def records(frame):
    # pandas converts missing values to JSON null, including optional future fields.
    return json.loads(frame.to_json(orient="records"))


def create_app(data_path=DATA_PATH):
    app = Flask(__name__)
    weekly, audit = load_data(Path(data_path))  # Load and validate once at startup.
    teams = set(weekly["team"])
    players = set(weekly["player_id"])

    @app.after_request
    def local_cors(response):
        if request.headers.get("Origin") in {"http://localhost:5173", "http://127.0.0.1:5173"}:
            response.headers["Access-Control-Allow-Origin"] = request.headers["Origin"]
            response.vary.add("Origin")
        return response

    def filtered():
        unknown = set(request.args) - {"team", "player_id"}
        if unknown:
            return None, (jsonify(error=f"Unknown filters: {', '.join(sorted(unknown))}"), 400)
        frame = weekly
        for field, valid in [("team", teams), ("player_id", players)]:
            if field in request.args:
                value = request.args[field].strip()
                if len(request.args.getlist(field)) != 1 or value not in valid:
                    return None, (jsonify(error=f"Invalid {field}: {value}"), 400)
                frame = frame.loc[frame[field].eq(value)]
        return frame, None

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", season=2025, season_type="REG", rows=len(weekly),
                       players=len(players), teams=len(teams), **audit)

    @app.get("/api/qbs")
    def qbs():
        frame, error = filtered()
        if error is not None:
            return error
        return jsonify(rows=records(frame), count=len(frame))

    @app.get("/api/summary")
    def summary():
        frame, error = filtered()
        if error is not None:
            return error
        qb_rows = []
        for player_id, group in frame.groupby("player_id", sort=True):
            qb_rows.append({
                "player_id": player_id,
                "player_display_name": group.iloc[-1]["player_display_name"],
                "teams": sorted(group["team"].unique().tolist()),
                "games": int(group["game_id"].nunique()),
                **{metric: int(group[metric].sum()) for metric in METRICS},
            })
        team_totals = frame.groupby("team", as_index=False)[METRICS].sum()
        return jsonify(
            qbs=qb_rows, teams=records(team_totals),
            metadata={"season": 2025, "season_type": "REG", "weeks": list(range(1, 19)),
                      "source": "nflverse via nflreadpy.load_player_stats",
                      "scope": "QB passing production only; excludes non-QB passes.",
                      "team_filter": "Totals include only records played for the selected team.",
                      "missing_weeks": "No recorded appearance; do not infer zero production.",
                      **audit},
        )

    return app


if __name__ == "__main__":
    try:
        app = create_app()
    except ValueError as exc:
        raise SystemExit(f"Cannot start QB API: {exc}") from exc
    app.run(host="127.0.0.1", port=8000)
