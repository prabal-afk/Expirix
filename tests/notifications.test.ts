import { afterEach, describe, expect, it } from "vitest";
import { daysLabel } from "@/lib/dates";
import { buildDigest, digestHtml, digestSubject, digestSummaryLine, digestText } from "@/lib/digest";
import { buildViews } from "@/lib/expiry";
import { HI } from "@/lib/i18n-hi";
import { setCurrentLang, t } from "@/lib/i18n-core";
import { buildSeed } from "@/lib/seed";

const TODAY = "2026-11-10";
const seed = buildSeed(TODAY, "shop-1", (() => { let i = 0; return () => `id-${++i}`; })());
const views = buildViews(seed, seed.settings, TODAY);
const digest = buildDigest(views, seed.settings, TODAY);

describe("daily digest", () => {
  it("groups stock into expired, today/tomorrow and soon, ignoring empty batches", () => {
    expect(digest.expired.length).toBeGreaterThan(0);
    expect(digest.expired.every((i) => i.days < 0)).toBe(true);
    expect(digest.urgent.every((i) => i.days >= 0 && i.days <= seed.settings.alert_critical_days)).toBe(true);
    expect(digest.soon.every((i) => i.days > seed.settings.alert_critical_days && i.days <= seed.settings.expiry_threshold_days)).toBe(true);
    expect(digest.total).toBe(digest.expired.length + digest.urgent.length + digest.soon.length);
    expect(digest.atRisk).toBeGreaterThan(0);
  });
  it("sorts the most overdue first", () => {
    const d = digest.expired.map((i) => i.days);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });
  it("writes a subject that names the shop and the counts", () => {
    const s = digestSubject(digest);
    expect(s).toContain(`${digest.expired.length} expired`);
    expect(s).toContain(digest.shopName);
  });
  it("sends nothing-to-report text when the shop is clear", () => {
    const empty = buildDigest([], seed.settings, TODAY);
    expect(empty.total).toBe(0);
    expect(digestText(empty)).toContain("Nothing is expired");
    expect(digestSummaryLine(empty)).toBe("");
  });
  it("uses WhatsApp bold markers only for the WhatsApp text", () => {
    expect(digestText(digest, { whatsapp: true })).toContain("*Expirix*");
    expect(digestText(digest)).not.toContain("*Expirix*");
  });
  it("escapes product names in the HTML email", () => {
    const evil = { ...digest, expired: [{ ...digest.expired[0], name: '<img src=x onerror="alert(1)">' }] };
    const html = digestHtml(evil, { appUrl: "https://example.com" });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
    expect(html).toContain('href="https://example.com"');
  });
  it("caps long lists and says how many more there are", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...digest.expired[0], name: `Item ${i}` }));
    const text = digestText({ ...digest, expired: many, urgent: [], soon: [], total: 20 });
    expect(text).toContain("and 8 more");
  });
});

describe("Hindi", () => {
  afterEach(() => setCurrentLang("en"));
  it("returns English by default and Hindi when switched, falling back for unknown text", () => {
    expect(t("Dashboard")).toBe("Dashboard");
    setCurrentLang("hi");
    expect(t("Dashboard")).toBe(HI["Dashboard"]);
    expect(t("A string nobody translated")).toBe("A string nobody translated");
  });
  it("translates day phrases", () => {
    expect(daysLabel(3)).toBe("Expires in 3 days");
    setCurrentLang("hi");
    expect(daysLabel(3)).toBe("3 दिन में एक्सपायर");
    expect(daysLabel(-2)).toBe("2 दिन पहले एक्सपायर हुआ");
  });
  it("has no empty translations", () => {
    for (const [k, v] of Object.entries(HI)) expect(v.trim(), k).not.toBe("");
  });
});
