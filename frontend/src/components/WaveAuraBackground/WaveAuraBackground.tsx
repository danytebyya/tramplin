import type { CSSProperties } from "react";

import "./WaveAuraBackground.css";

const streaks = [
  {
    start: "-18deg",
    sweep: "126deg",
    travel: "34deg",
    duration: "16.8s",
    delay: "-2.4s",
    opacity: "0.54",
    scale: "1.02",
    radiusX: "15.8rem",
    radiusY: "10.3rem",
    bandWidth: "10.6rem",
    bandHeight: "1.42rem",
  },
  {
    start: "112deg",
    sweep: "142deg",
    travel: "38deg",
    duration: "19.6s",
    delay: "-10.8s",
    opacity: "0.58",
    scale: "1.04",
    radiusX: "16.1rem",
    radiusY: "10.5rem",
    bandWidth: "11.2rem",
    bandHeight: "1.54rem",
  },
  {
    start: "148deg",
    sweep: "128deg",
    travel: "28deg",
    duration: "20.4s",
    delay: "-9.1s",
    opacity: "0.38",
    scale: "1",
    radiusX: "15.4rem",
    radiusY: "10.1rem",
    bandWidth: "9.8rem",
    bandHeight: "1.18rem",
  },
  {
    start: "268deg",
    sweep: "104deg",
    travel: "24deg",
    duration: "22.4s",
    delay: "-18.2s",
    opacity: "0.46",
    scale: "0.98",
    radiusX: "14.6rem",
    radiusY: "9.5rem",
    bandWidth: "9.4rem",
    bandHeight: "1.16rem",
  },
];

export function WaveAuraBackground() {
  return (
    <div className="wave-aura" aria-hidden="true">
      <div className="wave-aura__orbit wave-aura__orbit--outer">
        <span className="wave-aura__blob wave-aura__blob--outer" />
      </div>
      <div className="wave-aura__orbit wave-aura__orbit--middle">
        <span className="wave-aura__blob wave-aura__blob--middle" />
      </div>
      <div className="wave-aura__orbit wave-aura__orbit--inner">
        <span className="wave-aura__blob wave-aura__blob--inner" />
      </div>
      <div className="wave-aura__orbit wave-aura__orbit--accent">
        <span className="wave-aura__blob wave-aura__blob--accent" />
      </div>
      <span className="wave-aura__core" />
      <div className="wave-aura__streaks">
        {streaks.map((streak) => (
          <span
            key={`${streak.start}-${streak.delay}`}
            className="wave-aura__streak"
            style={
              {
                "--wave-aura-streak-start": streak.start,
                "--wave-aura-streak-sweep": streak.sweep,
                "--wave-aura-streak-travel": streak.travel,
                "--wave-aura-streak-duration": streak.duration,
                "--wave-aura-streak-delay": streak.delay,
                "--wave-aura-streak-opacity": streak.opacity,
                "--wave-aura-streak-scale": streak.scale,
                "--wave-aura-streak-radius-x": streak.radiusX,
                "--wave-aura-streak-radius-y": streak.radiusY,
                "--wave-aura-streak-band-width": streak.bandWidth,
                "--wave-aura-streak-band-height": streak.bandHeight,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <span className="wave-aura__wave wave-aura__wave--primary" />
      <span className="wave-aura__wave wave-aura__wave--secondary" />
      <span className="wave-aura__wave wave-aura__wave--tertiary" />
      <span className="wave-aura__veil wave-aura__veil--left" />
      <span className="wave-aura__veil wave-aura__veil--right" />
    </div>
  );
}
