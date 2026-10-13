export const FAQS_NAMESPACE = "$app";
export const FAQS_KEY = "faqs";
import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH } from "./faq.shared.js";

export { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH } from "./faq.shared.js";
const MAX_METAFIELD_BYTES = 60_000;

const FAQS_FIELD = `metafield(namespace: "${FAQS_NAMESPACE}", key: "${FAQS_KEY}") { value }`;

export const PRODUCT_SEARCH_QUERY = `#graphql
  query ProductFaqSearch($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query, sortKey: TITLE) {
      edges {
        cursor
        node {
          id
          title
          handle
          featuredImage { url altText }
          ${FAQS_FIELD}
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const PRODUCT_BY_ID_QUERY = `#graphql
  query ProductFaqById($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      featuredImage { url altText }
      ${FAQS_FIELD}
    }
  }
`;

const SET_FAQS_MUTATION = `#graphql
  mutation SaveProductFaqs($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id value }
      userErrors { field message }
    }
  }
`;


export function parseFaqs(value) {
  if (!value) return [];
  try {
    const faqs = JSON.parse(value);
    if (!Array.isArray(faqs)) return [];
    return faqs.filter(
      (faq) =>
        faq &&
        typeof faq.id === "string" &&
        typeof faq.question === "string" &&
        typeof faq.answer === "string",
    );
  } catch {
    return [];
  }
}

function validateFaq(question, answer) {
  const cleanQuestion = question.trim();
  const cleanAnswer = answer.trim();
  if (!cleanQuestion) return { error: "Enter a question." };
  if (cleanQuestion.length > MAX_QUESTION_LENGTH) {
    return { error: `Questions must be ${MAX_QUESTION_LENGTH} characters or fewer.` };
  }
  if (!cleanAnswer) return { error: "Enter an answer." };
  if (cleanAnswer.length > MAX_ANSWER_LENGTH) {
    return { error: `Answers must be ${MAX_ANSWER_LENGTH} characters or fewer.` };
  }
  return { question: cleanQuestion, answer: cleanAnswer };
}

export function updateFaqList(faqs, intent, faqId, question, answer, useProductDescription) {
  if (!Array.isArray(faqs)) return { error: "The FAQ data is invalid. Refresh and try again." };

  if (intent === "delete") {
    if (!faqId || !faqs.some((faq) => faq.id === faqId)) {
      return { error: "That FAQ could not be found. Refresh and try again." };
    }
    return { faqs: faqs.filter((faq) => faq.id !== faqId) };
  }

  if (intent !== "save") return { error: "This action isn’t supported." };
  const valid = validateFaq(question, answer);
  if (valid.error) return valid;

  const existing = faqId ? faqs.find((faq) => faq.id === faqId) : null;
  if (faqId && !existing) return { error: "That FAQ could not be found. Refresh and try again." };
  const faq = { id: existing?.id || crypto.randomUUID(), ...valid };
  if (typeof useProductDescription === "boolean") {
    faq.useProductDescription = useProductDescription;
  } else if (typeof existing?.useProductDescription === "boolean") {
    faq.useProductDescription = existing.useProductDescription;
  }
  const nextFaqs = existing
    ? faqs.map((item) => (item.id === faqId ? faq : item))
    : [...faqs, faq];

  if (new TextEncoder().encode(JSON.stringify(nextFaqs)).byteLength > MAX_METAFIELD_BYTES) {
    return { error: "These FAQs are too large to save together. Shorten an answer or remove an FAQ and try again." };
  }
  return { faqs: nextFaqs };
}

export async function setProductFaqs(admin, productId, faqs) {
  let response;
  try {
    response = await admin.graphql(SET_FAQS_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId: productId,
            namespace: FAQS_NAMESPACE,
            key: FAQS_KEY,
            type: "json",
            value: JSON.stringify(faqs),
          },
        ],
      },
    });
  } catch (error) {
    console.error("Shopify FAQ metafield request failed", error);
    throw new Error("Shopify couldn’t save the FAQs. Check your connection and try again.");
  }

  const result = await response.json();
  if (result.errors?.length) {
    console.error("Shopify FAQ GraphQL errors", result.errors);
    throw new Error("Shopify couldn’t save the FAQs. Try again in a moment.");
  }
  const payload = result.data?.metafieldsSet;
  if (!payload || payload.userErrors?.length || payload.metafields?.length !== 1) {
    console.error("Shopify FAQ metafield user errors", payload?.userErrors);
    throw new Error(payload?.userErrors?.[0]?.message || "Shopify couldn’t save the FAQs. Try again.");
  }
}

export async function getProductFaqs(admin, productId) {
  const response = await admin.graphql(PRODUCT_BY_ID_QUERY, { variables: { id: productId } });
  const result = await response.json();
  if (result.errors?.length) {
    console.error("Shopify product lookup errors", result.errors);
    throw new Error("Shopify couldn’t load this product. Refresh and try again.");
  }
  const product = result.data?.product;
  if (!product) throw new Error("This product is no longer available. Choose another product.");
  const value = product.metafield?.value;
  if (!value) return { ...product, faqs: [] };
  let faqs;
  try {
    faqs = JSON.parse(value);
  } catch {
    throw new Error("FAQ data for this product is invalid and has not been changed. Contact support for help.");
  }
  if (
    !Array.isArray(faqs) ||
    faqs.some(
      (faq) =>
        !faq ||
        typeof faq.id !== "string" ||
        typeof faq.question !== "string" ||
        typeof faq.answer !== "string",
    ) ||
    new Set(faqs.map((faq) => faq.id)).size !== faqs.length
  ) {
    throw new Error("FAQ data for this product is invalid and has not been changed. Contact support for help.");
  }
  return { ...product, faqs };
}
