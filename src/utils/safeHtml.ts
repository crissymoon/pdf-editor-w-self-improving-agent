const FORBIDDEN_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta']);

function sanitizeNode(node: Element): void {
  const tag = node.tagName.toLowerCase();
  if (FORBIDDEN_TAGS.has(tag)) {
    node.remove();
    return;
  }

  const attrs = Array.from(node.attributes);
  for (const attr of attrs) {
    const attrName = attr.name.toLowerCase();
    const value = attr.value.trim().toLowerCase();

    if (attrName.startsWith('on')) {
      node.removeAttribute(attr.name);
      continue;
    }

    if ((attrName === 'src' || attrName === 'href' || attrName === 'xlink:href') && value.startsWith('javascript:')) {
      node.removeAttribute(attr.name);
    }
  }

  const children = Array.from(node.children);
  for (const child of children) {
    sanitizeNode(child);
  }
}

function parseSanitizedFragment(html: string): DocumentFragment {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');

  for (const child of Array.from(parsed.body.children)) {
    sanitizeNode(child);
  }

  const fragment = document.createDocumentFragment();
  while (parsed.body.firstChild) {
    fragment.appendChild(parsed.body.firstChild);
  }
  return fragment;
}

export function setSanitizedHtml(element: Element, html: string): void {
  const fragment = parseSanitizedFragment(html);
  element.replaceChildren(fragment);
}

export function appendSanitizedHtml(element: Element, html: string): void {
  const fragment = parseSanitizedFragment(html);
  element.appendChild(fragment);
}
