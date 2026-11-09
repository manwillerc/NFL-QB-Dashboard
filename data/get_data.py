"""Optional refresh of the real nflverse dataset; not required to run the app."""

from pathlib import Path


def main():
    import nflreadpy as nfl

    frame = nfl.load_player_stats(seasons=[2025]).to_pandas()
    qbs = frame.loc[frame["position"].eq("QB")].copy()
    if qbs.empty:
        raise ValueError("nflverse returned no 2025 QB records; existing CSV was not changed.")
    output = Path(__file__).resolve().parent / "qb_stats_2025.csv"
    qbs.to_csv(output, index=False)
    print(f"Downloaded {len(qbs)} QB weekly records to {output}")


if __name__ == "__main__":
    main()
