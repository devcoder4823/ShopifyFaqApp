import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ANSWER_LENGTH,
  MAX_QUESTION_LENGTH,
  getProductFaqs,
  parseFaqs,
  setProductFaqs,
  updateFaqList,
} from "../app/faq.server.js";

test("parses valid FAQ metafield values and safely handles malformed data", () => {
  assert.deepEqual(parseFaqs('[{"id":"a","question":"Q?","answer":"A."}]'), [
    { id: "a", question: "Q?", answer: "A." },
  ]);
  assert.deepEqual(parseFaqs("not-json"), []);
  assert.deepEqual(parseFaqs('{"question":"not an array"}'), []);
});

test("creates a trimmed FAQ and rejects blank or oversized fields", () => {
  const created = updateFaqList([], "save", "", "  Can I return it?  ", "  Yes.  ");
  assert.equal(created.faqs.length, 1);
  assert.equal(created.faqs[0].question, "Can I return it?");
  assert.equal(created.faqs[0].answer, "Yes.");
  assert.ok(created.faqs[0].id);
  assert.match(updateFaqList([], "save", "", " ", "Answer").error, /question/i);
  assert.match(updateFaqList([], "save", "", "Q", " ").error, /answer/i);
  assert.match(updateFaqList([], "save", "", "q".repeat(MAX_QUESTION_LENGTH + 1), "A").error, /250/);
  assert.match(updateFaqList([], "save", "", "Q", "a".repeat(MAX_ANSWER_LENGTH + 1)).error, /5000/);
});

test("edits and deletes only the requested FAQ", () => {
  const original = [
    { id: "one", question: "First?", answer: "First." },
    { id: "two", question: "Second?", answer: "Second." },
  ];
  const edited = updateFaqList(original, "save", "two", " Updated? ", " Updated.");
  assert.deepEqual(edited.faqs, [original[0], { id: "two", question: "Updated?", answer: "Updated." }]);
  const deleted = updateFaqList(edited.faqs, "delete", "one");
  assert.deepEqual(deleted.faqs, [{ id: "two", question: "Updated?", answer: "Updated." }]);
  assert.match(updateFaqList(original, "delete", "missing").error, /could not be found/i);
  assert.match(updateFaqList(original, "save", "missing", "Q", "A").error, /could not be found/i);
});

test("rejects product FAQ metafield values over the safe Shopify size budget", () => {
  const faqs = [];
  for (let i = 0; i < 20; i += 1) {
    faqs.push({ id: `id-${i}`, question: "Q", answer: "a".repeat(4_000) });
  }
  const result = updateFaqList(faqs, "save", "", "One more?", "A");
  assert.match(result.error, /too large/i);
});

test("saves with metafieldsSet and surfaces Shopify userErrors", async () => {
  let request;
  const admin = {
    async graphql(query, options) {
      request = { query, options };
      return { json: async () => ({ data: { metafieldsSet: { metafields: [{ id: "gid://shopify/Metafield/1" }], userErrors: [] } } }) };
    },
  };
  await setProductFaqs(admin, "gid://shopify/Product/1", [{ id: "faq", question: "Q", answer: "A" }]);
  assert.match(request.query, /metafieldsSet/);
  assert.equal(request.options.variables.metafields[0].namespace, "$app");
  assert.equal(request.options.variables.metafields[0].key, "faqs");

  await assert.rejects(
    setProductFaqs({ graphql: async () => ({ json: async () => ({ data: { metafieldsSet: { metafields: [], userErrors: [{ message: "Definition does not exist" }] } } }) }) }, "gid://shopify/Product/1", []),
    /Definition does not exist/,
  );
});

test("product lookup checks GraphQL errors and missing products", async () => {
  await assert.rejects(
    getProductFaqs({ graphql: async () => ({ json: async () => ({ errors: [{ message: "Denied" }] }) }) }, "gid://shopify/Product/1"),
    /couldn’t load this product/i,
  );
  await assert.rejects(
    getProductFaqs({ graphql: async () => ({ json: async () => ({ data: { product: null } }) }) }, "gid://shopify/Product/1"),
    /no longer available/i,
  );
  await assert.rejects(
    getProductFaqs({ graphql: async () => ({ json: async () => ({ data: { product: { metafield: { value: "{malformed" } } } }) }) }, "gid://shopify/Product/1"),
    /invalid and has not been changed/i,
  );
});
