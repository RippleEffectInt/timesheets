/** Intentionally fail-closed integration seam. No tenant, credentials, network calls or lists assumed.
 * Implement get/list/put per docs/INTEGRATION.md after schema and permissions are confirmed.
 */
export class SharePointRepository {
  async get(_key) {
    throw new Error("SharePoint adapter is not configured.");
  }
  async list() {
    throw new Error("SharePoint adapter is not configured.");
  }
  async put(_record, _expectedRevision) {
    throw new Error("SharePoint adapter is not configured.");
  }
}
