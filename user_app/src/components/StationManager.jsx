import React from "react";

export default function StationManager({ stations, stationAssetGroups }) {
  return (
    <div className="stations-vertical-stack">
      {stations.map((stationSpots, stationIndex) => {
        const takenCount = stationSpots.filter(Boolean).length;
        const isOccupied = takenCount === 2;

        return (
          <div className="station-card" key={stationIndex}>
            <div className="station-card-header">
              <h3>Station {stationIndex + 1}</h3>
              <span
                className={`badge ${isOccupied ? "badge--busy" : "badge--avail"}`}
              >
                {isOccupied ? "OCCUPIED" : "AVAILABLE"}
              </span>
            </div>

            <div className="station-row-track">
              {stationSpots.map((taken, spotIndex) => {
                const currentAssetPair =
                  stationAssetGroups[stationIndex][spotIndex];
                const displayedImage = taken
                  ? currentAssetPair.taken
                  : currentAssetPair.free;

                return (
                  <div
                    className={`spot-bay ${taken ? "spot-bay--active" : ""}`}
                    key={spotIndex}
                  >
                    <img src={displayedImage} alt="Telemetry tracking" />
                    <div className="spot-bay-footer">
                      <span className="indicator-light"></span>
                      <span className="lbl">Slot {spotIndex + 1}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
