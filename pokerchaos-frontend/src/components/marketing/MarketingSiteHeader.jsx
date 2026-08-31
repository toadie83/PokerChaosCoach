import { SignInButton, SignUpButton, useAuth } from "@clerk/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import navIconMark from "../../assets/brand/playback-nav-image-icon.png";
import LearningDropdown from "./homepage/LearningDropdown.jsx";
import { LEARNING_DROPDOWN_SECTIONS } from "./homepage/homepageData.js";

const LEARNING_ACTIVE_PATHS = new Set([
  "/learn",
  "/articles",
  "/ai-poker-hand-analyzer",
  "/ggpoker-hand-review-tool",
  "/poker-leak-finder",
  "/mtt-hand-review-software",
  "/tournament-hand-analysis",
  "/poker-session-review",
  "/how-playback-poker-works",
  "/ai-limitations",
  "/supported-sites-formats",
  "/methodology",
]);

function isLearningPath(pathname) {
  if (!pathname) return false;
  if (pathname.startsWith("/learn/")) return true;
  if (pathname.startsWith("/articles/")) return true;
  return LEARNING_ACTIVE_PATHS.has(pathname);
}

export default function MarketingSiteHeader({ currentPath = "/" }) {
  const { isSignedIn } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [mobileLearningOpen, setMobileLearningOpen] = useState(false);
  const desktopLearningId = useId();
  const panelId = useId();
  const headerRef = useRef(null);
  const learningSections = useMemo(() => LEARNING_DROPDOWN_SECTIONS, []);
  const learningActive = isLearningPath(currentPath);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!headerRef.current?.contains(event.target)) {
        setLearningOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setLearningOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const studySpotsAction = (className, label = "Find Study Spots") =>
    isSignedIn ? (
      <a className={className} href="/tools/study-spots">
        {label}
      </a>
    ) : (
      <SignUpButton mode="modal">
        <button type="button" className={className}>
          {label}
        </button>
      </SignUpButton>
    );

  const signInAction = (className) =>
    isSignedIn ? (
      <a className={className} href="/tools">
        Open App
      </a>
    ) : (
      <SignInButton mode="modal">
        <button type="button" className={className}>
          Sign In
        </button>
      </SignInButton>
    );

  return (
    <header className="home-header" ref={headerRef}>
      <a className="home-brand" href="/" aria-label="Playback Poker homepage">
        <img src={navIconMark} alt="" className="home-brand-mark" />
        <span className="home-brand-copy">
          <strong>Playback Poker</strong>
          <span>MTT study, guided by your game</span>
        </span>
      </a>
      <button
        type="button"
        className={`home-menu-toggle ${menuOpen ? "is-open" : ""}`}
        aria-expanded={menuOpen}
        aria-label="Toggle navigation"
        onClick={() => setMenuOpen((value) => !value)}
      >
        <span />
        <span />
      </button>
      <div className={`home-nav-wrap ${menuOpen ? "is-open" : ""}`}>
        <nav className="home-nav" aria-label="Marketing navigation">
          <a className="home-nav-link" href="/#tools">
            Product
          </a>
          <div className="home-nav-desktop-only">
            <LearningDropdown
              isOpen={learningOpen}
              labelId={desktopLearningId}
              panelId={panelId}
              sections={learningSections}
              onToggle={() => setLearningOpen((value) => !value)}
              onClose={() => setLearningOpen(false)}
              triggerClassName={learningActive ? "is-active" : ""}
            />
          </div>
          <button
            type="button"
            className={`home-nav-link home-nav-mobile-accordion ${
              learningActive ? "is-active" : ""
            }`}
            aria-expanded={mobileLearningOpen}
            onClick={() => setMobileLearningOpen((value) => !value)}
          >
            <span>Learning</span>
            <span
              className={`home-nav-caret ${mobileLearningOpen ? "is-open" : ""}`}
              aria-hidden="true"
            >
              ^
            </span>
          </button>
          <div
            className={`home-mobile-learning ${mobileLearningOpen ? "is-open" : ""}`}
          >
            {learningSections.map((section) => (
              <div className="home-mobile-learning-group" key={section.title}>
                <p>{section.title}</p>
                {section.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setMenuOpen(false);
                      setMobileLearningOpen(false);
                    }}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <a
            className={`home-nav-link ${
              currentPath === "/how-playback-poker-works" ? "is-active" : ""
            }`}
            href="/#how-it-works"
          >
            How It Works
          </a>
          <a className="home-nav-link" href="/#methodology">About</a>
          {signInAction("home-nav-link")}
        </nav>
        {studySpotsAction("home-button home-button-primary home-header-cta")}
      </div>
    </header>
  );
}
