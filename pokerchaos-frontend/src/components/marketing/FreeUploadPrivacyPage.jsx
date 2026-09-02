import { useEffect } from "react";

import MarketingSiteShell from "./MarketingSiteShell.jsx";
import "./homepage/homepage-v2.css";

export default function FreeUploadPrivacyPage() {
  useEffect(() => {
    document.title = "Free Tournament Upload Privacy | Playback Poker";
    let description = document.head.querySelector('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.setAttribute("name", "description");
      document.head.appendChild(description);
    }
    description.setAttribute(
      "content",
      "How Playback Poker processes and protects anonymous homepage tournament uploads.",
    );
    let robots = document.head.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "noindex,follow");
  }, []);

  return (
    <MarketingSiteShell
      currentPath="/free-upload-privacy"
      pageClassName="home-v2 home-v2-free-upload-privacy-page"
      headerCtaLabel="Upload Tournament Free"
      headerCtaHref="/#upload"
    >
      <section className="free-upload-privacy">
        <header>
          <p className="home-v2-kicker">Anonymous upload privacy</p>
          <h1>Your tournament is processed for your plan, not retained.</h1>
          <p>
            The free homepage check uses your tournament only to identify useful
            Study Spots and match them with published Playback Poker lessons.
          </p>
        </header>

        <div className="free-upload-privacy-grid">
          <article>
            <span>01</span>
            <h2>What we process</h2>
            <p>
              Your hand-history text and poker screen name are held in application
              memory while the request is analysed. No account, email address, or
              contact details are requested for the anonymous check.
            </p>
          </article>
          <article>
            <span>02</span>
            <h2>What Playback Poker retains</h2>
            <p>
              The raw file and parsed tournament are not written to the Playback
              Poker database. Only the sanitised Study Plan is kept temporarily
              so the result page can load. Anonymous use is limited to three
              successful plans.
            </p>
          </article>
          <article>
            <span>03</span>
            <h2>Abuse prevention</h2>
            <p>
              Short-lived technical safeguards enforce the public rate limit.
              Those controls do not contain hand-history text or tournament data.
            </p>
          </article>
          <article>
            <span>04</span>
            <h2>AI processing</h2>
            <p>
              Where AI classification is needed, OpenAI receives compact structured
              decision context rather than the uploaded tournament file or screen
              name. OpenAI states that API data is not used to train its models by
              default. Its API retention and abuse-monitoring controls still apply.
            </p>
          </article>
        </div>

        <aside className="free-upload-privacy-note">
          <div>
            <strong>Important</strong>
            <p>
              Study suggestions are automated educational guidance, not a guarantee
              of poker outcomes or a substitute for independent review.
            </p>
          </div>
          <nav aria-label="Upload privacy references">
            <a href="https://platform.openai.com/docs/guides/your-data" target="_blank" rel="noreferrer">
              OpenAI API data controls <span aria-hidden="true">↗</span>
            </a>
            <a href="https://openai.com/policies/privacy-policy/" target="_blank" rel="noreferrer">
              OpenAI privacy policy <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </aside>

        <a className="home-v2-text-link free-upload-privacy-back" href="/#upload">
          ← Back to the free tournament upload
        </a>
      </section>
    </MarketingSiteShell>
  );
}
