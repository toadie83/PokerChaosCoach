import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  requestAdminContentGaps,
  requestAdminLearningResources,
  requestAdminLearningTaxonomy,
  requestCreateLearningResource,
  requestImportLearningResource,
  requestPreviewLearningImport,
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
import LearningLessonContent from "./learning/LearningLessonContent.jsx";

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

function ImportWorkspace({ onImported }) {
  const [inputMode, setInputMode] = useState("paste");
  const [source, setSource] = useState("");
  const [importRequest, setImportRequest] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

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
      const request = {
        importDocument: {
          mode: "file",
          fileName: file.name,
          mediaType: file.type || "",
          size: file.size,
          content,
        },
      };
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
        : { importDocument: { mode: "paste", content: source } };
      if (!request) throw new Error("Select a JSON file before previewing.");
      const result = await requestPreviewLearningImport(request);
      setImportRequest(request);
      setPreview(result.resource);
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
      setStatus("saved");
      setMessage(`Imported ${result.resource.title} successfully.`);
      onImported(result.resource);
    } catch (error) {
      setStatus("error");
      setMessage(learningImportErrorMessage(error));
    }
  };

  return (
    <section className="learning-import-workspace">
      <header><p className="tools-page-kicker">Structured ingestion</p><h1>Import Daily MTT Edge lesson</h1></header>
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
        </div>
        <div>{preview ? <ResourcePreview resource={preview} /> : <p className="learning-admin-empty">A validated preview will appear here before anything is saved.</p>}</div>
      </div>
    </section>
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

  if (importMode) {
    return (
      <main className="learning-admin-page">
        <div className="learning-admin-subnav">
          {canManage ? <button type="button" onClick={() => navigate("/admin/learning")}>Resource manager</button> : null}
          <button type="button" className="active">JSON import</button>
        </div>
        <ImportWorkspace onImported={() => {}} />
      </main>
    );
  }

  return (
    <main className="learning-admin-page">
      <header className="learning-admin-header">
        <div><p className="tools-page-kicker">Restricted admin</p><h1>Learning resources</h1><p>Manage canonical lessons used by Study Spots and the public library.</p></div>
        <div className="learning-admin-actions"><button type="button" onClick={newResource}>New resource</button><button type="button" onClick={() => navigate("/admin/learning/import")}>Import JSON</button></div>
      </header>
      {message ? <p className={status === "error" ? "learning-admin-error" : "learning-admin-success"}>{message}</p> : null}
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

        <aside className="learning-gap-panel">
          <div className="learning-admin-list-heading"><h2>Content gaps</h2><span>{gaps.length}</span></div>
          {gaps.slice(0, 20).map((gap) => <div className="learning-gap-item" key={`${gap.primaryTag}-${gap.studySpotType}`}><strong>{learningLabel(gap.primaryTag)}</strong><span>{learningLabel(gap.studySpotType)} / {gap.occurrenceCount} occurrences</span></div>)}
          {gaps.length === 0 ? <p>No unmatched Study Spot topics yet.</p> : null}
        </aside>
      </div>
      {previewResource ? <LearningResourcePreviewModal resource={previewResource} onClose={closeResourcePreview} /> : null}
    </main>
  );
}
