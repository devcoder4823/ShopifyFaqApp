# Product FAQ Manager

Product FAQ Manager is an embedded Shopify app for creating and managing frequently asked questions for individual products. A Theme App Extension displays those questions on storefront product pages.

## How it works

- FAQs are stored in an app-owned JSON product metafield: `$app.faqs`.
- Each item contains an app-generated ID, a question, and an answer. No customer data is collected or stored.
- Shopify's Admin GraphQL API searches products and saves metafield values. The app does not use the legacy REST Admin API.
- Prisma and SQLite store Shopify authentication sessions only. Use a durable production database and secure backups when deploying beyond local development.
- The app requests `write_products`, which Shopify requires to search product data and write app-owned product metafields. It requests no customer, order, payment, inventory, or theme scopes.

## Local development

### Requirements

- Node.js 22.22 LTS or Node.js 24 LTS. The project pins Node 24 in `.nvmrc`.
- npm
- A Shopify Partner/Dev Dashboard app and development store
- Shopify CLI

### Start the app

1. Select Node 24 LTS (for nvm, run `nvm install` and `nvm use` from this project folder) and confirm `node --version` prints `v24.x`.
2. Install dependencies with `npm ci` after changing Node versions.
3. Run `npm run dev` and follow Shopify CLI to select/link the app and development store.
4. Shopify CLI supplies the local tunnel URL and updates the development app URLs. Use the install link shown by the CLI to open the embedded app in Shopify Admin.

The app uses the environment values supplied by Shopify CLI, including `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, and `SCOPES`. Do not commit secrets. The checked-in Prisma schema uses SQLite at `prisma/dev.sqlite` for local development.

The Prisma session adapter uses the included development SQLite database. On a fresh checkout, run `npm run setup` once to generate Prisma Client and apply migrations, then run the Shopify development command. The web process starts React Router directly so Prisma CLI setup does not block the app preview on every run.

### Create and display FAQs

1. In Shopify Admin, open **Product FAQ Manager**.
2. Search by product title and choose **Manage FAQs**.
3. Add, edit, or delete FAQs. Questions are limited to 250 characters and answers to 5,000 characters. A product's serialized FAQ value is limited to 60 KB to stay below Shopify's metafield value limit.
4. In **Online Store → Themes → Customize**, open a product template.
5. Choose **Add block → Apps → Product FAQs**, position the block, set its heading options, and save.

See [the merchant storefront setup guide](docs/merchant-setup.md) for the short publishing workflow.

The extension is intended for Online Store 2.0 themes and product sections that support app blocks. Older themes without app-block support need to be upgraded or replaced; the app never edits theme files.

## Data and privacy

FAQ content remains in Shopify on the product as app-owned metafield data. Shopify's app installation session is stored in the configured Prisma database. The app does not store FAQ content in that database, collect customer information, or include analytics or tracking.

The app subscribes to `customers/data_request`, `customers/redact`, and `shop/redact`. Customer data request/redaction webhooks are authenticated and acknowledged because no customer data is collected. On shop redaction and app uninstall, stored Shopify sessions for that shop are removed. FAQ content is held by Shopify and follows Shopify's product/app data lifecycle.

## Commands

- `npm run dev` — Shopify CLI development environment
- `npm run build` — production React Router build
- `npm run lint` — ESLint
- `npm run typecheck` — React Router type generation and TypeScript checking
- `npm test` — FAQ data and Shopify GraphQL error handling unit tests
- `npm run deploy` — deploy app configuration and extensions through Shopify CLI

## Deployment

1. Move the Prisma session store to a durable production database, update the Prisma datasource and migrations for that database, and run `npm run setup` as part of deployment. The checked-in SQLite setup is for local development and is not a production database plan.
2. Set the production Shopify app URL, auth redirect URL, credentials, and database connection in the hosting environment / linked Shopify app configuration. The sample `https://example.com` values in `shopify.app.toml` are placeholders and must be replaced before production deployment.
3. Keep HTTPS enabled and do not expose access tokens or secrets to browser code.
4. Build and deploy the server with `npm run build` and `npm run start` (or the provided Docker setup).
5. Run `npm run deploy` to publish the `write_products` scope, app-owned metafield definition, webhook subscriptions, and Theme App Extension. Shopify app configuration changes only reach production after deployment.
6. Install/update the app on a development store and check the embedded dashboard, product CRUD, webhooks, and block rendering before release.

Public App Store distribution additionally requires current policy, privacy-policy, support, and listing details in the Dev Dashboard, production monitoring, and review against Shopify's latest submission checklist.

## Troubleshooting

- **App asks to reinstall or authorize again:** confirm the deployed app has `write_products` and reinstall/reauthorize after scope changes.
- **No product results:** search uses product titles. Confirm the product exists and the app has product access.
- **FAQ block is missing:** deploy the Theme App Extension, open an Online Store 2.0 product template, and add the app block from the Apps picker.
- **FAQs do not render:** confirm the selected product has saved FAQs and the theme preview is using that product. The block intentionally renders nothing when no valid FAQs exist.
- **Development database errors:** run `npm run setup` and confirm the configured database is writable.
- **Proxy `ECONNREFUSED` during development:** confirm `node --version` is on the project's supported LTS version, stop duplicate dev sessions with Ctrl+C, and start one `npm run dev` session. If Shopify still refuses the local target, check that the exact port in the proxy error has a listening app server with `lsof -nP -iTCP:<port> -sTCP:LISTEN`; read the React Router startup error above the proxy message if it has no listener.

## Architecture decision

FAQ data is stored as a JSON array in one app-owned metafield per product. This keeps content native to Shopify, associates data with the product lifecycle, requires only the product scope, and lets Liquid render FAQs without a storefront API call or client-side JavaScript. Prisma remains solely for Shopify session storage. Product FAQ data should be migrated to referenced metaobjects if future use cases need independently searchable/translated FAQ records, but that complexity is not needed for the focused product-level workflow.
