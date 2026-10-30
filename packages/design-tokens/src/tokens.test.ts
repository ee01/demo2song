import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("design tokens", () => {
  it("keeps the shared colors and doubles px into rpx", () => {
    const css = readFileSync(path.join(repoRoot, "packages/design-tokens/generated/css/tokens.css"), "utf8");
    const scss = readFileSync(path.join(repoRoot, "packages/design-tokens/generated/scss/tokens.scss"), "utf8");
    const swift = readFileSync(path.join(repoRoot, "packages/design-tokens/generated/swift/Tokens.swift"), "utf8");

    expect(css).toContain("--d2s-color-bg-0: #0b0420;");
    expect(css).toContain("--d2s-color-accent-secondary: #6a5cff;");
    expect(css).toContain("--d2s-font-size-title: 21px;");
    expect(scss).toContain("$d2s-color-text-primary: #f4f1ff;");
    expect(scss).toContain("$d2s-font-size-title: 42rpx;");
    expect(scss).toContain("$d2s-space-8: 16rpx;");
    expect(swift).toContain('public static let colorBg0 = "#0b0420"');
    expect(swift).toContain("public static let fontSizeTitle: Double = 21");
  });

  it("makes the mini program theme use the generated variables", () => {
    const theme = readFileSync(path.join(repoRoot, "apps/mp-weixin/src/styles/theme.scss"), "utf8");
    expect(theme).toContain("packages/design-tokens/generated/scss/tokens.scss");
    expect(theme).toContain("$d2s-color-text-primary");
    expect(theme).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(theme).not.toMatch(/rgba\(/);
  });
});
