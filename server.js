/**
 * Ultra-Optimized Media Server
 * Features: Chunked Video Streaming, On-the-fly Image Optimization, Disk Caching, TV Show Grouping
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp"); // npm install sharp
const mime = require("mime");   // npm install mime
const cors = require("cors");

// Optional .env support (safe if dependency isn't installed yet)
try {
  // eslint-disable-next-line global-require
  require("dotenv").config();
} catch {}

const app = express();
const PORT = Number.parseInt(process.env.PORT || "4000", 10);

// === CONFIG ===
// On Raspberry Pi / Linux this is typically something like: /media/<user>/<driveLabel>
// On Windows you might use something like: G:/ or D:/Media
const DEFAULT_ROOT =
  process.platform === "win32" ? "G:/" : "/media/davids11971/VAULT";

const MEDIA_ROOTS_RAW =
  process.env.MEDIA_ROOTS ||
  process.env.MEDIA_ROOT ||
  process.env.ROOT_DIR ||
  DEFAULT_ROOT;

const FOLDERS = (process.env.MEDIA_FOLDERS || "Photos,Videos,Movies,TVShows,Documents")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Max chunk size for video streaming (default 1MB)
const VIDEO_CHUNK_SIZE = Number.parseInt(
  process.env.VIDEO_CHUNK_SIZE || String(1 * 1024 * 1024),
  10
);

const THUMB_CACHE = path.resolve(
  process.env.THUMB_CACHE_DIR || path.join(__dirname, "thumbcache")
);

const ALLOWED_EXTS = [
  ".mp4", ".mov", ".avi", ".mkv", 
  ".jpg", ".jpeg", ".png", ".gif", ".webp"
];

app.use(cors());

// --- Helpers ---
function isVideo(file) {
  return [".mp4", ".mov", ".avi", ".mkv"].includes(path.extname(file).toLowerCase());
}

function getMimeType(filePath, fallback = "application/octet-stream") {
  if (typeof mime.getType === "function") return mime.getType(filePath) || fallback;
  if (typeof mime.lookup === "function") return mime.lookup(filePath) || fallback;
  return fallback;
}

function parseRoots(rootsRaw) {
  return String(rootsRaw || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function slugifyId(s) {
  const cleaned = String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "root";
}

const MEDIA_ROOTS = (() => {
  const roots = parseRoots(MEDIA_ROOTS_RAW);
  const used = new Set();

  return roots.map((rootPath, idx) => {
    const base = slugifyId(path.basename(rootPath) || `root${idx}`);
    let id = base;
    let n = 2;
    while (used.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    used.add(id);

    const abs = path.resolve(rootPath);
    return { id, rootPath, abs };
  });
})();

function resolveVirtualMediaPath(virtualPath) {
  const normalized = String(virtualPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (!normalized) return null;

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  // Preferred format: "<rootId>/<relativePathWithinRoot>"
  const maybeRootId = parts[0];
  const directRoot = MEDIA_ROOTS.find((r) => r.id === maybeRootId);

  let chosenRoot = directRoot;
  let relativeWithinRoot = parts.slice(1).join("/");

  // Backward-compat: if only one root is configured, allow paths without "<rootId>/..."
  if (!chosenRoot && MEDIA_ROOTS.length === 1) {
    chosenRoot = MEDIA_ROOTS[0];
    relativeWithinRoot = parts.join("/");
  }

  if (!chosenRoot) return null;

  const candidateAbs = path.resolve(chosenRoot.abs, relativeWithinRoot);
  const rootPrefix = chosenRoot.abs.endsWith(path.sep)
    ? chosenRoot.abs
    : `${chosenRoot.abs}${path.sep}`;

  // Prevent path traversal outside the configured root
  if (candidateAbs !== chosenRoot.abs && !candidateAbs.startsWith(rootPrefix)) {
    return null;
  }

  const virtualKey = directRoot
    ? `${chosenRoot.id}/${relativeWithinRoot}`
    : `${chosenRoot.id}/${relativeWithinRoot}`;

  return { absPath: candidateAbs, virtualKey };
}

// --- Scanner ---
function scanFolder(rootFolderPath, { rootId, rootAbs }) {
  const items = [];
  
  // We need to know which top-level category we are scanning (e.g., "TVShows")
  const categoryName = path.basename(rootFolderPath);

  function walk(currentPath) {
    let files;
    try { files = fs.readdirSync(currentPath); } catch { return; }

    for (const f of files) {
      if (f.startsWith("$") || f.startsWith(".")) continue;
      const fullPath = path.join(currentPath, f);
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (ALLOWED_EXTS.includes(path.extname(f).toLowerCase())) {
        const relWithinRoot = path.relative(rootAbs, fullPath).replace(/\\/g, "/");
        const virtualPath = `${rootId}/${relWithinRoot}`;
        
        // Calculate the "Show Name" for TVShows
        // If path is TVShows/TheOffice/S01E01.mp4, parentDir is "TheOffice"
        let groupName = null;
        if (categoryName === "TVShows") {
            const relFromCategory = path.relative(rootFolderPath, fullPath);
            const parts = relFromCategory.split(path.sep);
            if (parts.length > 1) {
                groupName = parts[0]; // "TheOffice"
            } else {
                groupName = "Uncategorized";
            }
        }

        items.push({
          name: f,
          type: isVideo(f) ? "video" : "image",
          path: virtualPath,
          root: rootId,
          group: groupName, // Used for TV Show grouping
          size: stat.size,
          modified: stat.mtimeMs,
        });
      }
    }
  }
  walk(rootFolderPath);
  return items;
}

// --- Routes ---

app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    port: PORT,
    roots: MEDIA_ROOTS.map((r) => ({ id: r.id, path: r.rootPath })),
    folders: FOLDERS,
  });
});

// 1. API List
app.get("/api/media", (req, res) => {
  const result = {};
  for (const folder of FOLDERS) {
    const combined = [];
    for (const root of MEDIA_ROOTS) {
      const fullPath = path.join(root.abs, folder);
      if (fs.existsSync(fullPath)) {
        combined.push(...scanFolder(fullPath, { rootId: root.id, rootAbs: root.abs }));
      }
    }
    result[folder] = combined;
  }
  res.json(result);
});

// 2. Thumbnails (Cached, 600px, Low Quality)
if (!fs.existsSync(THUMB_CACHE)) fs.mkdirSync(THUMB_CACHE, { recursive: true });

app.get("/thumb/*", async (req, res) => {
  const rel = req.params[0];
  const resolved = resolveVirtualMediaPath(rel);
  if (!resolved) return res.status(400).send("Bad path");
  const srcPath = resolved.absPath;
  
  if (!fs.existsSync(srcPath)) return res.status(404).end();
  // Return cached if exists
  const thumbFile = path.join(
    THUMB_CACHE,
    resolved.virtualKey.replace(/[\\/]/g, "_") + ".jpg"
  );
  if (fs.existsSync(thumbFile)) {
    res.setHeader("Cache-Control", "public, max-age=604800"); 
    return res.sendFile(thumbFile);
  }

  // Generate
  try {
    if (isVideo(srcPath)) return res.status(400).send("No video thumbs");
    
    await sharp(srcPath)
      .rotate()
      .resize({ width: 600, withoutEnlargement: true }) 
      .jpeg({ quality: 60 })
      .toFile(thumbFile);
      
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.sendFile(thumbFile);
  } catch (err) {
    // console.error("Thumb error:", err); // Suppress video thumb errors
    res.status(500).end();
  }
});

// 3. Optimized View (For Fullscreen Phone - 1920px, High Quality)
app.get("/view/*", async (req, res) => {
  const rel = req.params[0];
  const resolved = resolveVirtualMediaPath(rel);
  if (!resolved) return res.status(400).send("Bad path");
  const srcPath = resolved.absPath;

  if (!fs.existsSync(srcPath)) return res.status(404).end();
  if (isVideo(srcPath)) return res.redirect(`/stream/${rel}`);

  try {
    const transform = sharp(srcPath)
      .rotate()
      .resize({ width: 1920, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true });

    res.type("image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    transform.pipe(res);
  } catch (err) {
    fs.createReadStream(srcPath).pipe(res);
  }
});

// 4. Optimized Video Stream (Strict Chunking)
app.get("/stream/*", (req, res) => {
  const rel = req.params[0];
  const resolved = resolveVirtualMediaPath(rel);
  if (!resolved) return res.status(400).send("Bad path");
  const filePath = resolved.absPath;
  
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const mimeType = getMimeType(filePath, "video/mp4");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + VIDEO_CHUNK_SIZE, fileSize - 1);
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": mimeType,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": mimeType,
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// 5. Raw Download
app.get("/media/*", (req, res) => {
  const rel = req.params[0];
  const resolved = resolveVirtualMediaPath(rel);
  if (!resolved) return res.status(400).send("Bad path");
  const filePath = resolved.absPath;
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).end();
});

// Listen
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Optimized Media Server running on http://0.0.0.0:${PORT}`)
);