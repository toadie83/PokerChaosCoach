import {
  COACH_ACCESS_DESCRIPTION,
  COACH_CONTACT_EMAIL,
  COACH_EARLY_ACCESS_URL,
} from "../lib/coachAccess.js";

export default function PokerCoachPlaceholder() {
  return (
    <main className="tools-page tools-page--focused">
      <header className="tools-page-header">
        <p className="tools-page-kicker">Poker Coach · Paid early access</p>
        <h1>Personalised ongoing analysis and study guidance.</h1>
        <p>{COACH_ACCESS_DESCRIPTION}</p>
        <p>Contact Trev to discuss pricing and an agreed usage allowance before access is enabled.</p>
        <a className="tool-card-action" href={COACH_EARLY_ACCESS_URL}>
          Contact me — request early access
        </a>
        <p>
          Opens your email app. You can also email {COACH_CONTACT_EMAIL} directly.
          Sending a request does not start a subscription or unlock Coach.
        </p>
      </header>
    </main>
  );
}
