import {
  learningResourceValidationDetails,
  validateLearningResourceImport,
} from "./learningResourceValidation.js";
import { resolveLearningResourceImportRequest } from "./structuredImport.js";

function documentFailure(error) {
  return {
    ok: false,
    status: Number(error?.status) || 400,
    payload: {
      error: error?.message || "The import document is invalid.",
      code: error?.code || "LEARNING_IMPORT_DOCUMENT_INVALID",
    },
  };
}

export async function previewLearningResourceImportRequest(
  input,
  { findDuplicates = async () => [] } = {},
) {
  let resourceInput;
  try {
    resourceInput = resolveLearningResourceImportRequest(input);
  } catch (error) {
    return documentFailure(error);
  }

  const parsed = validateLearningResourceImport(resourceInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: "Learning resource validation failed.",
        code: "INVALID_LEARNING_RESOURCE",
        details: learningResourceValidationDetails(parsed.error),
      },
    };
  }

  const duplicates = await findDuplicates(parsed.data);
  if (duplicates.length > 0) {
    return {
      ok: false,
      status: 409,
      payload: {
        error: "Duplicate learning resource identifiers were found.",
        code: "LEARNING_RESOURCE_DUPLICATE",
        duplicates,
      },
    };
  }

  return {
    ok: true,
    status: 200,
    resource: parsed.data,
    warnings: parsed.warnings || [],
  };
}

export async function saveLearningResourceImportRequest(
  input,
  {
    findDuplicates = async () => [],
    createResource,
    createId,
  } = {},
) {
  const validation = await previewLearningResourceImportRequest(input, { findDuplicates });
  if (!validation.ok) return validation;
  if (typeof createResource !== "function" || typeof createId !== "function") {
    throw new Error("Learning import persistence is not configured.");
  }
  const resource = await createResource({
    ...validation.resource,
    id: createId(),
  });
  return {
    ok: true,
    status: 201,
    payload: {
      resource,
      imported: true,
      warnings: validation.warnings,
    },
  };
}
