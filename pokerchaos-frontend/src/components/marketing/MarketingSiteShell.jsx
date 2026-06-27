import { useEffect } from "react";
import MarketingSiteHeader from "./MarketingSiteHeader.jsx";

export default function MarketingSiteShell({ currentPath = "/", children }) {
  useEffect(() => {
    document.body.classList.add("home-page-body");
    document.documentElement.classList.add("home-page-html");
    return () => {
      document.body.classList.remove("home-page-body");
      document.documentElement.classList.remove("home-page-html");
    };
  }, []);

  return (
    <main className="home-page-shell learning-page-shell">
      <div className="home-page-frame learning-page-frame">
        <MarketingSiteHeader currentPath={currentPath} />
        {children}
      </div>
    </main>
  );
}
