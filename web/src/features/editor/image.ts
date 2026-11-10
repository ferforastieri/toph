/** Raster formats the editor can preview in place of a text buffer. */
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "ico",
  "tif",
  "tiff",
]);

/** SVG stays a text file so it can still be edited. */
export function isImagePath(path?: string | null): boolean {
  if (!path) return false;
  const name = path.split(/[?#]/)[0].split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}
