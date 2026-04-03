import { describe, it, expect } from "vitest";
import { isPathWithinVault } from "../tools.js";

describe("isPathWithinVault", () => {
  it("allows a simple relative path inside the vault", () => {
    expect(isPathWithinVault("/vault", "01_projects/foo.md")).toBe(true);
  });

  it("rejects traversal to /etc/passwd", () => {
    expect(isPathWithinVault("/vault", "../../etc/passwd")).toBe(false);
  });

  it("allows '.' which resolves to vault root", () => {
    expect(isPathWithinVault("/vault", ".")).toBe(true);
  });

  it("rejects traversal to a sibling vault", () => {
    expect(isPathWithinVault("/vault", "../vault2/file.md")).toBe(false);
  });

  it("allows path with .. that still resolves inside the vault", () => {
    expect(isPathWithinVault("/vault", "01_projects/../02_areas/file.md")).toBe(true);
  });

  it("allows empty string which resolves to vault root", () => {
    expect(isPathWithinVault("/vault", "")).toBe(true);
  });

  it("rejects traversal from a different vault base", () => {
    expect(isPathWithinVault("/vault2", "../vault/file.md")).toBe(false);
  });

  it("rejects when vault path is a prefix of another directory name", () => {
    expect(isPathWithinVault("/data/vault", "../vault-other/f.md")).toBe(false);
  });
});
