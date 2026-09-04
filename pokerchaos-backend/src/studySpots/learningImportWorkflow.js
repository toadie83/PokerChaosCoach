import {
  learningResourceValidationDetails,
  validateLearningResourceImport,
} from "./learningResourceValidation.js";
import {
  resolveLearningResourceImportContentGapBriefId,
  resolveLearningResourceImportContentGapId,
  resolveLearningResourceImportRequest,
} from "./structuredImport.js";

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
  { findDuplicates = async () => [], getContentGap = null } = {},
) {
  let resourceInput;
  let contentGapId;
  let contentGapBriefId;
  try {
    contentGapId = resolveLearningResourceImportContentGapId(input);
    contentGapBriefId = resolveLearningResourceImportContentGapBriefId(input);
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

  const contentGap = contentGapId && typeof getContentGap === "function"
    ? await getContentGap(contentGapId)
    : null;
  if (contentGapId && typeof getContentGap === "function" && !contentGap) {
    return {
      ok: false,
      status: 404,
      payload: {
        error: "The selected content gap no longer exists.",
        code: "CONTENT_GAP_NOT_FOUND",
      },
    };
  }
  if (contentGapBriefId && !contentGapId) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: "A Study Spot brief must belong to a selected content gap.",
        code: "LEARNING_IMPORT_CONTENT_GAP_BRIEF_INVALID",
      },
    };
  }
  if (contentGapBriefId && contentGap && !contentGap.briefs?.some((brief) => brief.id === contentGapBriefId)) {
    return {
      ok: false,
      status: 404,
      payload: {
        error: "The selected Study Spot brief no longer exists in this content gap.",
        code: "CONTENT_GAP_BRIEF_NOT_FOUND",
      },
    };
  }

  return {
    ok: true,
    status: 200,
    resource: parsed.data,
    contentGapId,
    contentGapBriefId,
    contentGap,
    warnings: parsed.warnings || [],
  };
}

export async function saveLearningResourceImportRequest(
  input,
  {
    findDuplicates = async () => [],
    getContentGap = null,
    createResource,
    createId,
  } = {},
) {
  const validation = await previewLearningResourceImportRequest(input, { findDuplicates, getContentGap });
  if (!validation.ok) return validation;
  if (typeof createResource !== "function" || typeof createId !== "function") {
    throw new Error("Learning import persistence is not configured.");
  }
  const resource = await createResource({
    ...validation.resource,
    id: createId(),
  }, {
    contentGapId: validation.contentGapId,
    contentGapBriefId: validation.contentGapBriefId,
  });
  const contentGap = validation.contentGapId && typeof getContentGap === "function"
    ? await getContentGap(validation.contentGapId)
    : null;
  return {
    ok: true,
    status: 201,
    payload: {
      resource,
      contentGapId: validation.contentGapId,
      contentGapBriefId: validation.contentGapBriefId,
      contentGap,
      imported: true,
      warnings: validation.warnings,
    },
  };
}
