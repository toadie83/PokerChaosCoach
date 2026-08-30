export function requireAdmin(req, res, next) {
  if (req.entitlements?.admin === true) return next();
  return res.status(403).json({
    error: "Administrator access is required.",
    code: "ADMIN_REQUIRED",
  });
}

export function requireLearningImporter(req, res, next) {
  if (
    req.entitlements?.admin === true ||
    req.entitlements?.learningManager === true ||
    req.entitlements?.learningImporter === true
  ) {
    return next();
  }
  return res.status(403).json({
    error: "Learning import access is required.",
    code: "LEARNING_IMPORT_REQUIRED",
  });
}

export function requireLearningManager(req, res, next) {
  if (req.entitlements?.admin === true || req.entitlements?.learningManager === true) {
    return next();
  }
  return res.status(403).json({
    error: "Learning management access is required.",
    code: "LEARNING_MANAGER_REQUIRED",
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

export function scopedLearningAccessDenial(req) {
  const entitlements = req?.entitlements || {};
  if (
    entitlements.admin === true ||
    (entitlements.learningImporter !== true && entitlements.learningManager !== true)
  ) {
    return null;
  }
  if (isLearningImportRequest(req)) return null;
  const path = String(req?.path || "");
  if (
    entitlements.learningManager === true &&
    (path === "/admin/learning" || path.startsWith("/admin/learning/"))
  ) {
    return null;
  }
  return {
    status: 403,
    payload: {
      error: entitlements.learningManager
        ? "This account is restricted to Learning Library management."
        : "This account is restricted to learning-resource imports.",
      code: entitlements.learningManager
        ? "LEARNING_MANAGER_SCOPE_REQUIRED"
        : "LEARNING_IMPORT_SCOPE_REQUIRED",
    },
  };
}
