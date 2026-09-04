import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  requestAdminContentGaps,
  requestAdminLearningResources,
  requestAdminLearningTaxonomy,
  requestCreateLearningResource,
  requestImportLearningResource,
  requestMarkContentGapBriefCovered,
  requestPreviewLearningImport,
  requestReopenContentGapBrief,
  requestSetLearningResourcePublished,
  requestUpdateLearningResource,
} from "../api/aiService.js";
import {
  emptyLearningResource,
  filterAdminLearningResources,
  learningLabel,
  learningResourceInput,
  toggleWildcardChoice,
} from "../lib/learningPresentation.js";
import {
  learningImportErrorMessage,
  learningImportIdentityFromText,
  validateLearningImportFile,
} from "../lib/learningImportClient.js";
import {
  clearContentGapImportContext,
  readContentGapImportContext,
  setContentGapImportContext,
} from "../lib/contentGapImportContext.js";
import LearningLessonContent from "./learning/LearningLessonContent.jsx";

function conciseDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function copyTextToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copy is unavailable in this browser.");
}

function studySpotBriefText(gap, brief) {
  const cards = brief.handContext?.heroCards?.join(" ") || "Not recorded";
  const board = brief.handContext?.board?.join(" ") || "Not recorded";
  const evidence = Object.entries(brief.handContext?.evidence || {})
    .map(([key, value]) => `${learningLabel(key)}: ${value}`)
    .join("; ") || "Not recorded";
  return [
    "PLAYBACK POKER — STUDY SPOT LESSON BRIEF",
    `Topic: ${learningLabel(gap.primaryTag)}`,
    `Category: ${learningLabel(gap.category)}`,
    `Study Spot type: ${learningLabel(gap.studySpotType)}`,
    `Specific spot: ${brief.title}`,
    `Observed decisions represented: ${brief.occurrenceCount}`,
    `Summary: ${brief.summary}`,
    `Why this is worth studying: ${brief.whyStudyThis}`,
    `Hero hand: ${cards}`,
    `Board: ${board}`,
    `Street: ${learningLabel(brief.handContext?.street) || "Not recorded"}`,
    `Action taken: ${learningLabel(brief.handContext?.actionTaken) || "Not recorded"}`,
    `Stack: ${brief.stackDepthBb ? `${brief.stackDepthBb}bb` : learningLabel(brief.stackDepthTag) || "Not recorded"}`,
    `Positions: ${learningLabel(brief.heroPosition)} vs ${learningLabel(brief.villainPosition)}`,
    `Opponent type: ${learningLabel(brief.opponentType)}`,
    `Tags: ${(brief.tags || []).map(learningLabel).join(", ") || "None"}`,
    `Evidence: ${evidence}`,
    "",
    "Create one focused MTT lesson for this specific Study Spot. Do not assume it also covers other hands grouped under the same content gap.",
  ].join("\n");
}

function arrayFromLines(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function Field({ label, children, wide = false }) {
  return <label className={`learning-admin-field ${wide ? "learning-admin-field--wide" : ""}`}><span>{label}</span>{children}</label>;
}

function ChoiceList({ label, options, value, onChange, wildcard = null }) {
  const selected = new Set(Array.isArray(value) ? value : []);
  return (
    <fieldset className="learning-admin-choices">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={selected.has(option)}
              onChange={() => onChange(
                wildcard
                  ? toggleWildcardChoice(value, option, wildcard)
                  : selected.has(option) ? value.filter((item) => item !== option) : [...value, option],
              )}
            />
            <span>{option === wildcard ? "Any position" : learningLabel(option)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ResourcePreview({ resource }) {
  return <LearningLessonContent resource={resource} showLibraryLink={false} className="learning-admin-preview" />;
}

function LearningResourcePreviewModal({ resource, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose, resource.id]);

  return (
    <div className="modal-backdrop learning-admin-preview-backdrop" onClick={onClose}>
      <section
        className="modal learning-admin-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="learning-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header learning-admin-preview-modal-header">
          <div>
            <p>Lesson preview</p>
            <h2 className="modal-title" id="learning-preview-title">{resource.title}</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="learning-admin-modal-close" onClick={onClose}>Close</button>
        </header>
        <div className="modal-body learning-admin-preview-modal-body">
          <p className="learning-admin-preview-status">Previewing {learningLabel(resource.status)} content</p>
          <LearningLessonContent resource={resource} showLibraryLink={false} />
        </div>
      </section>
    </div>
  );
}

function ImportWorkspace({ onImported, navigate }) {
  const [contentGap, setContentGap] = useState(() => {
    const context = readContentGapImportContext();
    return context?.brief ? { ...context, selectedBriefId: context.brief.id } : context;
  });
  const [inputMode, setInputMode] = useState("paste");
  const [source, setSource] = useState("");
  const [importRequest, setImportRequest] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [importedResource, setImportedResource] = useState(null);
  const selectedBriefId = contentGap?.selectedBriefId || contentGap?.brief?.id || null;
  const selectedBrief = contentGap?.briefs?.find((brief) => brief.id === selectedBriefId)
    || contentGap?.brief
    || null;

  useEffect(() => {
    clearContentGapImportContext();
  }, []);

  const updateContentGap = (gap) => setContentGap(gap
    ? { ...gap, selectedBriefId }
    : null);

  const withContentGap = (request) => contentGap?.id
    ? {
        ...request,
        contentGapId: contentGap.id,
        ...(selectedBriefId ? { contentGapBriefId: selectedBriefId } : {}),
      }
    : request;

  const resetValidation = () => {
    setImportRequest(null);
    setPreview(null);
    setWarnings([]);
    setStatus("idle");
    setMessage("");
  };

  const selectMode = (mode) => {
    setInputMode(mode);
    setSelectedFile(null);
    resetValidation();
  };

  const selectFile = async (event) => {
    const file = event.target.files?.[0] || null;
    resetValidation();
    setSelectedFile(null);
    if (!file) return;
    try {
      validateLearningImportFile(file);
      const content = await file.text();
      const identity = learningImportIdentityFromText(content);
      const request = withContentGap({
        importDocument: {
          mode: "file",
          fileName: file.name,
          mediaType: file.type || "",
          size: file.size,
          content,
        },
      });
      setSelectedFile({ name: file.name, identity });
      setImportRequest(request);
      setMessage("JSON file selected. Preview and validate before saving.");
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "The selected file is invalid.");
    }
  };

  const previewImport = async () => {
    setMessage("");
    setStatus("working");
    try {
      const request = inputMode === "file"
        ? importRequest
        : withContentGap({ importDocument: { mode: "paste", content: source } });
      if (!request) throw new Error("Select a JSON file before previewing.");
      const result = await requestPreviewLearningImport(request);
      setImportRequest(request);
      setPreview(result.resource);
      if (result.contentGap) updateContentGap(result.contentGap);
      setWarnings(result.warnings || []);
      setStatus("ready");
      setMessage("Validation successful. Ready to save.");
    } catch (error) {
      setPreview(null);
      setWarnings([]);
      if (inputMode !== "file") setImportRequest(null);
      setStatus("error");
      setMessage(learningImportErrorMessage(error));
    }
  };

  const saveImport = async () => {
    if (!importRequest || !preview) return;
    setStatus("working");
    setMessage("");
    try {
      const result = await requestImportLearningResource(importRequest);
      setImportedResource(result.resource);
      if (result.contentGap) updateContentGap(result.contentGap);
      setStatus("saved");
      setMessage(`Imported ${result.resource.title} successfully.`);
      onImported(result.resource);
    } catch (error) {
      setStatus("error");
      setMessage(learningImportErrorMessage(error));
    }
  };

  const detachContentGap = () => {
    setContentGap(null);
    setImportRequest((current) => current?.importDocument
      ? { importDocument: current.importDocument }
      : current);
    setContentGapImportContext(null);
  };

  return (
    <section className="learning-import-workspace">
      <header>
        <p className="tools-page-kicker">Structured ingestion</p>
        <h1>{contentGap ? "Import lesson for Study Spot" : "Import Daily MTT Edge lesson"}</h1>
      </header>
      {contentGap ? (
        <div className="learning-import-gap-context">
          <div>
            <span className={`learning-gap-status learning-gap-status--${selectedBrief?.status || contentGap.status}`}>{learningLabel(selectedBrief?.status || contentGap.status)}</span>
            <p>Creating a lesson for this Study Spot</p>
            <h2>{selectedBrief?.title || learningLabel(contentGap.primaryTag)}</h2>
            <span>{learningLabel(contentGap.primaryTag)} · {learningLabel(contentGap.category)} · {learningLabel(selectedBrief?.heroPosition)} vs {learningLabel(selectedBrief?.villainPosition)}</span>
            <small>Saving links the lesson to this exact brief. You can publish it and close the brief here after import.</small>
          </div>
          <button type="button" onClick={detachContentGap}>Detach Study Spot</button>
        </div>
      ) : null}
      <div className="learning-import-grid">
        <div>
          <div className="learning-import-modes" role="group" aria-label="Import input method">
            <button type="button" aria-pressed={inputMode === "paste"} className={inputMode === "paste" ? "active" : ""} onClick={() => selectMode("paste")}>Paste JSON or Markdown</button>
            <button type="button" aria-pressed={inputMode === "file"} className={inputMode === "file" ? "active" : ""} onClick={() => selectMode("file")}>Upload JSON file</button>
          </div>
          {inputMode === "paste" ? (
            <Field label="Lesson JSON or Markdown" wide>
              <textarea
                rows="24"
                value={source}
                onChange={(event) => { setSource(event.target.value); resetValidation(); }}
                spellCheck="false"
                placeholder={'{\n  "schema_version": 2,\n  "external_id": "daily-mtt-edge-005"\n}'}
              />
            </Field>
          ) : (
            <div className="learning-import-file-panel">
              <Field label="Upload JSON file" wide>
                <input type="file" accept=".json,application/json" onChange={selectFile} aria-label="Upload JSON file" />
              </Field>
              {selectedFile ? (
                <dl className="learning-import-identity" aria-label="Selected lesson identity">
                  <div><dt>Selected</dt><dd>{selectedFile.name}</dd></div>
                  <div><dt>Lesson</dt><dd>{selectedFile.identity.lessonNumber ? `#${selectedFile.identity.lessonNumber} - ` : ""}{selectedFile.identity.title || "Untitled lesson"}</dd></div>
                  <div><dt>External ID</dt><dd>{selectedFile.identity.externalId || "Not provided"}</dd></div>
                  <div><dt>Category</dt><dd>{learningLabel(selectedFile.identity.category) || "Not provided"}</dd></div>
                </dl>
              ) : <p className="learning-admin-empty">Choose one JSON file up to 512 KB.</p>}
            </div>
          )}
          {message ? <p role={status === "error" ? "alert" : "status"} className={status === "error" ? "learning-admin-error" : "learning-admin-success"}>{message}</p> : null}
          {warnings.length > 0 ? (
            <div className="learning-admin-warning" role="status">
              <strong>Import notes</strong>
              <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          ) : null}
          <div className="learning-admin-actions">
            <button type="button" onClick={previewImport} disabled={status === "working" || (inputMode === "file" && !importRequest)}>Preview and validate</button>
            <button type="button" onClick={saveImport} disabled={!preview || status === "working"}>Save import</button>
          </div>
          {contentGap && importedResource ? (
            <div className="learning-import-completion">
              <strong>{importedResource.title} is linked to this Study Spot.</strong>
              <p>Return to Content Gaps to review the lesson and manually mark the Study Spot as covered. Publication and Instagram remain separate editorial actions.</p>
              <button type="button" className="learning-import-return" onClick={() => navigate("/admin/learning")}>Return to content gaps</button>
            </div>
          ) : null}
        </div>
        <div>{preview ? <ResourcePreview resource={preview} /> : <p className="learning-admin-empty">A validated preview will appear here before anything is saved.</p>}</div>
      </div>
    </section>
  );
}

function ContentGapPanel({ gaps, onImport, onCover, onReopenBrief, onEditResource }) {
  const [filter, setFilter] = useState("active");
  const [expandedId, setExpandedId] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const counts = {
    open: gaps.filter((gap) => gap.status === "open").length,
    in_progress: gaps.filter((gap) => gap.status === "in_progress").length,
    complete: gaps.filter((gap) => gap.status === "complete").length,
  };
  const visible = gaps.filter((gap) => filter === "all"
    || (filter === "active" && gap.status !== "complete")
    || gap.status === filter);

  const copyBrief = async (gap, brief) => {
    try {
      await copyTextToClipboard(studySpotBriefText(gap, brief));
      setCopiedId(brief.id);
    } catch {
      setCopiedId("");
    }
  };

  return (
    <section className="learning-gap-panel" aria-label="Content gap briefs">
      <div className="learning-gap-filters" role="group" aria-label="Filter content gaps">
        {[
          ["active", `Active ${counts.open + counts.in_progress}`],
          ["complete", `Complete ${counts.complete}`],
          ["all", `All ${gaps.length}`],
        ].map(([value, label]) => (
          <button type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{label}</button>
        ))}
      </div>
      <div className="learning-gap-results">
        {visible.map((gap) => {
          const expanded = expandedId === gap.id;
          const briefs = gap.briefs || gap.examples || [];
          const coveredCount = briefs.filter((brief) => brief.status === "covered").length;
          return (
            <article className={`learning-gap-card learning-gap-card--${gap.status}`} key={gap.id}>
              <button type="button" className="learning-gap-card-summary" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? "" : gap.id)}>
                <span className={`learning-gap-status learning-gap-status--${gap.status}`}>{learningLabel(gap.status)}</span>
                <strong>{learningLabel(gap.primaryTag)}</strong>
                <span>{learningLabel(gap.category)} · {learningLabel(gap.studySpotType)}</span>
                <span><b>{gap.decisionCount}</b> decisions · <b>{coveredCount}/{briefs.length}</b> Study Spots covered</span>
              </button>
              {expanded ? (
                <div className="learning-gap-detail">
                  <dl className="learning-gap-metrics">
                    <div><dt>First seen</dt><dd>{conciseDate(gap.firstSeen)}</dd></div>
                    <div><dt>Latest</dt><dd>{conciseDate(gap.lastSeen)}</dd></div>
                  </dl>
                  {[gap.stackDepthTags, gap.heroPositions, gap.villainPositions, gap.secondaryTags].some((items) => items?.length) ? (
                    <div className="learning-gap-tags">
                      {[
                        ...(gap.stackDepthTags || []),
                        ...(gap.heroPositions || []),
                        ...(gap.villainPositions || []),
                        ...(gap.secondaryTags || []),
                      ].map((tag, index) => <span key={`${tag}-${index}`}>{learningLabel(tag)}</span>)}
                    </div>
                  ) : null}
                  <div className="learning-gap-briefs">
                    <div className="learning-gap-briefs-heading">
                      <h3>Study Spot briefs</h3>
                      <span>Each spot can produce a different lesson.</span>
                    </div>
                    {briefs.map((brief) => {
                      const linkedLesson = (gap.linkedResources || []).find(
                        (resource) => resource.id === brief.linkedResource?.id,
                      ) || brief.linkedResource;
                      return (
                        <section className={`learning-gap-brief learning-gap-brief--${brief.status}`} key={brief.id}>
                          <header>
                            <span className={`learning-gap-status learning-gap-status--${brief.status}`}>{learningLabel(brief.status)}</span>
                            <strong>{brief.title}</strong>
                            <small>{brief.occurrenceCount} decision{brief.occurrenceCount === 1 ? "" : "s"} represented</small>
                          </header>
                          <div className="learning-gap-brief-body">
                            <p>{brief.summary}</p>
                            <p>{brief.whyStudyThis}</p>
                            {(brief.handContext?.heroCards?.length || brief.handContext?.board?.length) ? (
                              <code>
                                {brief.handContext.heroCards?.length ? `Hero ${brief.handContext.heroCards.join(" ")}` : ""}
                                {brief.handContext.board?.length ? ` · Board ${brief.handContext.board.join(" ")}` : ""}
                              </code>
                            ) : null}
                            <span>{brief.stackDepthBb ? `${brief.stackDepthBb}bb · ` : ""}{learningLabel(brief.heroPosition)} vs {learningLabel(brief.villainPosition)} · {learningLabel(brief.handContext?.street)}</span>
                          </div>
                          {linkedLesson ? (
                            <div className="learning-gap-brief-lesson">
                              <span><b>Linked lesson</b><strong>{linkedLesson.title}</strong><small>{learningLabel(linkedLesson.status)} · {linkedLesson.instagramUrl ? "Instagram published" : "Instagram pending"}</small></span>
                              <button type="button" onClick={() => onEditResource(linkedLesson)}>Edit lesson</button>
                            </div>
                          ) : null}
                          <footer>
                            <button type="button" onClick={() => copyBrief(gap, brief)}>{copiedId === brief.id ? "Text copied" : "Copy text"}</button>
                            {brief.status !== "covered" ? <button type="button" onClick={() => onImport(gap, brief)}>Create lesson via JSON</button> : null}
                            {brief.status === "covered" ? (
                              <button type="button" className="learning-gap-cover-action learning-gap-cover-action--secondary" onClick={() => onReopenBrief(gap.id, brief.id)}>Reopen</button>
                            ) : (
                              <button type="button" className="learning-gap-cover-action" onClick={() => onCover(gap.id, brief.id)}>Mark as covered</button>
                            )}
                          </footer>
                          {brief.status !== "covered" ? (
                            <p className="learning-gap-brief-note">Coverage is a manual editorial decision{linkedLesson ? `; the linked lesson is currently ${learningLabel(linkedLesson.status)}.` : ". No lesson is linked yet."}</p>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
        {visible.length === 0 ? <p className="learning-admin-empty">No content gaps match this view.</p> : null}
      </div>
    </section>
  );
}

function ContentGapWorkspaceModal({ gaps, onClose, onImport, onCover, onReopenBrief, onEditResource }) {
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const activeCount = gaps.filter((gap) => gap.status !== "complete").length;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(modalRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) || []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop learning-gap-modal-backdrop" onClick={onClose}>
      <section
        ref={modalRef}
        className="modal learning-gap-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-gap-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header learning-gap-modal-header">
          <div>
            <p>Editorial queue <span aria-hidden="true">&middot;</span> {activeCount} active</p>
            <h2 className="modal-title" id="content-gap-modal-title">Content gaps</h2>
            <span>Open a gap to work through each Study Spot as its own lesson brief.</span>
          </div>
          <button ref={closeButtonRef} type="button" className="learning-admin-modal-close" onClick={onClose}>Close</button>
        </header>
        <div className="modal-body learning-gap-modal-body">
          <ContentGapPanel
            gaps={gaps}
            onImport={onImport}
            onCover={onCover}
            onReopenBrief={onReopenBrief}
            onEditResource={onEditResource}
          />
        </div>
      </section>
    </div>
  );
}

export default function AdminLearningPage({ entitlements, routePath, navigate }) {
  const importMode = routePath === "/admin/learning/import";
  const canManage = entitlements?.features?.admin === true || entitlements?.features?.learningManager === true;
  const [resources, setResources] = useState([]);
  const [taxonomy, setTaxonomy] = useState(null);
  const [gaps, setGaps] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(emptyLearningResource());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResource, setPreviewResource] = useState(null);
  const [contentGapsOpen, setContentGapsOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("all");
  const [libraryStatus, setLibraryStatus] = useState("all");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [resourcePayload, taxonomyPayload, gapPayload] = await Promise.all([
        requestAdminLearningResources(),
        requestAdminLearningTaxonomy(),
        requestAdminContentGaps(),
      ]);
      setResources(resourcePayload.resources || []);
      setTaxonomy(taxonomyPayload);
      setGaps(gapPayload.gaps || []);
      setStatus("ready");
    } catch (error) {
      setMessage(error?.message || "Admin Learning Library could not be loaded.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!importMode) load();
  }, [importMode, load]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const categoryTags = taxonomy?.categories?.[form.category] || [];
  const allTags = useMemo(
    () => Array.from(new Set(Object.values(taxonomy?.categories || {}).flat())),
    [taxonomy],
  );
  const libraryCategories = useMemo(
    () => Array.from(new Set(resources.map((resource) => resource.category).filter(Boolean))).sort(),
    [resources],
  );
  const visibleResources = useMemo(
    () => filterAdminLearningResources(resources, {
      query: libraryQuery,
      category: libraryCategory,
      status: libraryStatus,
    }),
    [libraryCategory, libraryQuery, libraryStatus, resources],
  );
  const closeResourcePreview = useCallback(() => setPreviewResource(null), []);
  const closeContentGaps = useCallback(() => setContentGapsOpen(false), []);
  const activeGapCount = gaps.filter((gap) => gap.status !== "complete").length;

  const selectResource = (resource) => {
    setSelectedId(resource.id);
    setForm(learningResourceInput(resource));
    setMessage("");
    setPreviewOpen(false);
  };

  const newResource = () => {
    setSelectedId("");
    setForm(emptyLearningResource());
    setMessage("");
  };

  const save = async () => {
    setStatus("saving");
    setMessage("");
    try {
      const payload = learningResourceInput(form);
      const result = selectedId
        ? await requestUpdateLearningResource(selectedId, payload)
        : await requestCreateLearningResource(payload);
      await load();
      selectResource(result.resource);
      setMessage("Learning resource saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "Learning resource could not be saved.");
    }
  };

  const changePublication = async (resource) => {
    setMessage("");
    try {
      await requestSetLearningResourcePublished(resource.id, resource.status !== "published");
      await load();
    } catch (error) {
      setMessage(error?.message || "Publication status could not be changed.");
    }
  };

  const openGenericImport = () => {
    setContentGapImportContext(null);
    navigate("/admin/learning/import");
  };

  const openGapImport = (gap, brief) => {
    setContentGapImportContext(gap, brief);
    navigate("/admin/learning/import");
  };

  const coverBrief = async (gapId, briefId) => {
    setMessage("");
    try {
      await requestMarkContentGapBriefCovered(gapId, briefId);
      await load();
      setMessage("Study Spot marked as covered.");
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "The Study Spot could not be marked as covered.");
    }
  };

  const reopenBrief = async (gapId, briefId) => {
    setMessage("");
    try {
      await requestReopenContentGapBrief(gapId, briefId);
      await load();
      setMessage("Study Spot reopened.");
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "The Study Spot could not be reopened.");
    }
  };

  if (importMode) {
    return (
      <main className="learning-admin-page">
        <div className="learning-admin-subnav">
          {canManage ? <button type="button" onClick={() => navigate("/admin/learning")}>Resource manager</button> : null}
          <button type="button" className="active">JSON import</button>
        </div>
        <ImportWorkspace onImported={() => {}} navigate={navigate} />
      </main>
    );
  }

  return (
    <main className="learning-admin-page">
      <header className="learning-admin-header">
        <div><p className="tools-page-kicker">Restricted admin</p><h1>Learning resources</h1><p>Manage canonical lessons used by Study Spots and the public library.</p></div>
        <div className="learning-admin-actions"><button type="button" onClick={newResource}>New resource</button><button type="button" onClick={openGenericImport}>Import JSON</button></div>
      </header>
      {message ? <p className={status === "error" ? "learning-admin-error" : "learning-admin-success"}>{message}</p> : null}
      <section className="learning-gap-launcher" aria-labelledby="content-gap-launcher-title">
        <div>
          <p className="tools-page-kicker">Editorial queue</p>
          <h2 id="content-gap-launcher-title">Content gaps</h2>
          <span>Review Study Spot briefs without crowding the resource manager.</span>
        </div>
        <div className="learning-gap-launcher-actions">
          <span className="learning-gap-active-count"><strong>{activeGapCount}</strong> active</span>
          <button type="button" onClick={() => setContentGapsOpen(true)}>Open content gaps</button>
        </div>
      </section>
      <div className="learning-admin-layout">
        <aside className="learning-admin-list">
          <div className="learning-admin-list-heading"><h2>Library</h2><span aria-live="polite">{visibleResources.length} / {resources.length}</span></div>
          <div className="learning-admin-list-tools">
            <label>
              <span>Search lessons</span>
              <input
                type="search"
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="Title, slug or external ID"
              />
            </label>
            <div>
              <label>
                <span>Category</span>
                <select value={libraryCategory} onChange={(event) => setLibraryCategory(event.target.value)}>
                  <option value="all">All categories</option>
                  {libraryCategories.map((category) => <option value={category} key={category}>{learningLabel(category)}</option>)}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select value={libraryStatus} onChange={(event) => setLibraryStatus(event.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </label>
            </div>
          </div>
          <div className="learning-admin-list-results">
            {visibleResources.map((resource) => (
              <div className={`learning-admin-list-item ${selectedId === resource.id ? "active" : ""}`} key={resource.id}>
                <button type="button" onClick={() => selectResource(resource)}><strong>{resource.title}</strong><span>{learningLabel(resource.category)} / {resource.status}</span></button>
                <div className="learning-admin-list-actions">
                  <button type="button" className="learning-admin-preview-button" onClick={() => setPreviewResource(resource)}>Preview</button>
                  <button type="button" className="learning-admin-publish" onClick={() => changePublication(resource)}>{resource.status === "published" ? "Unpublish" : "Publish"}</button>
                </div>
              </div>
            ))}
            {status !== "loading" && visibleResources.length === 0 ? <p className="learning-admin-empty">No lessons match these filters.</p> : null}
          </div>
        </aside>

        <section className="learning-admin-editor">
          <div className="learning-admin-editor-heading"><h2>{selectedId ? "Edit resource" : "Create resource"}</h2><button type="button" onClick={() => setPreviewOpen((value) => !value)}>{previewOpen ? "Edit" : "Preview"}</button></div>
          {previewOpen ? <ResourcePreview resource={form} /> : (
            <div className="learning-admin-form">
              <Field label="Title" wide><input value={form.title} onChange={(event) => update("title", event.target.value)} /></Field>
              <Field label="Short title"><input value={form.shortTitle} onChange={(event) => update("shortTitle", event.target.value)} /></Field>
              <Field label="Slug"><input value={form.slug} onChange={(event) => update("slug", event.target.value)} /></Field>
              <Field label="External ID"><input value={form.externalId || ""} onChange={(event) => update("externalId", event.target.value || null)} /></Field>
              <Field label="Series"><input value={form.series || ""} onChange={(event) => update("series", event.target.value || null)} /></Field>
              <Field label="Lesson number"><input type="number" min="1" value={form.lessonNumber || ""} onChange={(event) => update("lessonNumber", event.target.value ? Number(event.target.value) : null)} /></Field>
              <Field label="Resource type"><select value={form.resourceType} onChange={(event) => update("resourceType", event.target.value)}>{(taxonomy?.resourceTypes || []).map((item) => <option value={item} key={item}>{learningLabel(item)}</option>)}</select></Field>
              <Field label="Category"><select value={form.category} onChange={(event) => { const next = event.target.value; const tags = taxonomy?.categories?.[next] || []; setForm((current) => ({ ...current, category: next, primaryTag: tags.includes(current.primaryTag) ? current.primaryTag : tags[0] || "" })); }}>{Object.keys(taxonomy?.categories || {}).map((item) => <option value={item} key={item}>{learningLabel(item)}</option>)}</select></Field>
              <Field label="Primary tag"><select value={form.primaryTag} onChange={(event) => update("primaryTag", event.target.value)}>{categoryTags.map((item) => <option value={item} key={item}>{learningLabel(item)}</option>)}</select></Field>
              <Field label="Priority"><input type="number" min="0" max="100" value={form.priority} onChange={(event) => update("priority", Number(event.target.value))} /></Field>
              <Field label="Summary" wide><textarea rows="3" value={form.description} onChange={(event) => update("description", event.target.value)} /></Field>
              <Field label="Core lesson" wide><textarea rows="8" value={form.body} onChange={(event) => update("body", event.target.value)} /></Field>
              <Field label="Example spot" wide><textarea rows="4" value={form.exampleSpot} onChange={(event) => update("exampleSpot", event.target.value)} /></Field>
              <Field label="Common mistake" wide><textarea rows="3" value={form.mistake} onChange={(event) => update("mistake", event.target.value)} /></Field>
              <Field label="Better play" wide><textarea rows="3" value={form.betterPlay} onChange={(event) => update("betterPlay", event.target.value)} /></Field>
              <Field label="When to use (one per line)"><textarea rows="4" value={form.whenToUse.join("\n")} onChange={(event) => update("whenToUse", arrayFromLines(event.target.value))} /></Field>
              <Field label="When not to use (one per line)"><textarea rows="4" value={form.whenNotToUse.join("\n")} onChange={(event) => update("whenNotToUse", arrayFromLines(event.target.value))} /></Field>
              <Field label="Takeaway" wide><textarea rows="3" value={form.takeaway} onChange={(event) => update("takeaway", event.target.value)} /></Field>
              <Field label="Source URL"><input type="url" value={form.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} /></Field>
              <Field label="Instagram URL"><input type="url" value={form.instagramUrl} onChange={(event) => update("instagramUrl", event.target.value)} /></Field>
              <Field label="Instagram caption" wide><textarea rows="4" value={form.instagramCaption} onChange={(event) => update("instagramCaption", event.target.value)} /></Field>
              <ChoiceList label="Secondary tags" options={allTags.filter((tag) => tag !== form.primaryTag)} value={form.secondaryTags} onChange={(value) => update("secondaryTags", value)} />
              <ChoiceList label="Stack depth" options={taxonomy?.stackDepthTags || []} value={form.stackDepthTags} onChange={(value) => update("stackDepthTags", value)} />
              <ChoiceList label="Hero positions" options={taxonomy?.positionTags || []} value={form.heroPositionTags} onChange={(value) => update("heroPositionTags", value)} wildcard="any" />
              <ChoiceList label="Villain positions" options={taxonomy?.positionTags || []} value={form.villainPositionTags} onChange={(value) => update("villainPositionTags", value)} wildcard="any" />
              <ChoiceList label="Opponent types" options={taxonomy?.opponentTypes || []} value={form.opponentTypeTags} onChange={(value) => update("opponentTypeTags", value)} />
              <ChoiceList label="Study Spot types" options={taxonomy?.types || []} value={form.studySpotTypes} onChange={(value) => update("studySpotTypes", value)} />
            </div>
          )}
          <div className="learning-admin-actions learning-admin-actions--sticky"><button type="button" onClick={save} disabled={status === "saving"}>{status === "saving" ? "Saving..." : "Save resource"}</button></div>
        </section>
      </div>
      {contentGapsOpen ? (
        <ContentGapWorkspaceModal
          gaps={gaps}
          onClose={closeContentGaps}
          onImport={(gap, brief) => {
            closeContentGaps();
            openGapImport(gap, brief);
          }}
          onCover={coverBrief}
          onReopenBrief={reopenBrief}
          onEditResource={(resource) => {
            closeContentGaps();
            selectResource(resource);
          }}
        />
      ) : null}
      {previewResource ? <LearningResourcePreviewModal resource={previewResource} onClose={closeResourcePreview} /> : null}
    </main>
  );
}
