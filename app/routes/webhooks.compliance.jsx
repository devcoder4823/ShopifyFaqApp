import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  // Shopify's mandatory customer privacy topics are acknowledged because this app
  // doesn't collect or retain customer information. FAQ content lives on products.
  if (topic === "shop/redact") {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response(null, { status: 200 });
};
