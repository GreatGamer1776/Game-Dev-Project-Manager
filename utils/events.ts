// Window-level events that let shell panels talk to the active editor
// without prop-drilling through the lazy editor boundary.

/** The outline asks the document editor to scroll to a heading. */
export const REVEAL_HEADING_EVENT = 'gdpm:reveal-heading';

export interface RevealHeadingDetail {
  fileId: string;
  /** Index among the document's headings. */
  index: number;
  /** 0-based source line. */
  line: number;
  text: string;
}

/** Ask the document editor showing `fileId` to insert text at the cursor (templates). */
export const INSERT_TEXT_EVENT = 'gdpm:insert-text';

export interface InsertTextDetail {
  fileId: string;
  text: string;
}
