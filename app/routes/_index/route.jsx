import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <main
      style={{
        boxSizing: "border-box",
        display: "grid",
        gap: "1.5rem",
        margin: "0 auto",
        maxWidth: "72rem",
        padding: "3rem 1.5rem",
      }}
    >
      <section style={{ display: "grid", gap: "1rem", textAlign: "center" }}>
        <h1 style={{ margin: 0 }}>Product FAQ Manager</h1>
        <p style={{ color: "#616a75", margin: 0 }}>
          Create and manage helpful answers for your product pages.
        </p>
        {showForm && (
          <Form
            method="post"
            action="/auth/login"
            style={{
              alignItems: "end",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              justifyContent: "center",
              margin: "0 auto",
            }}
          >
            <label style={{ display: "grid", gap: "0.25rem", textAlign: "left" }}>
              <span>Shop domain</span>
              <input
                style={{ font: "inherit", minWidth: "16rem", padding: "0.5rem" }}
                type="text"
                name="shop"
              />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button style={{ font: "inherit", padding: "0.5rem 1rem" }} type="submit">
              Log in
            </button>
          </Form>
        )}
      </section>
    </main>
  );
}
