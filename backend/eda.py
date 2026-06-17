"""
Exploratory Data Analysis (EDA) for the EV charging-hub energy dataset.

Datasets (German source files in this folder):
  * Ladevorgaenge_...xlsx   -> individual charging sessions (transaction level)
  * Lastgang_...xlsx        -> 15-min load profile (kWh / kW) for 2025 & 2026
  * Spotmarktpreis_.xlsx    -> day-ahead spot market electricity prices (ct/kWh)
  * Berechnugn Netzentgelte.xlsx -> grid-fee (Netzentgelt) calculation sheet

Run:
    uv run python eda.py
or, inside the activated venv:
    python eda.py

Outputs: console summaries + figures written to ./eda_output/
"""
from __future__ import annotations

import glob
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import matplotlib

    matplotlib.use("Agg")  # headless / file output
    import matplotlib.pyplot as plt

    HAS_PLOTS = True
except Exception:  # pragma: no cover - plotting is optional
    HAS_PLOTS = False

BASE = Path(__file__).resolve().parent
# Source spreadsheets live in ./data (fall back to the script folder).
DATA = BASE / "data" if (BASE / "data").is_dir() else BASE
OUT = BASE / "eda_output"
OUT.mkdir(exist_ok=True)

pd.set_option("display.width", 160)
pd.set_option("display.max_columns", 30)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _find(pattern: str) -> Path:
    """Find the first file in DATA matching a substring (handles odd chars)."""
    for p in DATA.iterdir():
        if pattern.lower() in p.name.lower():
            return p
    raise FileNotFoundError(f"No file matching '{pattern}' in {DATA}")


def section(title: str) -> None:
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def savefig(name: str) -> None:
    if not HAS_PLOTS:
        return
    path = OUT / name
    plt.tight_layout()
    plt.savefig(path, dpi=110)
    plt.close()
    print(f"  [figure] {path.relative_to(BASE)}")


# --------------------------------------------------------------------------- #
# Loaders
# --------------------------------------------------------------------------- #
def load_sessions() -> pd.DataFrame:
    """Charging sessions (sheet 'Ladevorgaenge')."""
    f = _find("Ladevorg")
    df = pd.read_excel(f, sheet_name="Ladevorgaenge")
    df.columns = [str(c).strip() for c in df.columns]
    rename = {
        "Verbrauch (kWh)": "kwh",
        "Ladepunkt": "charge_point",
        "Gestartet": "start",
        "Beendet": "end",
        "Status": "status",
        "Phase": "phase",
        "Auth. Typ": "auth_type",
        "Stop-Grund": "stop_reason",
    }
    df = df.rename(columns=rename)
    df["start"] = pd.to_datetime(df["start"], errors="coerce")
    df["end"] = pd.to_datetime(df["end"], errors="coerce")
    df["kwh"] = pd.to_numeric(df["kwh"], errors="coerce")
    df["duration_min"] = (df["end"] - df["start"]).dt.total_seconds() / 60
    df = df.dropna(subset=["start", "kwh"])
    return df


def load_loadprofile() -> pd.DataFrame:
    """15-minute load profile across both year-sheets, tidied into long form."""
    f = _find("Lastgang")
    frames = []
    for sheet in pd.ExcelFile(f).sheet_names:
        raw = pd.read_excel(f, sheet_name=sheet, header=None)
        # Real values live in columns 4..7; first row is a sub-header.
        sub = raw.iloc[1:, [4, 5, 6, 7]].copy()
        sub.columns = ["date", "time", "kwh", "kw"]
        sub["kwh"] = pd.to_numeric(sub["kwh"], errors="coerce")
        sub["kw"] = pd.to_numeric(sub["kw"], errors="coerce")
        sub = sub.dropna(subset=["date", "kwh"])
        ts = pd.to_datetime(sub["date"].astype(str).str.split(" ").str[0]
                            + " " + sub["time"].astype(str), errors="coerce")
        sub["timestamp"] = ts
        frames.append(sub.dropna(subset=["timestamp"])[["timestamp", "kwh", "kw"]])
    out = pd.concat(frames, ignore_index=True).sort_values("timestamp")
    return out.reset_index(drop=True)


def load_spot() -> pd.DataFrame:
    """Spot market prices from both date-range sheets."""
    f = _find("Spotmarkt")
    frames = []
    for sheet in pd.ExcelFile(f).sheet_names:
        if "preis" not in sheet.lower():
            continue
        df = pd.read_excel(f, sheet_name=sheet)
        df.columns = [str(c).strip() for c in df.columns]
        price_col = [c for c in df.columns if "Spotmarktpreis" in c][0]
        ts = pd.to_datetime(df["Datum"].astype(str).str.split(" ").str[0]
                            + " " + df["von"].astype(str), errors="coerce")
        frames.append(pd.DataFrame({"timestamp": ts,
                                    "price_ct_kwh": pd.to_numeric(df[price_col],
                                                                  errors="coerce")}))
    out = pd.concat(frames, ignore_index=True).dropna().sort_values("timestamp")
    return out.reset_index(drop=True)


def load_netzentgelt() -> pd.DataFrame:
    f = _find("Netzentgelte")
    df = pd.read_excel(f, sheet_name="Berechnung", header=None)
    pairs = df.dropna(how="all")
    return pairs


# --------------------------------------------------------------------------- #
# Analyses
# --------------------------------------------------------------------------- #
def analyse_sessions(df: pd.DataFrame) -> None:
    section("1) CHARGING SESSIONS (Ladevorgaenge)")
    print(f"Sessions: {len(df):,}")
    print(f"Period:   {df['start'].min()}  ->  {df['start'].max()}")
    print(f"Total energy: {df['kwh'].sum():,.0f} kWh")
    print("\nEnergy per session (kWh):")
    print(df["kwh"].describe().round(2).to_string())
    print("\nDuration per session (min):")
    print(df["duration_min"].describe().round(1).to_string())

    print("\nSessions & energy per charge point (top 15):")
    by_cp = (df.groupby("charge_point")
               .agg(sessions=("kwh", "size"), kwh=("kwh", "sum"))
               .sort_values("kwh", ascending=False))
    print(by_cp.head(15).round(0).to_string())

    if "status" in df:
        print("\nStatus counts:")
        print(df["status"].value_counts().to_string())
    if "auth_type" in df:
        print("\nAuth type counts:")
        print(df["auth_type"].value_counts().to_string())

    df = df.copy()
    df["month"] = df["start"].dt.to_period("M").astype(str)
    df["hour"] = df["start"].dt.hour
    monthly = df.groupby("month")["kwh"].sum()
    hourly = df.groupby("hour")["kwh"].sum()

    print("\nMonthly energy (kWh):")
    print(monthly.round(0).to_string())

    if HAS_PLOTS:
        monthly.plot(kind="bar", title="Monthly charged energy (kWh)",
                     color="#2b7bba")
        plt.ylabel("kWh")
        savefig("sessions_monthly_kwh.png")

        hourly.plot(kind="bar", title="Energy by start hour (kWh)",
                    color="#3b9c5a")
        plt.xlabel("hour of day")
        plt.ylabel("kWh")
        savefig("sessions_hourly_kwh.png")

        df["kwh"].clip(upper=df["kwh"].quantile(0.99)).hist(bins=50,
                                                            color="#888")
        plt.title("Distribution of energy per session (kWh, 99th pct clip)")
        plt.xlabel("kWh")
        savefig("sessions_kwh_hist.png")


def analyse_loadprofile(df: pd.DataFrame) -> None:
    section("2) LOAD PROFILE (Lastgang, 15-min)")
    print(f"Intervals: {len(df):,}")
    print(f"Period:    {df['timestamp'].min()}  ->  {df['timestamp'].max()}")
    print(f"Total energy: {df['kwh'].sum():,.0f} kWh")
    print(f"Peak power:   {df['kw'].max():,.1f} kW")
    print("\nPower (kW) stats:")
    print(df["kw"].describe().round(2).to_string())

    df = df.copy()
    df["date"] = df["timestamp"].dt.date
    df["hour"] = df["timestamp"].dt.hour
    daily = df.groupby("date")["kwh"].sum()
    avg_day = df.groupby("hour")["kw"].mean()

    if HAS_PLOTS:
        daily.plot(title="Daily energy from load profile (kWh)", color="#2b7bba")
        plt.ylabel("kWh/day")
        savefig("load_daily_kwh.png")

        avg_day.plot(kind="bar", title="Average load shape by hour (kW)",
                     color="#c0504d")
        plt.xlabel("hour of day")
        plt.ylabel("avg kW")
        savefig("load_avg_hourly_kw.png")


def analyse_spot(df: pd.DataFrame) -> None:
    section("3) SPOT MARKET PRICES (Spotmarktpreis)")
    print(f"Quotes: {len(df):,}")
    print(f"Period: {df['timestamp'].min()}  ->  {df['timestamp'].max()}")
    print("\nPrice (ct/kWh) stats:")
    print(df["price_ct_kwh"].describe().round(3).to_string())
    print(f"Negative-price intervals: {(df['price_ct_kwh'] < 0).sum():,} "
          f"({(df['price_ct_kwh'] < 0).mean():.1%})")

    df = df.copy()
    df["hour"] = df["timestamp"].dt.hour
    by_hour = df.groupby("hour")["price_ct_kwh"].mean()
    print("\nAverage price by hour (ct/kWh):")
    print(by_hour.round(2).to_string())

    if HAS_PLOTS:
        by_hour.plot(kind="bar", title="Average spot price by hour (ct/kWh)",
                     color="#8064a2")
        plt.xlabel("hour of day")
        plt.ylabel("ct/kWh")
        savefig("spot_avg_hourly.png")

        df.set_index("timestamp")["price_ct_kwh"].resample("D").mean().plot(
            title="Daily mean spot price (ct/kWh)", color="#8064a2")
        plt.ylabel("ct/kWh")
        savefig("spot_daily_mean.png")


def analyse_cost_overlap(load: pd.DataFrame, spot: pd.DataFrame) -> None:
    """Combine load profile with spot prices to estimate energy cost."""
    section("4) LOAD x PRICE OVERLAP (indicative energy cost)")
    spot_idx = spot.set_index("timestamp")["price_ct_kwh"].sort_index()
    load_idx = load.set_index("timestamp").sort_index()
    # nearest spot price within 1h of each load interval
    merged = pd.merge_asof(load_idx, spot_idx, left_index=True, right_index=True,
                           direction="nearest", tolerance=pd.Timedelta("1h"))
    merged = merged.dropna(subset=["price_ct_kwh"])
    if merged.empty:
        print("No overlapping period between load profile and spot prices.")
        return
    merged["cost_eur"] = merged["kwh"] * merged["price_ct_kwh"] / 100.0
    print(f"Overlapping intervals: {len(merged):,}")
    print(f"Overlap period: {merged.index.min()} -> {merged.index.max()}")
    print(f"Energy in overlap: {merged['kwh'].sum():,.0f} kWh")
    print(f"Indicative spot energy cost: {merged['cost_eur'].sum():,.0f} EUR")
    avg = merged["cost_eur"].sum() / merged["kwh"].sum() * 100
    print(f"Volume-weighted avg price: {avg:,.2f} ct/kWh")


def analyse_netzentgelt(df: pd.DataFrame) -> None:
    section("5) GRID FEES (Netzentgelte) - calculation sheet")
    for _, row in df.iterrows():
        vals = [str(v) for v in row.tolist() if pd.notna(v)]
        if vals:
            print("  " + " | ".join(vals))


# --------------------------------------------------------------------------- #
def main() -> None:
    section("EV CHARGING-HUB EDA")
    print(f"Source folder: {DATA}")
    print("Files found:")
    for p in sorted(glob.glob(str(DATA / "*"))):
        print(f"  - {Path(p).name}")

    sessions = load_sessions()
    analyse_sessions(sessions)

    load = load_loadprofile()
    analyse_loadprofile(load)

    spot = load_spot()
    analyse_spot(spot)

    analyse_cost_overlap(load, spot)

    analyse_netzentgelt(load_netzentgelt())

    section("DONE")
    print(f"Figures saved to: {OUT}")


if __name__ == "__main__":
    main()
