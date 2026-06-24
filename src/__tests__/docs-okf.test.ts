import * as fs from "fs";
import * as path from "path";

import * as yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..");
const docsDir = path.join(repoRoot, "docs");

// Canonical OKF `type` vocabulary for this repo (alphabetical).
const OKF_TYPES = ["CLI", "Module", "Script"];

interface Frontmatter {
  type?: string;
  title?: string;
  description?: string;
  resource?: string;
}

function parseFrontmatter(filePath: string): Frontmatter {
  const raw = fs.readFileSync(filePath, "utf-8");
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);
  if (!match) return {};
  return (yaml.load(match[1]) as Frontmatter | null) ?? {};
}

function docPages(): string[] {
  if (!fs.existsSync(docsDir)) return [];
  return fs
    .readdirSync(docsDir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => path.join(docsDir, f));
}

// The source units that must each have a corresponding docs/ page. Derived from
// the filesystem (not hard-coded) so adding a module/script without documenting
// it fails this suite.
function expectedResources(): string[] {
  const modules = fs
    .readdirSync(path.join(repoRoot, "src", "lib"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `src/lib/${f}`);
  const scripts = fs
    .readdirSync(path.join(repoRoot, "scripts"))
    .filter((f) => f.endsWith(".sh"))
    .map((f) => `scripts/${f}`);
  return [...modules, "src/sync-env.ts", ...scripts];
}

describe("docs/ pages declare valid OKF frontmatter", () => {
  const pages = docPages();

  it("contains at least one documented page", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const page of pages) {
    const name = path.basename(page);
    const fm = parseFrontmatter(page);

    describe(name, () => {
      it("declares a type from the canonical OKF vocabulary", () => {
        expect(OKF_TYPES).toContain(fm.type);
      });

      it("declares a title", () => {
        expect(fm.title).toBeTruthy();
      });

      it("declares a description", () => {
        expect(fm.description).toBeTruthy();
      });

      it("points resource at an existing source file", () => {
        const { resource } = fm;
        expect(resource).toBeTruthy();
        if (resource) {
          expect(fs.existsSync(path.join(repoRoot, resource))).toBe(true);
        }
      });
    });
  }
});

describe("docs/ covers every documented source unit", () => {
  const documented = new Set(
    docPages().map((p) => parseFrontmatter(p).resource),
  );

  for (const resource of expectedResources()) {
    it(`has a docs page for ${resource}`, () => {
      expect(documented).toContain(resource);
    });
  }
});
