export const MAX_LEARNING_IMPORT_FILE_BYTES = 512 * 1024;

export function validateLearningImportFile(file = {}) {
  const fileName = String(file?.name || "").trim();
  const mediaType = String(file?.type || "").trim().toLowerCase();
  const size = Number(file?.size);
  if (!/\.json$/i.test(fileName)) {
    throw new Error("Upload JSON file accepts one .json file only.");
  }
  if (mediaType && !["application/json", "text/json"].includes(mediaType)) {
    throw new Error("The selected file must use a JSON content type.");
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("The selected JSON file is empty.");
  }
  if (size > MAX_LEARNING_IMPORT_FILE_BYTES) {
    throw new Error(`The selected JSON file exceeds the ${MAX_LEARNING_IMPORT_FILE_BYTES / 1024} KB limit.`);
  }
}

export function learningImportIdentityFromText(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ""));
  } catch (error) {
    throw new Error(`Selected file contains malformed JSON: ${error.message}`);
  }
  const resource = parsed?.resource || parsed;
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
    throw new Error("Selected file must contain one learning resource object.");
  }
  return {
    externalId: String(resource.external_id || resource.externalId || "").trim(),
    lessonNumber: String(resource.lesson_number || resource.lessonNumber || "").trim(),
    title: String(resource.title || "").trim(),
    category: String(resource.category || "").trim(),
  };
}

export function learningImportErrorMessage(error) {
  const payload = error?.payload || {};
  if (Array.isArray(payload.duplicates) && payload.duplicates.length > 0) {
    const duplicate = payload.duplicates[0] || {};
    const identity = duplicate.externalId || duplicate.slug || duplicate.id || "existing lesson";
    return `Duplicate learning resource: ${identity}. Existing lessons are never overwritten.`;
  }
  const details = payload.details || {};
  const messages = [
    ...(Array.isArray(details.formErrors) ? details.formErrors : []),
    ...Object.entries(details.fieldErrors || {}).flatMap(([field, fieldErrors]) =>
      (Array.isArray(fieldErrors) ? fieldErrors : []).map((message) => `${field}: ${message}`),
    ),
  ];
  if (messages.length > 0) return messages.join(" ");
  return error?.message || "The lesson could not be imported.";
}
