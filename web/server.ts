import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import getBibleVersions from "../functions/getBibleVersions";

const PORT = 3000;
const ROOT_DIR = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES: { [key: string]: string } = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
};

const server = http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  const parsedUrl = url.parse(req.url || "", true);
  const pathname = parsedUrl.pathname || "/";

  // API Endpoints
  if (pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");

    try {
      if (pathname === "/api/versions") {
        // Load versions from individual _version.json files
        const versions = getBibleVersions();
        res.writeHead(200);
        res.end(JSON.stringify(versions));
        return;
      }

      if (pathname === "/api/books") {
        const data = fs.readFileSync(
          path.join(ROOT_DIR, "bible-books", "bible-books.json"),
          "utf-8"
        );
        res.writeHead(200);
        res.end(data);
        return;
      }

      // /api/content/:version/:bookId
      const contentMatch = pathname.match(
        /^\/api\/content\/([^\/]+)\/([^\/]+)$/
      );
      if (contentMatch) {
        const version = contentMatch[1];
        const bookId = contentMatch[2];

        // We need to find the filename. It usually starts with order number.
        // Search the directory to find the matching book file.
        const versionDir = path.join(ROOT_DIR, "bible-versions", version);

        if (!fs.existsSync(versionDir)) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Version not found" }));
          return;
        }

        const files = fs.readdirSync(versionDir);
        const bookFile = files.find(
          (f) => f.includes(`-${bookId}.json`) || f === `${bookId}.json`
        ); // Handle 01-GEN.json or GEN.json

        if (bookFile) {
          const data = fs.readFileSync(
            path.join(versionDir, bookFile),
            "utf-8"
          );
          res.writeHead(200);
          res.end(data);
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Book not found in this version" }));
        }
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "API endpoint not found" }));
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
    return;
  }

  // Static Files
  let filePath = path.join(
    PUBLIC_DIR,
    pathname === "/" ? "index.html" : pathname
  );

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404);
        res.end("File not found");
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
