import type { CSSProperties } from "react";

import { cn } from "../../shared/lib";
import "./WaveAuraBackground.css";

const streaks = [
  {
    start: "-18deg",
    sweep: "98deg",
    travel: "34deg",
    revealStart: "0.12",
    revealPeak: "0.34",
    revealFade: "0.58",
    duration: "11.4s",
    delay: "-3.2s",
    opacity: "0.54",
    scale: "1.08",
    radiusX: "14.6rem",
    radiusY: "9.6rem",
    bandWidth: "8.8rem",
    bandHeight: "1.28rem",
  },
  {
    start: "112deg",
    sweep: "112deg",
    travel: "-38deg",
    revealStart: "0.04",
    revealPeak: "0.28",
    revealFade: "0.5",
    duration: "23.8s",
    delay: "-11.4s",
    opacity: "0.58",
    scale: "1.04",
    radiusX: "14.8rem",
    radiusY: "9.8rem",
    bandWidth: "9.2rem",
    bandHeight: "1.34rem",
  },
  {
    start: "148deg",
    sweep: "92deg",
    travel: "28deg",
    revealStart: "0.2",
    revealPeak: "0.46",
    revealFade: "0.7",
    duration: "14.2s",
    delay: "-8.6s",
    opacity: "0.38",
    scale: "1",
    radiusX: "14.2rem",
    radiusY: "9.4rem",
    bandWidth: "8rem",
    bandHeight: "1.08rem",
  },
];

type WaveAuraBackgroundVariant = "primary" | "secondary";

type WaveAuraBackgroundProps = {
  variant?: WaveAuraBackgroundVariant;
  withInteractionOrb?: boolean;
};

export function WaveAuraBackground({
  variant = "primary",
  withInteractionOrb = false,
}: WaveAuraBackgroundProps) {
  return (
    <div
      className={cn(
        "wave-aura",
        `wave-aura--${variant}`,
        withInteractionOrb && "wave-aura--interactive",
      )}
      aria-hidden="true"
    >
      <span className="wave-aura__orb" />

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
                "--wave-aura-streak-reveal-start": streak.revealStart,
                "--wave-aura-streak-reveal-peak": streak.revealPeak,
                "--wave-aura-streak-reveal-fade": streak.revealFade,
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
    </div>
  );
}
