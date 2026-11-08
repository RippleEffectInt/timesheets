export const TENANT = "813ee105-1291-48e6-9381-e535253a68be";
export const CLIENT = "54b64b90-4ca1-463b-8290-8b285d5df68c";
export const SPA = "9595233b-3183-4568-8604-a194530e7fb6";
export const SITE =
  "sendacow.sharepoint.com,2c574b9f-89f9-4f00-891b-bf4e1fd323ba,d1a7ccda-58d6-43cb-95a1-db25fdc34591";
export const LISTS = {
  staff: "e05112dd-0859-46a0-89e9-8065557663b0",
  projects: "9de3faa8-5c35-4110-acc2-bd1946f4d735",
  timesheets: "411e501e-4963-4864-882c-a7a3daa11813",
};
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
