import { learningLabel } from "../../lib/learningPresentation.js";

function LessonSection({ title, children, tone = "" }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;

  return (
    <section className={`learning-lesson-section ${tone ? `learning-lesson-section--${tone}` : ""}`}>
      <h2>{title}</h2>
      {Array.isArray(children) ? (
        <ul>{children.map((item) => <li key={item}>{item}</li>)}</ul>
      ) : (
        <p>{children}</p>
      )}
    </section>
  );
}

export default function LearningLessonContent({ resource, showLibraryLink = true, className = "" }) {
  const tags = [resource.primaryTag, ...(resource.secondaryTags || [])].filter(Boolean);

  return (
    <article className={`learning-lesson-content ${className}`.trim()}>
      <header className="learning-lesson-header">
        {showLibraryLink ? <a href="/learn">Learning Library</a> : null}
        <p>{learningLabel(resource.category)} / {learningLabel(resource.resourceType)}</p>
        <h1>{resource.title || "Untitled lesson"}</h1>
        <p className="learning-lesson-summary">{resource.description || "No summary has been added."}</p>
        {tags.length > 0 ? (
          <div className="learning-card-tags">
            {tags.map((tag) => <span key={tag}>{learningLabel(tag)}</span>)}
          </div>
        ) : null}
      </header>

      <div className="learning-lesson-body">
        <LessonSection title="Core lesson">{resource.body || "No lesson body has been added."}</LessonSection>
        <LessonSection title="Example spot">{resource.exampleSpot}</LessonSection>
        <LessonSection title="Common mistake" tone="warning">{resource.mistake}</LessonSection>
        <LessonSection title="Better play" tone="success">{resource.betterPlay}</LessonSection>
        <LessonSection title="When to use it">{resource.whenToUse}</LessonSection>
        <LessonSection title="When not to use it">{resource.whenNotToUse}</LessonSection>
        <LessonSection title="Takeaway" tone="takeaway">{resource.takeaway}</LessonSection>
      </div>
    </article>
  );
}
