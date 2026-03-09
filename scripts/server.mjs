import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = normalize(join(fileURLToPath(new URL("..", import.meta.url))));

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function resolvePath(urlPathname) {
  const pathname = decodeURIComponent(urlPathname === "/" ? "/app.html" : urlPathname);
  const fullPath = normalize(join(projectRoot, pathname));
  if (!fullPath.startsWith(projectRoot)) {
    throw new Error("Path fora da raiz do projeto.");
  }
  return fullPath;
}

export function startStaticServer(port = 4173) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
      const filePath = resolvePath(pathname);
      const contents = await readFile(filePath);
      response.writeHead(200, {
        "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(contents);
    } catch (_error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      resolve({
        port: resolvedPort,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startStaticServer(Number(process.env.PORT || 4173))
    .then(({ port }) => {
      console.log(`Static server running on http://127.0.0.1:${port}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
