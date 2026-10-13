import { index, route } from "@react-router/dev/routes";

// Keep route discovery explicit. The filesystem route scanner hangs on this
// checkout before Vite can start, leaving Shopify's embedded app as a blank page.
export default [
  index("routes/_index/route.jsx"),
  route("auth/login", "routes/auth.login/route.jsx"),
  route("auth/*", "routes/auth.$.jsx"),
  route("app", "routes/app.jsx", [index("routes/app._index.jsx")]),
  route("webhooks/app/uninstalled", "routes/webhooks.app.uninstalled.jsx"),
  route("webhooks/app/scopes_update", "routes/webhooks.app.scopes_update.jsx"),
  route("webhooks/compliance", "routes/webhooks.compliance.jsx"),
];
