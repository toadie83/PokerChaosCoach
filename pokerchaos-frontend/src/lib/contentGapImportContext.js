export const CONTENT_GAP_IMPORT_SESSION_KEY = "playback-learning-content-gap-import";

function browserSessionStorage(storage) {
  return storage || globalThis.window?.sessionStorage || null;
}

export function readContentGapImportContext(storage = null) {
  try {
    const stored = browserSessionStorage(storage)?.getItem(CONTENT_GAP_IMPORT_SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function clearContentGapImportContext(storage = null) {
  try {
    browserSessionStorage(storage)?.removeItem(CONTENT_GAP_IMPORT_SESSION_KEY);
  } catch {
    // The importer remains available when browser storage is unavailable.
  }
}

export function setContentGapImportContext(gap, brief = null, storage = null) {
  try {
    const sessionStorage = browserSessionStorage(storage);
    if (!gap) {
      sessionStorage?.removeItem(CONTENT_GAP_IMPORT_SESSION_KEY);
      return;
    }
    sessionStorage?.setItem(CONTENT_GAP_IMPORT_SESSION_KEY, JSON.stringify({
      id: gap.id,
      status: gap.status,
      category: gap.category,
      primaryTag: gap.primaryTag,
      studySpotType: gap.studySpotType,
      studySpotCount: gap.studySpotCount,
      decisionCount: gap.decisionCount,
      brief: brief ? {
        id: brief.id,
        status: brief.status,
        title: brief.title,
        summary: brief.summary,
        whyStudyThis: brief.whyStudyThis,
        occurrenceCount: brief.occurrenceCount,
        stackDepthBb: brief.stackDepthBb,
        stackDepthTag: brief.stackDepthTag,
        heroPosition: brief.heroPosition,
        villainPosition: brief.villainPosition,
        opponentType: brief.opponentType,
        tags: brief.tags,
        handContext: brief.handContext,
      } : null,
    }));
  } catch {
    // Importing still works without the optional cross-page context.
  }
}
