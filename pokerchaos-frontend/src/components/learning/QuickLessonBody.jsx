import { buildQuickLessonPresentation, parseExampleSpot } from "../../lib/quickLessonPresentation.js";
import { learningLabel } from "../../lib/learningPresentation.js";
import PlaybackBrand from "../PlaybackBrand.jsx";
import MarkdownContent from "./MarkdownContent.jsx";

function PokerCard({ card }) {
  return (
    <span className={`quick-card quick-card--${card.color}`} aria-label={`${card.rank} of ${card.suit}`}>
      <strong>{card.rank}</strong><span>{card.symbol}</span>
    </span>
  );
}

function CardRow({ cards, label }) {
  if (!cards.length) return null;
  return (
    <div className="quick-card-row">
      <span>{label}</span>
      <div>{cards.map((card, index) => <PokerCard card={card} key={`${card.rank}-${card.suit}-${index}`} />)}</div>
    </div>
  );
}

function TeachingSection({ eyebrow, title, children, className = "" }) {
  if (!children) return null;
  return (
    <section className={`quick-lesson-section ${className}`.trim()}>
      {eyebrow ? <p className="quick-lesson-eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ExampleSpot({ markdown, resource }) {
  if (!markdown) return null;
  const spot = parseExampleSpot(markdown, resource);
  return (
    <TeachingSection title="Example Spot" eyebrow="Put it at the table" className="quick-lesson-spot">
      {spot.facts.length ? (
        <dl className="quick-spot-facts">
          {spot.facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
          ))}
        </dl>
      ) : null}
      <div className="quick-spot-cards">
        <CardRow cards={spot.heroCards} label="Hero cards" />
        <CardRow cards={spot.boardCards} label="Board" />
      </div>
      {spot.narrative.length ? <MarkdownContent markdown={spot.narrative.join("\n\n")} className="quick-spot-narrative" /> : null}
      {spot.decision ? (
        <div className="quick-spot-decision"><span>Decision</span><p>{spot.decision}</p></div>
      ) : null}
    </TeachingSection>
  );
}

function Conditions({ items, caution = false }) {
  if (!items.length) return null;
  return (
    <ul className={`quick-condition-list ${caution ? "quick-condition-list--caution" : ""}`.trim()}>
      {items.map((item, index) => <li key={`${index}-${item}`}><span aria-hidden="true">{caution ? "!" : "✓"}</span>{item}</li>)}
    </ul>
  );
}

export default function QuickLessonBody({ resource }) {
  const lesson = buildQuickLessonPresentation(resource);
  return (
    <div className="quick-lesson-body">
      <TeachingSection title="Today's Edge" eyebrow="The concept" className="quick-lesson-edge">
        <MarkdownContent markdown={lesson.edge} />
      </TeachingSection>

      {lesson.reasons.length ? (
        <TeachingSection title="Why It Works" eyebrow="Build the reasoning" className="quick-lesson-why">
          <ol className="quick-reason-grid">
            {lesson.reasons.map((reason, index) => (
              <li key={`${index}-${reason.title}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{reason.title}</h3><MarkdownContent markdown={reason.detail} /></div>
              </li>
            ))}
          </ol>
        </TeachingSection>
      ) : null}

      <ExampleSpot markdown={lesson.example} resource={resource} />

      {lesson.decisions.length ? (
        <TeachingSection title="The Decision" eyebrow="Compare the lines" className="quick-lesson-decision">
          <div className="quick-decision-options">
            {lesson.decisions.map((option, index) => (
              <article className={option.recommended ? "quick-decision-option--recommended" : ""} key={`${index}-${option.title}`}>
                {option.recommended ? <span>Recommended here</span> : null}
                <h3>{option.title}</h3>
                <MarkdownContent markdown={option.detail} />
              </article>
            ))}
          </div>
          <p className="quick-decision-context">The best line always depends on the actual table, ranges, and stack context.</p>
        </TeachingSection>
      ) : null}

      {(lesson.mistake || lesson.betterPlay) ? (
        <div className="quick-teaching-contrast">
          {lesson.mistake ? (
            <TeachingSection title="The Mistake" className="quick-teaching-card quick-teaching-card--mistake">
              <MarkdownContent markdown={lesson.mistake} />
            </TeachingSection>
          ) : null}
          {lesson.betterPlay ? (
            <TeachingSection title="The Better Play" className="quick-teaching-card quick-teaching-card--better">
              <MarkdownContent markdown={lesson.betterPlay} />
            </TeachingSection>
          ) : null}
        </div>
      ) : null}

      {(lesson.whenToUse.length || lesson.whenNotToUse.length) ? (
        <div className="quick-condition-grid">
          {lesson.whenToUse.length ? (
            <TeachingSection title="When to Use"><Conditions items={lesson.whenToUse} /></TeachingSection>
          ) : null}
          {lesson.whenNotToUse.length ? (
            <TeachingSection title="When Not to Use"><Conditions items={lesson.whenNotToUse} caution /></TeachingSection>
          ) : null}
        </div>
      ) : null}

      {lesson.sizing ? (
        <TeachingSection title="Sizing" eyebrow="Reference" className="quick-sizing-card">
          <MarkdownContent markdown={lesson.sizing} />
        </TeachingSection>
      ) : null}

      {lesson.extras.map((extra) => (
        <TeachingSection title={extra.title} key={extra.title} className="quick-lesson-extra">
          <MarkdownContent markdown={extra.markdown} />
        </TeachingSection>
      ))}

      {lesson.takeaway ? (
        <section className="quick-takeaway">
          <PlaybackBrand variant="bug" className="quick-takeaway-brand" aria-hidden="true" />
          <p>{resource.series || "Quick Lesson"}</p>
          <span>One Thing to Remember</span>
          <MarkdownContent markdown={lesson.takeaway} />
          <small>{learningLabel(resource.category)} · Playback Poker</small>
        </section>
      ) : null}
    </div>
  );
}
