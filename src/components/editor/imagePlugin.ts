// <ID> Image paste and inline rendering plugin for CodeMirror
import {
  ViewPlugin,
  Decoration,
  WidgetType,
  EditorView,
} from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { Range } from '@codemirror/state';
import { Facet } from '@codemirror/state';
import { convertFileSrc } from '@tauri-apps/api/core';
import { mkdir, writeFile, readFile } from '@tauri-apps/plugin-fs';
import { readImage } from '@tauri-apps/plugin-clipboard-manager';
import { v4 as uuidv4 } from 'uuid';
import { debugLog } from '../../utils/debugLogger';

// Facet to pass the note file path to the plugin
export const noteFilePath = Facet.define<string, string>({
  combine: (values) => values[values.length - 1] ?? '',
});

// Helper to get attachments folder path from note path
function getAttachmentsFolderPath(notePath: string): string {
  // Remove .md extension and add .attachments
  return notePath.replace(/\.md$/, '.attachments');
}

// Helper to get the basename of the attachments folder for markdown reference
function getAttachmentsFolderBasename(notePath: string): string {
  const fullPath = getAttachmentsFolderPath(notePath);
  const parts = fullPath.split(/[/\\]/);
  return parts[parts.length - 1];
}

// Helper to get file extension from MIME type
function getExtensionFromMime(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
  };
  return mimeToExt[mimeType] || 'png';
}

// Save image data to attachments folder
async function saveImageToAttachments(
  imageData: Uint8Array,
  notePath: string,
  extension: string = 'png'
): Promise<string | null> {
  try {
    const attachmentsFolder = getAttachmentsFolderPath(notePath);
    const attachmentsBasename = getAttachmentsFolderBasename(notePath);
    const filename = `image-${uuidv4()}.${extension}`;
    const fullPath = `${attachmentsFolder}/${filename}`;

    // Create attachments folder if it doesn't exist
    try {
      await mkdir(attachmentsFolder, { recursive: true });
    } catch {
      // Folder might already exist
    }

    // Write image data to disk
    await writeFile(fullPath, imageData);

    // Return relative path for markdown
    return `${attachmentsBasename}/${filename}`;
  } catch (error) {
    debugLog.error('Failed to save image:', error);
    return null;
  }
}

// Try to get image from clipboard using Tauri plugin
async function getClipboardImage(): Promise<Uint8Array | null> {
  try {
    const image = await readImage();
    if (image) {
      // Get RGBA data
      const rgba = await image.rgba();
      
      // Get dimensions - try size() method or size property
      let width: number | undefined;
      let height: number | undefined;
      
      const imgAny = image as unknown as Record<string, unknown>;
      if (typeof imgAny.size === 'function') {
        const size = await (imgAny.size as () => Promise<{width: number, height: number}>)();
        width = size.width;
        height = size.height;
      } else if (imgAny.size && typeof imgAny.size === 'object') {
        const size = imgAny.size as {width: number, height: number};
        width = size.width;
        height = size.height;
      }
      
      if (rgba && width && height) {
        return await rgbaToPng(rgba, width, height);
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Convert RGBA data to PNG using canvas
async function rgbaToPng(
  rgba: Uint8Array,
  width: number,
  height: number
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(imageData, 0, 0);
  
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });
  
  return new Uint8Array(await blob.arrayBuffer());
}

// Paste handler as a ViewPlugin with event handlers
const pasteHandlerPlugin = ViewPlugin.fromClass(
  class {
    constructor() {}
    update() {}
  },
  {
    eventHandlers: {
      paste: (event: ClipboardEvent, view: EditorView) => {
        // Get the note file path from the facet
        const notePath = view.state.facet(noteFilePath);
        if (!notePath) {
          return false;
        }

        const clipboardData = event.clipboardData;
        
        // First try browser clipboard API (works on some platforms)
        if (clipboardData) {
          const items = Array.from(clipboardData.items || []);
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile();
              if (file) {
                event.preventDefault();
                file.arrayBuffer().then(async (buffer) => {
                  const relativePath = await saveImageToAttachments(
                    new Uint8Array(buffer),
                    notePath,
                    getExtensionFromMime(file.type)
                  );
                  if (relativePath) {
                    const cursor = view.state.selection.main.head;
                    const imageMarkdown = `![](${relativePath})`;
                    view.dispatch({
                      changes: { from: cursor, insert: imageMarkdown },
                      selection: { anchor: cursor + imageMarkdown.length },
                    });
                  }
                });
                return true;
              }
            }
          }
          
          // Check files too
          const files = Array.from(clipboardData.files || []);
          for (const file of files) {
            if (file.type.startsWith('image/')) {
              event.preventDefault();
              file.arrayBuffer().then(async (buffer) => {
                const relativePath = await saveImageToAttachments(
                  new Uint8Array(buffer),
                  notePath,
                  getExtensionFromMime(file.type)
                );
                if (relativePath) {
                  const cursor = view.state.selection.main.head;
                  const imageMarkdown = `![](${relativePath})`;
                  view.dispatch({
                    changes: { from: cursor, insert: imageMarkdown },
                    selection: { anchor: cursor + imageMarkdown.length },
                  });
                }
              });
              return true;
            }
          }
          
          // If clipboard has text data, let default handler process it
          if (clipboardData.types.includes('text/plain')) {
            return false;
          }
        }

        // Browser clipboard empty or no text - try Tauri clipboard for images
        // This is async so we prevent default optimistically
        event.preventDefault();
        
        getClipboardImage().then(async (imageData) => {
          if (!imageData) {
            // No image found - we already prevented default, so manually paste text
            try {
              const text = await navigator.clipboard.readText();
              if (text) {
                const cursor = view.state.selection.main.head;
                view.dispatch({
                  changes: { from: cursor, insert: text },
                  selection: { anchor: cursor + text.length },
                });
              }
            } catch {
              // Clipboard read failed, nothing we can do
            }
            return;
          }

          // Save image and insert markdown
          const relativePath = await saveImageToAttachments(imageData, notePath, 'png');
          if (relativePath) {
            const cursor = view.state.selection.main.head;
            const imageMarkdown = `![](${relativePath})`;
            view.dispatch({
              changes: { from: cursor, insert: imageMarkdown },
              selection: { anchor: cursor + imageMarkdown.length },
            });
          }
        }).catch((err) => {
          debugLog.error('[imagePlugin] Error handling paste:', err);
        });

        return true;
      },
    },
  }
);

// Widget to render inline images
class ImageWidget extends WidgetType {
  src: string;
  alt: string;
  notePath: string;

  constructor(src: string, alt: string, notePath: string) {
    super();
    this.src = src;
    this.alt = alt;
    this.notePath = notePath;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-image-widget';

    const img = document.createElement('img');
    img.alt = this.alt;
    img.className = 'cm-inline-image';

    // Resolve the image path
    if (this.src.startsWith('data:') || this.src.startsWith('http')) {
      // Data URL or absolute URL
      img.src = this.src;
    } else {
      // Relative path - resolve against note's parent directory
      // Handle both Windows (\) and Unix (/) path separators
      const lastSepIndex = Math.max(this.notePath.lastIndexOf('/'), this.notePath.lastIndexOf('\\'));
      const noteDir = lastSepIndex > 0 ? this.notePath.substring(0, lastSepIndex) : '';
      const sep = this.notePath.includes('\\') ? '\\' : '/';
      const absolutePath = `${noteDir}${sep}${this.src}`;
      
      // Try asset protocol first, fallback to reading file as data URL
      const assetUrl = convertFileSrc(absolutePath);
      img.src = assetUrl;
      
      // If asset protocol fails, try reading the file directly
      img.onerror = () => {
        // Read file and convert to data URL
        readFile(absolutePath).then((data) => {
          const ext = absolutePath.split('.').pop()?.toLowerCase() || 'png';
          const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                          ext === 'gif' ? 'image/gif' : 
                          ext === 'webp' ? 'image/webp' : 
                          ext === 'svg' ? 'image/svg+xml' : 'image/png';
          const base64 = btoa(String.fromCharCode(...data));
          img.src = `data:${mimeType};base64,${base64}`;
        }).catch(() => {
          wrapper.className = 'cm-image-widget cm-image-error';
          wrapper.textContent = `[Image not found: ${this.src}]`;
        });
      };
    }

    wrapper.appendChild(img);
    return wrapper;
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// Create decorations for images in the document
function imageDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = view.state.doc;
  const notePath = view.state.facet(noteFilePath);

  if (!notePath) return Decoration.none;

  // Match markdown image syntax: ![alt](src)
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const pos = line.from + match.index;
      const end = pos + match[0].length;
      const alt = match[1];
      const src = match[2];

      // Add widget decoration after the image markdown
      decorations.push(
        Decoration.widget({
          widget: new ImageWidget(src, alt, notePath),
          side: 1,
        }).range(end)
      );
    }
  }

  return Decoration.set(decorations, true);
}

// View plugin for rendering images
export const imageViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = imageDecorations(view);
    }

    update(update: ViewUpdate) {
      // Only regenerate decorations when document changes or note changes
      // Don't regenerate on viewport changes (scrolling) for performance
      if (
        update.docChanged ||
        update.state.facet(noteFilePath) !==
          update.startState.facet(noteFilePath)
      ) {
        this.decorations = imageDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// Theme for image widgets
export const imageTheme = EditorView.baseTheme({
  '.cm-image-widget': {
    display: 'block',
    margin: '8px 0',
    lineHeight: '0',
  },
  '.cm-inline-image': {
    maxWidth: '100%',
    maxHeight: '50vh',
    objectFit: 'contain',
    borderRadius: '4px',
    display: 'block',
  },
  '.cm-image-error': {
    color: '#f38ba8',
    fontStyle: 'italic',
    fontSize: '0.9em',
    lineHeight: 'normal',
  },
});

// Combined extension for image handling
export function imagePlugin(filePath: string) {
  return [
    noteFilePath.of(filePath),
    pasteHandlerPlugin,
    imageViewPlugin,
    imageTheme,
  ];
}
