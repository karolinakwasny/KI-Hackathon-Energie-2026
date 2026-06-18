import pandas as pandas
path = "/Users/judith/Desktop/EnergieHackathon/client-backend/Ladevorgänge_Ladeinfrastruktur_Beispiel_Ladehub.xlsx"

df = pandas.read_excel(path, sheet_name="Ladevorgaenge")

df = df.rename(columns={
    "Ladepunkt": "charging_point",
    "Gestartet": "started",
    "Beendet": "ended",
    "Standzeit": "duration_text"
})

df["start"] = pandas.to_datetime(df["started"])
df["end"] = pandas.to_datetime(df["ended"])

df["duration"] = df["end"] - df["start"]
average_duration = df["duration"].dt.total_seconds().mean() / 60

print("Average duration in minutes:", round(average_duration, 1))

df["duration_minutes"] = df["duration"].dt.total_seconds() / 60
print(df[["charging_point", "start", "end", "duration_minutes"]].head())