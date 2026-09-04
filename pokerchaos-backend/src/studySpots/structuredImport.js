export const MAX_LEARNING_IMPORT_FILE_BYTES = 512 * 1024;

export class LearningResourceImportDocumentError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "LearningResourceImportDocumentError";
    this.code = code;
    this.status = 400;
  }
}

export function parseLearningResourceDocument(text, extension = ".json") {
  const source = String(text || "").trim();
  if (!source) {
    throw new LearningResourceImportDocumentError(
      "The import document is empty.",
      "LEARNING_IMPORT_EMPTY",
    );
  }
  const normalizedExtension = String(extension || "").toLowerCase();
  let jsonText = source;
  if (normalizedExtension === ".md" || normalizedExtension === ".markdown") {
    const match = source.match(/```json\s*([\s\S]*?)```/i);
    if (!match) {
      throw new LearningResourceImportDocumentError(
        "Markdown imports require a fenced json code block.",
        "LEARNING_IMPORT_MARKDOWN_INVALID",
      );
    }
    jsonText = match[1].trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new LearningResourceImportDocumentError(
      `Structured lesson JSON is invalid: ${error.message}`,
      "LEARNING_IMPORT_JSON_INVALID",
    );
  }
  const resource = parsed?.resource || parsed;
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
    throw new LearningResourceImportDocumentError(
      "The import must contain one learning resource object.",
      "LEARNING_IMPORT_RESOURCE_INVALID",
    );
  }
  return resource;
}

function validateDocumentEnvelope(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new LearningResourceImportDocumentError(
      "Import document metadata is missing.",
      "LEARNING_IMPORT_DOCUMENT_INVALID",
    );
  }
  const allowedKeys = new Set(["mode", "fileName", "mediaType", "size", "content"]);
  const unknownKeys = Object.keys(document).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new LearningResourceImportDocumentError(
      `Import document contains unsupported metadata: ${unknownKeys.join(", ")}.`,
      "LEARNING_IMPORT_DOCUMENT_INVALID",
    );
  }
}

export function resolveLearningResourceImportRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !("importDocument" in input)) {
    return input;
  }
  if (Object.keys(input).some((key) => ![
    "importDocument",
    "contentGapId",
    "contentGapBriefId",
  ].includes(key))) {
    throw new LearningResourceImportDocumentError(
      "Import document requests cannot include additional top-level fields.",
      "LEARNING_IMPORT_DOCUMENT_INVALID",
    );
  }

  const document = input.importDocument;
  validateDocumentEnvelope(document);
  const mode = String(document.mode || "").trim().toLowerCase();
  const content = typeof document.content === "string" ? document.content : "";
  const actualSize = Buffer.byteLength(content, "utf8");
  if (actualSize === 0) {
    throw new LearningResourceImportDocumentError(
      "The import document is empty.",
      "LEARNING_IMPORT_EMPTY",
    );
  }
  if (actualSize > MAX_LEARNING_IMPORT_FILE_BYTES) {
    throw new LearningResourceImportDocumentError(
      `The import document exceeds the ${MAX_LEARNING_IMPORT_FILE_BYTES / 1024} KB limit.`,
      "LEARNING_IMPORT_FILE_TOO_LARGE",
    );
  }

  if (mode === "file") {
    const fileName = String(document.fileName || "").trim();
    const mediaType = String(document.mediaType || "").trim().toLowerCase();
    const declaredSize = Number(document.size);
    if (!/\.json$/i.test(fileName) || (mediaType && !["application/json", "text/json"].includes(mediaType))) {
      throw new LearningResourceImportDocumentError(
        "Upload JSON file accepts one .json file only.",
        "LEARNING_IMPORT_FILE_TYPE_INVALID",
      );
    }
    if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
      throw new LearningResourceImportDocumentError(
        "The uploaded file size is invalid.",
        "LEARNING_IMPORT_FILE_SIZE_INVALID",
      );
    }
    if (declaredSize > MAX_LEARNING_IMPORT_FILE_BYTES) {
      throw new LearningResourceImportDocumentError(
        `The uploaded file exceeds the ${MAX_LEARNING_IMPORT_FILE_BYTES / 1024} KB limit.`,
        "LEARNING_IMPORT_FILE_TOO_LARGE",
      );
    }
    return parseLearningResourceDocument(content, ".json");
  }

  if (mode === "paste") {
    const extension = /```json\s*[\s\S]*?```/i.test(content) ? ".md" : ".json";
    return parseLearningResourceDocument(content, extension);
  }

  throw new LearningResourceImportDocumentError(
    "Import document mode must be 'paste' or 'file'.",
    "LEARNING_IMPORT_DOCUMENT_INVALID",
  );
}

export function resolveLearningResourceImportContentGapId(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (input.contentGapId === undefined || input.contentGapId === null || input.contentGapId === "") {
    return null;
  }
  const contentGapId = String(input.contentGapId).trim();
  if (!/^gap_[a-f0-9]{32}$/.test(contentGapId)) {
    throw new LearningResourceImportDocumentError(
      "The selected content gap reference is invalid.",
      "LEARNING_IMPORT_CONTENT_GAP_INVALID",
    );
  }
  return contentGapId;
}

export function resolveLearningResourceImportContentGapBriefId(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (
    input.contentGapBriefId === undefined ||
    input.contentGapBriefId === null ||
    input.contentGapBriefId === ""
  ) {
    return null;
  }
  const contentGapBriefId = String(input.contentGapBriefId).trim();
  if (!/^brief_[a-f0-9]{32}$/.test(contentGapBriefId)) {
    throw new LearningResourceImportDocumentError(
      "The selected Study Spot brief reference is invalid.",
      "LEARNING_IMPORT_CONTENT_GAP_BRIEF_INVALID",
    );
  }
  return contentGapBriefId;
}
