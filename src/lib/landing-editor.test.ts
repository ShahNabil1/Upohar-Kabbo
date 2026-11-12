import { describe, expect, it } from "vitest";
import { emptyLanding, moveItem, slugify, validateLanding } from "./landing-editor";

describe("landing editor safeguards", () => {
  it("starts unpublished without changing existing pages", () =>
    expect(emptyLanding().is_active).toBe(false));
  it("normalizes Bengali and English URLs", () =>
    expect(slugify(" Eid পাঞ্জাবি Offer! ")).toBe("eid-পাঞ্জাবি-offer"));
  it("requires product and URL", () => expect(validateLanding(emptyLanding(), [])).toHaveLength(2));
  it("rejects duplicate URLs but allows the current page", () => {
    const draft = { ...emptyLanding(), id: "one", product_id: "product", slug: "eid" };
    expect(validateLanding(draft, [{ id: "one", slug: "eid" }])).toEqual([]);
    expect(validateLanding(draft, [{ id: "two", slug: "eid" }])).toHaveLength(1);
  });
  it("rejects unsafe URLs and empty highlights", () => {
    const draft = {
      ...emptyLanding(),
      product_id: "p",
      slug: "eid",
      og_image_url: "javascript:alert(1)",
      bullets: [{ bn: " ", en: "" }],
    };
    expect(validateLanding(draft, [])).toHaveLength(2);
  });
  it("reorders without mutation", () => {
    const items = [1, 2, 3];
    expect(moveItem(items, 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(items).toEqual([1, 2, 3]);
  });
});
