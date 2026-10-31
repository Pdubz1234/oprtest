import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("public");
http
  .createServer(async (req, res) => {
    try {
      const file = path.resolve(
        root,
        "." +
          new URL(req.url, "http://localhost").pathname.replace(
            /\/$/,
            "/index.html",
          ),
      );
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const data = await readFile(file);
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "text/javascript",
          ".svg": "image/svg+xml",
        }[path.extname(file)] || "application/octet-stream",
      );
      res.end(data);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(3000, () => console.log("War Table: http://localhost:3000"));
