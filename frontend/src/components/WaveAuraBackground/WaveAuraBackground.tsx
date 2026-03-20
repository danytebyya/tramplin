import "./WaveAuraBackground.css";

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
      <span className="wave-aura__wave wave-aura__wave--primary" />
      <span className="wave-aura__wave wave-aura__wave--secondary" />
      <span className="wave-aura__wave wave-aura__wave--tertiary" />
      <span className="wave-aura__veil wave-aura__veil--left" />
      <span className="wave-aura__veil wave-aura__veil--right" />
    </div>
  );
}
