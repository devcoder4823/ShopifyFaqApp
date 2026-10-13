/* global process */
import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Form, Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  PRODUCT_SEARCH_QUERY,
  getProductFaqs,
  parseFaqs,
  setProductFaqs,
  updateFaqList,
} from "../faq.server";
import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH } from "../faq.shared.js";
import { authenticate } from "../shopify.server";

const PRODUCTS_PER_PAGE = 12;

function productSearchTerm(term) {
  const cleanTerm = term.trim();
  if (!cleanTerm) return "";

  // Shopify's search API supports prefix wildcards. Apply each word to the
  // title field so partial title searches (for example, "Cotton") match.
  return cleanTerm
    .split(/\s+/)
    .map((word) => `title:${word.replace(/[\\"]/g, "\\$&")}*`)
    .join(" ");
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = (url.searchParams.get("q") || "").slice(0, 150);
  const cursor = url.searchParams.get("after") || null;
  const productId = url.searchParams.get("product") || null;

  try {
    const [productsResponse, selectedProduct] = await Promise.all([
      admin.graphql(PRODUCT_SEARCH_QUERY, {
        variables: {
          first: PRODUCTS_PER_PAGE,
          after: cursor,
          query: productSearchTerm(search),
        },
      }),
      productId ? getProductFaqs(admin, productId) : Promise.resolve(null),
    ]);
    const result = await productsResponse.json();
    if (result.errors?.length) {
      console.error("Shopify product search errors", result.errors);
      throw new Error("Shopify couldn’t search products. Refresh and try again.");
    }
    const connection = result.data?.products;
    if (!connection) throw new Error("Shopify couldn’t search products. Refresh and try again.");
    return {
      search,
      selectedProduct,
      themeEditorUrl: buildThemeEditorUrl(session.shop),
      products: connection.edges.map(({ node }) => ({
        ...node,
        faqs: parseFaqs(node.metafield?.value),
      })),
      pageInfo: connection.pageInfo,
      error: null,
    };
  } catch (error) {
    console.error("Product FAQ dashboard load failed", error);
    return {
      search,
      selectedProduct: null,
      themeEditorUrl: null,
      products: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      error: error instanceof Error ? error.message : "We couldn’t load your products. Refresh and try again.",
    };
  }
};

function buildThemeEditorUrl(shop) {
  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!shop || !apiKey || !/^[a-zA-Z0-9.-]+$/.test(shop)) return null;
  const params = new URLSearchParams({
    template: "product",
    addAppBlockId: `${apiKey}/product-faqs`,
    target: "newAppsSection",
  });
  return `https://${shop}/admin/themes/current/editor?${params.toString()}`;
}

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const productId = String(formData.get("productId") || "");
  if (!productId || !productId.startsWith("gid://shopify/Product/")) {
    return { ok: false, intent, error: "Choose a valid product before saving." };
  }

  try {
    const product = await getProductFaqs(admin, productId);
    const update = updateFaqList(
      product.faqs,
      intent,
      String(formData.get("faqId") || ""),
      String(formData.get("question") || ""),
      String(formData.get("answer") || ""),
      formData.get("useProductDescription") === "on",
    );
    if (update.error) return { ok: false, intent, error: update.error };
    await setProductFaqs(admin, productId, update.faqs);
    return {
      ok: true,
      intent,
      message: intent === "delete" ? "FAQ deleted." : "FAQ saved.",
    };
  } catch (error) {
    console.error("Product FAQ update failed", error);
    return {
      ok: false,
      intent,
      error: error instanceof Error ? error.message : "We couldn’t save this FAQ. Please try again.",
    };
  }
};

function ProductCard({ product, search }) {
  return (
    <Link className="productCard" to={`/app?q=${encodeURIComponent(search)}&product=${encodeURIComponent(product.id)}`}>
      {product.featuredImage?.url ? (
        <img
          className="productImage"
          src={product.featuredImage.url}
          alt={product.featuredImage.altText || ""}
          width={44}
          height={44}
          loading="lazy"
        />
      ) : (
        <span className="productImagePlaceholder" aria-hidden="true">◇</span>
      )}
      <span className="productInfo">
        <strong>{product.title}</strong>
        <span>{product.faqs.length} {product.faqs.length === 1 ? "FAQ" : "FAQs"}</span>
      </span>
      <span className="manage">Manage FAQs <span aria-hidden="true">→</span></span>
    </Link>
  );
}

ProductCard.propTypes = {
  product: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    faqs: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired })).isRequired,
    featuredImage: PropTypes.shape({ url: PropTypes.string, altText: PropTypes.string }),
  }).isRequired,
  search: PropTypes.string.isRequired,
};

function FaqEditor({ product, faq, fetcher, onCancel }) {
  const [useProductDescription, setUseProductDescription] = useState(faq?.useProductDescription === true);

  return (
    <fetcher.Form method="post" className="editor">
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="productId" value={product.id} />
      {faq && <input type="hidden" name="faqId" value={faq.id} />}
      <label className="field">
        <span>Question <span className="required">Required</span></span>
        <input name="question" defaultValue={faq?.question || ""} maxLength={MAX_QUESTION_LENGTH} required />
        <small>Up to {MAX_QUESTION_LENGTH} characters.</small>
      </label>
      <label className="field">
        <span>Answer <span className="required">Required</span></span>
        <textarea name="answer" defaultValue={faq?.answer || ""} maxLength={MAX_ANSWER_LENGTH} rows={5} required />
        <small>Up to {MAX_ANSWER_LENGTH} characters. Line breaks are kept on your storefront.</small>
      </label>
      <label className="faqDescriptionToggle">
        <input
          type="checkbox"
          name="useProductDescription"
          checked={useProductDescription}
          onChange={(event) => setUseProductDescription(event.target.checked)}
        />
        <span><strong>Show product description</strong><small>When on, this FAQ displays the product’s Shopify description under the question instead of the answer above.</small></span>
      </label>
      {fetcher.data?.intent === "save" && !fetcher.data.ok && <p className="error" role="alert">{fetcher.data.error}</p>}
      <div className="formActions">
        <button type="button" className="secondaryButton" onClick={onCancel} disabled={fetcher.state !== "idle"}>Cancel</button>
        <button type="submit" className="primaryButton" disabled={fetcher.state !== "idle"}>
          {fetcher.state !== "idle" ? "Saving…" : faq ? "Save changes" : "Save FAQ"}
        </button>
      </div>
    </fetcher.Form>
  );
}

const productPropType = PropTypes.shape({ id: PropTypes.string.isRequired }).isRequired;
const fetcherPropType = PropTypes.shape({
  Form: PropTypes.elementType.isRequired,
  state: PropTypes.string.isRequired,
  data: PropTypes.shape({ intent: PropTypes.string, ok: PropTypes.bool, error: PropTypes.string, message: PropTypes.string }),
}).isRequired;

FaqEditor.propTypes = {
  product: productPropType,
  faq: PropTypes.shape({ id: PropTypes.string, question: PropTypes.string, answer: PropTypes.string, useProductDescription: PropTypes.bool }),
  fetcher: fetcherPropType,
  onCancel: PropTypes.func.isRequired,
};

function FaqCard({ product, faq, fetcher, editing, onEdit, onDelete, deletePending, onCancelDelete }) {
  if (editing) return <FaqEditor product={product} faq={faq} fetcher={fetcher} onCancel={onEdit} />;
  return (
    <article className="faqCard">
      <div className="faqCopy">
        <h3>{faq.question}</h3>
        <p>{faq.useProductDescription ? "Uses the product description" : faq.answer}</p>
      </div>
      {deletePending ? (
        <div className="confirmDelete" role="group" aria-label={`Confirm deletion of ${faq.question}`}>
          <div><strong>Delete this FAQ?</strong><span>This action cannot be undone.</span></div>
          <button type="button" className="secondaryButton" onClick={onCancelDelete}>Cancel</button>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="faqId" value={faq.id} />
            <button type="submit" className="dangerButton" disabled={fetcher.state !== "idle"}>{fetcher.state !== "idle" ? "Deleting…" : "Delete"}</button>
          </fetcher.Form>
        </div>
      ) : (
        <div className="faqActions">
          <button type="button" className="textButton" onClick={onEdit}>Edit</button>
          <button type="button" className="textButtonDanger" onClick={onDelete}>Delete</button>
        </div>
      )}
    </article>
  );
}

FaqCard.propTypes = {
  product: productPropType,
  faq: PropTypes.shape({ id: PropTypes.string.isRequired, question: PropTypes.string.isRequired, answer: PropTypes.string.isRequired }).isRequired,
  fetcher: fetcherPropType,
  editing: PropTypes.bool.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  deletePending: PropTypes.bool.isRequired,
  onCancelDelete: PropTypes.func.isRequired,
};

export default function ProductFaqManager() {
  const { search, selectedProduct, products, pageInfo, error, themeEditorUrl } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const hasSelection = Boolean(selectedProduct);

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show(fetcher.data.message);
      setEditingId(null);
      setAdding(false);
      setDeletingId(null);
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Product FAQ Manager">
      <div className="pageIntro">Create and manage FAQs for your products.</div>
      {error && <div className="bannerError" role="alert">{error}</div>}
      <s-section heading={hasSelection ? `FAQs for ${selectedProduct.title}` : "Find a product"}>
        <div className="layout">
          <section className="productPanel" aria-label="Product search and results">
            <Form method="get" action="/app" className="searchForm">
              <label htmlFor="product-search">Search products</label>
              <div className="searchControls">
                <input id="product-search" type="search" name="q" defaultValue={search} placeholder="Search by product title" />
                <button className="primaryButton" type="submit">Search</button>
              </div>
            </Form>
            {products.length > 0 ? (
              <div className="productList">
                {products.map((product) => <ProductCard key={product.id} product={product} search={search} />)}
              </div>
            ) : !error ? (
              <div className="emptyProducts">
                <span className="emptyIcon" aria-hidden="true">⌕</span>
                <strong>{search ? "No matching products" : "No products yet"}</strong>
                <span>{search ? "Try a different product name." : "Add a product in Shopify to start managing FAQs."}</span>
              </div>
            ) : null}
            {pageInfo.hasNextPage && (
              <Link className="moreLink" to={`/app?q=${encodeURIComponent(search)}&after=${encodeURIComponent(pageInfo.endCursor)}`}>Load more products</Link>
            )}
          </section>

          <section className="faqPanel" aria-label="Product FAQs">
            {!hasSelection ? (
              <div className="welcome">
                <span className="welcomeIcon" aria-hidden="true"><img src="/mirai_app_logo.png" width="100%" height="100%" alt="" /></span>
                <h2>Welcome to Product FAQ Manager</h2>
                <p>Add clear answers to common questions and display them right on your product pages.</p>
                <ol><li>Select a product</li><li>Add your FAQs</li><li>Place the FAQ block in your theme</li></ol>
              </div>
            ) : (
              <>
                <div className="selectedProduct">
                  {selectedProduct.featuredImage?.url && (
                    <img
                      src={selectedProduct.featuredImage.url}
                      alt={selectedProduct.featuredImage.altText || ""}
                      width={56}
                      height={56}
                    />
                  )}
                  <div><h2>{selectedProduct.title}</h2><p>{selectedProduct.faqs.length} {selectedProduct.faqs.length === 1 ? "FAQ" : "FAQs"}</p></div>
                </div>
                <div className="faqHeading"><h2>FAQs</h2></div>
                {selectedProduct.faqs.length === 0 && !adding ? (
                  <div className="emptyFaqs"><strong>No FAQs for this product yet</strong><span>Add the first question customers are likely to ask.</span></div>
                ) : (
                  <div className="faqList">
                    {selectedProduct.faqs.map((faq) => (
                      <FaqCard
                        key={faq.id}
                        product={selectedProduct}
                        faq={faq}
                        fetcher={fetcher}
                        editing={editingId === faq.id}
                        onEdit={() => { setAdding(false); setEditingId(editingId === faq.id ? null : faq.id); }}
                        onDelete={() => { setEditingId(null); setDeletingId(faq.id); }}
                        deletePending={deletingId === faq.id}
                        onCancelDelete={() => setDeletingId(null)}
                      />
                    ))}
                  </div>
                )}
                {adding && <FaqEditor product={selectedProduct} fetcher={fetcher} onCancel={() => setAdding(false)} />}
                {!adding && editingId === null && <button type="button" className="addButton" onClick={() => { setDeletingId(null); setAdding(true); }}>＋ Add FAQ</button>}
              </>
            )}
          </section>
        </div>
      </s-section>

      <s-section heading="Add FAQs to your storefront">
        <div className="setupSteps">
          <p>Display your FAQs on a product page in three steps:</p>
          {themeEditorUrl && <a className="themeLink" href={themeEditorUrl} target="_blank" rel="noreferrer">Open product template in Theme Editor ↗</a>}
          <ol>
            <li>Open <strong>Online Store → Themes → Customize</strong>.</li>
            <li>Open a product template and select <strong>Add block → Apps → Product FAQs</strong>.</li>
            <li>Position the block, then save your theme.</li>
          </ol>
          <p className="setupNote">The app block works with Online Store 2.0 themes that support app blocks.</p>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
