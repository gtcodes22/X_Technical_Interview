// Netlify Blobs site-wide stores are shared by every deploy context (production,
// deploy previews, branch deploys, local dev). Prefixing store names with the context
// keeps preview traffic out of the production handover queue. See OPERATIONS.md §1.2.

const STORE_NAME_MAX = 64; // Netlify limit, in bytes

/** e.g. storeName("conversations", "deploy-preview") → "deploy-preview-conversations" */
export function storeName(base: string, deployContext: string | undefined): string {
  const context = sanitise(deployContext || "dev");
  const name = `${context}-${sanitise(base)}`;
  if (name.length > STORE_NAME_MAX) {
    throw new Error(`Store name too long (${name.length} > ${STORE_NAME_MAX}): ${name}`);
  }
  return name;
}

// Store names may not contain "/" or ":"; keep them to a safe, readable charset.
function sanitise(part: string): string {
  return part.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}
