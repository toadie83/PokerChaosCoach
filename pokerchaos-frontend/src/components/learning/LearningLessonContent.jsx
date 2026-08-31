import {
  isQuickLearningResource,
  learningLabel,
} from "../../lib/learningPresentation.js";
import PlaybackBrand from "../PlaybackBrand.jsx";
import MarkdownContent from "./MarkdownContent.jsx";
import QuickLessonBody from "./QuickLessonBody.jsx";

function LessonSection({ title, children, tone = "" }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;

  return (
    <section className={`learning-lesson-section ${tone ? `learning-lesson-section--${tone}` : ""}`}>
      <h2>{title}</h2>
      {Array.isArray(children) ? (
        <ul>{children.map((item) => <li key={item}>{item}</li>)}</ul>
      ) : (
        <MarkdownContent markdown={children} />
      )}
    </section>
  );
}

export default function LearningLessonContent({ resource, showLibraryLink = true, className = "" }) {
  const tags = [resource.primaryTag, ...(resource.secondaryTags || [])].filter(Boolean);
  const isQuickLesson = isQuickLearningResource(resource);
  const lessonIdentity = resource.series && resource.lessonNumber
    ? `${resource.series} / #${String(resource.lessonNumber).padStart(3, "0")}`
    : resource.series || "Quick Lesson";

  return (
    <article className={`learning-lesson-content ${isQuickLesson ? "learning-lesson-content--quick" : "learning-lesson-content--article"} ${className}`.trim()}>
      <header className="learning-lesson-header">
        {isQuickLesson ? (
          <PlaybackBrand variant="compact" className="learning-lesson-brand" alt="Playback Poker" />
        ) : null}
        {showLibraryLink ? <a href="/learn">Learning Library</a> : null}
        {isQuickLesson ? <p className="learning-lesson-series">{lessonIdentity}</p> : null}
        <p className="learning-lesson-meta">{learningLabel(resource.category)} / {learningLabel(resource.resourceType)}</p>
        <h1>{resource.title || "Untitled lesson"}</h1>
        <p className="learning-lesson-summary">{resource.description || "No summary has been added."}</p>
        {tags.length > 0 ? (
          <div className="learning-card-tags">
            {tags.map((tag) => <span key={tag}>{learningLabel(tag)}</span>)}
          </div>
        ) : null}
      </header>

      {isQuickLesson ? (
        <QuickLessonBody resource={resource} />
      ) : (
        <div className="learning-lesson-body learning-article-body">
          <LessonSection title="Study article">{resource.body || "No article body has been added."}</LessonSection>
          <LessonSection title="Example spot">{resource.exampleSpot}</LessonSection>
          <LessonSection title="Key takeaway" tone="takeaway">{resource.takeaway}</LessonSection>
        </div>
      )}
    </article>
  );
}
