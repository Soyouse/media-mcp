import { describe, it, expect } from "vitest";
import { extractBearer, checkBearer } from "../lib/http-auth.js";

describe("http-auth", () => {
  it("extractBearer extrait après 'Bearer '", () => {
    expect(extractBearer("Bearer abc123")).toBe("abc123");
  });
  it("extractBearer renvoie '' sans préfixe valide", () => {
    expect(extractBearer("Basic abc")).toBe("");
    expect(extractBearer("bearer abc")).toBe(""); // casse sensible
    expect(extractBearer("")).toBe("");
    expect(extractBearer(undefined)).toBe("");
    expect(extractBearer(null)).toBe("");
  });
  it("checkBearer true ssi token exact", () => {
    expect(checkBearer("Bearer secret", "secret")).toBe(true);
  });
  it("checkBearer false si token différent (même longueur)", () => {
    expect(checkBearer("Bearer aaaaaa", "bbbbbb")).toBe(false);
  });
  it("checkBearer false si longueurs différentes", () => {
    expect(checkBearer("Bearer short", "longer-token")).toBe(false);
  });
  it("checkBearer false si expected vide", () => {
    expect(checkBearer("Bearer x", "")).toBe(false);
  });
  it("checkBearer false si got vide", () => {
    expect(checkBearer("", "x")).toBe(false);
    expect(checkBearer("Basic x", "x")).toBe(false);
  });
});
