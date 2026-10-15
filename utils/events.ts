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
