import { useCallback, useEffect, useMemo, useState } from "react";

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
  learningLabel,
  learningResourceInput,
} from "../lib/learningPresentation.js";

function arrayFromLines(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function Field({ label, children, wide = false }) {
  return <label className={`learning-admin-field ${wide ? "learning-admin-field--wide" : ""}`}><span>{label}</span>{children}</label>;
}

function ChoiceList({ label, options, value, onChange }) {
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
              onChange={() => onChange(selected.has(option) ? value.filter((item) => item !== option) : [...value, option])}
            />
            <span>{learningLabel(option)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ResourcePreview({ resource }) {
  return (
    <article className="learning-admin-preview">
      <p>{learningLabel(resource.category)} / {learningLabel(resource.resourceType)}</p>
      <h2>{resource.title || "Untitled lesson"}</h2>
      <p>{resource.description || "Add a short summary."}</p>
      <section><h3>Core lesson</h3><p>{resource.body || "No lesson body yet."}</p></section>
      {resource.exampleSpot ? <section><h3>Example spot</h3><p>{resource.exampleSpot}</p></section> : null}
      {resource.mistake ? <section><h3>Common mistake</h3><p>{resource.mistake}</p></section> : null}
      {resource.betterPlay ? <section><h3>Better play</h3><p>{resource.betterPlay}</p></section> : null}
      {resource.takeaway ? <section><h3>Takeaway</h3><p>{resource.takeaway}</p></section> : null}
    </article>
  );
}

function ImportWorkspace({ onImported }) {
  const [source, setSource] = useState("");
  const [parsedInput, setParsedInput] = useState(null);
  const [preview, setPreview] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const previewImport = async () => {
    setMessage("");
    setStatus("working");
    try {
      const input = JSON.parse(source);
      const resource = input?.resource || input;
      const result = await requestPreviewLearningImport(resource);
      setParsedInput(resource);
      setPreview(result.resource);
      setWarnings(result.warnings || []);
      setStatus("ready");
    } catch (error) {
      setPreview(null);
      setWarnings([]);
      setParsedInput(null);
      setStatus("error");
      setMessage(error?.message || "Import JSON is invalid.");
    }
  };

  const saveImport = async () => {
    if (!parsedInput) return;
    setStatus("working");
    setMessage("");
    try {
      const result = await requestImportLearningResource(parsedInput);
      setStatus("saved");
      setMessage(`Imported ${result.resource.title}.`);
      onImported(result.resource);
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "The lesson could not be imported.");
    }
  };

  return (
    <section className="learning-import-workspace">
      <header><p className="tools-page-kicker">Structured ingestion</p><h1>Import Daily MTT Edge lesson</h1></header>
      <div className="learning-import-grid">
        <div>
          <Field label="Lesson JSON" wide>
            <textarea rows="24" value={source} onChange={(event) => setSource(event.target.value)} spellCheck="false" placeholder={'{\n  "externalId": "daily-mtt-edge-001",\n  "resourceType": "quick_lesson"\n}'} />
          </Field>
          {message ? <p className={status === "error" ? "learning-admin-error" : "learning-admin-success"}>{message}</p> : null}
          {warnings.length > 0 ? (
            <div className="learning-admin-warning" role="status">
              <strong>Import notes</strong>
              <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          ) : null}
          <div className="learning-admin-actions">
            <button type="button" onClick={previewImport} disabled={status === "working"}>Preview and validate</button>
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
          <div className="learning-admin-list-heading"><h2>Library</h2><span>{resources.length}</span></div>
          {resources.map((resource) => (
            <div className={`learning-admin-list-item ${selectedId === resource.id ? "active" : ""}`} key={resource.id}>
              <button type="button" onClick={() => selectResource(resource)}><strong>{resource.title}</strong><span>{learningLabel(resource.category)} / {resource.status}</span></button>
              <button type="button" className="learning-admin-publish" onClick={() => changePublication(resource)}>{resource.status === "published" ? "Unpublish" : "Publish"}</button>
            </div>
          ))}
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
              <ChoiceList label="Hero positions" options={taxonomy?.positionTags || []} value={form.heroPositionTags} onChange={(value) => update("heroPositionTags", value)} />
              <ChoiceList label="Villain positions" options={taxonomy?.positionTags || []} value={form.villainPositionTags} onChange={(value) => update("villainPositionTags", value)} />
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
    </main>
  );
}
