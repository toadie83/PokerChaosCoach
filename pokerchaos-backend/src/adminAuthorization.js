export function requireAdmin(req, res, next) {
  if (req.entitlements?.admin === true) return next();
  return res.status(403).json({
    error: "Administrator access is required.",
    code: "ADMIN_REQUIRED",
  });
}

export function requireLearningImporter(req, res, next) {
  if (req.entitlements?.admin === true || req.entitlements?.learningImporter === true) {
    return next();
  }
  return res.status(403).json({
    error: "Learning import access is required.",
    code: "LEARNING_IMPORT_REQUIRED",
  });
}

const LEARNING_IMPORT_ROUTES = new Set([
  "/admin/learning/import",
  "/admin/learning/import/preview",
]);

export function isLearningImportRequest(req) {
  if (String(req?.method || "").toUpperCase() !== "POST") return false;
  return LEARNING_IMPORT_ROUTES.has(String(req?.path || ""));
}

export function scopedLearningImporterDenial(req) {
  if (req?.entitlements?.admin === true || req?.entitlements?.learningImporter !== true) {
    return null;
  }
  if (isLearningImportRequest(req)) return null;
  return {
    status: 403,
    payload: {
      error: "This account is restricted to learning-resource imports.",
      code: "LEARNING_IMPORT_SCOPE_REQUIRED",
    },
  };
}
