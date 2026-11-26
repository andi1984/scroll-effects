import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useEffectToggle } from "@andi1984/scroll-effects-core";
import { Frost, frostPreference } from "@andi1984/scroll-frost";
import { Vine, vinePreference } from "@andi1984/scroll-vine";
import "@andi1984/scroll-vine/styles.css";
import "@andi1984/scroll-frost/styles.css";
import "./demo.css";

type Effect = "vine" | "frost";

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante venenatis dapibus posuere velit aliquet. Cras mattis consectetur purus sit amet fermentum. Donec ullamcorper nulla non metus auctor fringilla. Maecenas sed diam eget risus varius blandit sit amet non magna. Nullam quis risus eget urna mollis ornare vel eu leo.";

function App() {
  const [effect, setEffect] = useState<Effect>(
    () => (new URLSearchParams(location.search).get("effect") as Effect) || "frost",
  );
  const [dark, setDark] = useState(false);
  const pref = effect === "vine" ? vinePreference : frostPreference;
  const toggle = useEffectToggle(pref);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
  }, [dark]);

  const pick = (e: Effect) => {
    setEffect(e);
    const url = new URL(location.href);
    url.searchParams.set("effect", e);
    history.replaceState(null, "", url);
  };

  return (
    <>
      <header>
        <div className="wrap">
          <strong>scroll-effects</strong>
          {(["frost", "vine"] as const).map((e) => (
            <button key={e} aria-pressed={effect === e} onClick={() => pick(e)}>
              {e}
            </button>
          ))}
          <button onClick={() => setDark(!dark)}>{dark ? "light" : "dark"}</button>
          <button
            onClick={() => {
              sessionStorage.clear();
              location.reload();
            }}
          >
            new visit
          </button>
          {toggle.available && (
            <button onClick={toggle.toggle}>
              {toggle.hidden ? `Show the ${effect}` : `Hide the ${effect}`}
            </button>
          )}
        </div>
      </header>
      <main className="wrap">
        <h1>Read on</h1>
        <p>
          Scroll: the effect grows with reading progress in the margins (needs a window at
          least 1366px wide). Hover a crystal or leaf.
        </p>
        {Array.from({ length: 40 }, (_, i) => (
          <p key={i}>{LOREM}</p>
        ))}
      </main>
      {effect === "vine" ? <Vine /> : <Frost />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
