/** Map of filename -> file contents. V1 uses single "index.html" key.
 *  Future-proofs for multi-file projects (multi-page sites, CSS/JS separation, full-stack). */
export type ProjectFiles = Record<string, string>;
