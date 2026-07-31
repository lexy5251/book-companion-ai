import sanitizeHtml from "sanitize-html";

// Chapter.contentHtml is XHTML lifted verbatim from a user-uploaded EPUB, and
// the reader injects it via dangerouslySetInnerHTML. Sanitize it server-side so
// a malicious (or just messy) EPUB can't run scripts or smuggle in event
// handlers. We keep the semantic/structural tags that matter for reading and
// drop anything interactive.
const READER_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr", "div", "span", "section", "article", "header", "footer",
    "blockquote", "cite", "q",
    "ul", "ol", "li", "dl", "dt", "dd",
    "em", "strong", "i", "b", "u", "s", "small", "sub", "sup", "mark",
    "a", "img", "figure", "figcaption",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
    "pre", "code",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["id", "class", "lang", "dir"],
  },
  // EPUB internal links (href/src) point at other files inside the archive and
  // resolve to nothing here, but keeping http(s) links live is useful (e.g. the
  // Project Gutenberg links in the front matter). Block javascript: etc.
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  // Force external links to open safely.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer",
      target: "_blank",
    }),
  },
};

/** Sanitize a chapter's stored HTML fragment for safe rendering in the reader. */
export function sanitizeChapterHtml(html: string): string {
  return sanitizeHtml(html, READER_OPTIONS);
}
