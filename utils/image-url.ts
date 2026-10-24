export function resolveImageUrl(src: string): string {
  const cdnOrigin = process.env.NEXT_PUBLIC_CDN_ORIGIN?.replace(/\/+$/, "");
  return cdnOrigin && src.startsWith("/cdn/")
    ? `${cdnOrigin}${src}`
    : src;
}
