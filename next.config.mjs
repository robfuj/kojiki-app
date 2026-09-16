/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Both parsers probe for browser or native APIs while they evaluate. Bundled,
  // those probes fail (pdfjs-dist cannot find @napi-rs/canvas and then throws on
  // an undefined DOMMatrix); required from node_modules at runtime they load
  // cleanly, so they are kept out of the server bundle.
  serverExternalPackages: ['pdf-parse', 'mammoth'],
}

export default nextConfig
