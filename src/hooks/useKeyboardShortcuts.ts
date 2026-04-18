import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  const handleKey = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    const isInput = ["INPUT","TEXTAREA","SELECT"].includes(tag) || (e.target as HTMLElement).isContentEditable;

    // ⌘K / Ctrl+K — global search
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      navigate("/app/search");
      return;
    }

    // Skip single-key shortcuts when typing in inputs
    if (isInput) return;

    switch (e.key) {
      case "g":
        // g+d = dashboard, g+c = collection, etc. — handled via double-key below
        break;
      case "1": navigate("/app"); break;
      case "2": navigate("/app/collection"); break;
      case "3": navigate("/app/search"); break;
      case "4": navigate("/app/decks"); break;
      case "5": navigate("/app/decksmith"); break;
      case "?":
        // show help overlay — dispatched as custom event
        window.dispatchEvent(new CustomEvent("phantom:shortcuts-help"));
        break;
    }
  }, [navigate]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);
}
