import { describe, it, expect } from "vitest";
import { PARA, KEY_FILES } from "../vault.js";

describe("vault constants", () => {
  it("PARA has all four categories", () => {
    expect(PARA.projects).toBe("01_projects");
    expect(PARA.areas).toBe("02_areas");
    expect(PARA.resources).toBe("03_resources");
    expect(PARA.archive).toBe("04_archive");
  });

  it("KEY_FILES has correct paths", () => {
    expect(KEY_FILES.bragfile).toBe("02_areas/career/bragfile.md");
    expect(KEY_FILES.contacts).toBe("03_resources/contacts.md");
    expect(KEY_FILES.config).toBe("brainkit.toml");
  });
});
