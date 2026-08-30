import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ARTICLES_HUB_PATH,
  ARTICLE_CATALOG,
  INDEXED_CORE_PATHS,
  SITE_BASE_URL,
  buildArticlePath,
} from "../src/components/marketing/articleCatalog.js";
import { TRUST_PAGE_CATALOG } from "../src/components/marketing/trustCatalog.js";

const LEARNING_LIBRARY_PATH = "/learn";

function buildUrlNode(urlPath) {
  return [
    "  <url>",
    `    <loc>${SITE_BASE_URL}${urlPath}</loc>`,
    "    <changefreq>weekly</changefreq>",
    "  </url>",
  ].join("\n");
}

function buildSitemapXml() {
  const publishedArticlePaths = ARTICLE_CATALOG.filter((article) =>
    article.publishReady,
  ).map((article) => buildArticlePath(article.slug));
  const articlesHubPaths =
    publishedArticlePaths.length > 0 ? [ARTICLES_HUB_PATH] : [];
  const publishedTrustPaths = TRUST_PAGE_CATALOG.filter(
    (page) => page.publishReady,
  ).map((page) => page.path);

  const uniquePaths = Array.from(
    new Set([
      ...INDEXED_CORE_PATHS,
      LEARNING_LIBRARY_PATH,
      ...publishedTrustPaths,
      ...articlesHubPaths,
      ...publishedArticlePaths,
    ]),
  );

  const urlNodes = uniquePaths.map((path) => buildUrlNode(path)).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlNodes,
    "</urlset>",
    "",
  ].join("\n");
}

async function main() {
  const sitemapPath = resolve("public", "sitemap.xml");
  const xml = buildSitemapXml();
  await writeFile(sitemapPath, xml, "utf8");
  console.log(
    `Generated sitemap at ${sitemapPath} with ${
      TRUST_PAGE_CATALOG.filter((page) => page.publishReady).length
    } published trust page URL(s) and ${
      ARTICLE_CATALOG.filter((article) => article.publishReady).length
    } published article URL(s).`,
  );
}

main().catch((error) => {
  console.error("Failed to generate sitemap:", error);
  process.exitCode = 1;
});
