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
  const method = String(req?.method || "").toUpperCase();
  const path = String(req?.path || "");
  if (method === "GET" && path === "/me/entitlements") return true;
  return method === "POST" && LEARNING_IMPORT_ROUTES.has(path);
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
