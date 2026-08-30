export function parseLearningResourceDocument(text, extension = ".json") {
  const source = String(text || "").trim();
  if (!source) throw new Error("The import file is empty.");
  const normalizedExtension = String(extension || "").toLowerCase();
  let jsonText = source;
  if (normalizedExtension === ".md" || normalizedExtension === ".markdown") {
    const match = source.match(/```json\s*([\s\S]*?)```/i);
    if (!match) {
      throw new Error("Markdown imports require a fenced json code block.");
    }
    jsonText = match[1].trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Structured lesson JSON is invalid: ${error.message}`);
  }
  const resource = parsed?.resource || parsed;
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
    throw new Error("The import must contain one learning resource object.");
  }
  return resource;
}
