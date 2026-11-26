import { useEffect, useState } from "react";
import type { EffectPreference } from "./preference";

export interface EffectToggleState {
  /** Whether a switch makes sense here: room for the effect, no quiet setting. */
  available: boolean;
  /** The visitor switched the effect off. */
  hidden: boolean;
  toggle(): void;
}

/**
 * State for a "Hide the …" / "Show the …" switch. Render the button yourself;
 * only offer it while `available` is true. Starts unavailable until mounted,
 * so server and client markup agree.
 */
export function useEffectToggle(pref: EffectPreference): EffectToggleState {
  const [available, setAvailable] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const queries = [pref.spaceQuery, pref.quietQuery].map((q) =>
      window.matchMedia(q),
    );
    const update = () => {
      setAvailable(pref.canShow());
      setHidden(pref.isHidden());
    };
    update();
    queries.forEach((q) => q.addEventListener("change", update));
    window.addEventListener(pref.event, update);
    return () => {
      queries.forEach((q) => q.removeEventListener("change", update));
      window.removeEventListener(pref.event, update);
    };
  }, [pref]);

  return { available, hidden, toggle: () => pref.setHidden(!hidden) };
}
