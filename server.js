/**
 * Ultra-Optimized Media Server
 * Features: Chunked Video Streaming, On-the-fly Image Optimization, Disk Caching, TV Show Grouping
 */

const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp"); // npm install sharp
const mime = require("mime");   // npm install mime
const cors = require("cors");


const app = express();
// Avoid conditional GET 304s on JSON endpoints (some clients/fetch flows expect a body every time)
app.set("etag", false);

// === LOGGING / DEBUG ===
const LOG_LEVEL = "info";
const LOG_REQUESTS = true;
const LOG_SCAN = true;      // Keep this true to see file detection logs
const LOG_THUMBS = true;    // Useful for checking if sharp is working
const DEBUG_ENDPOINTS = false;
const REQUEST_TIMEOUT_MS = 0; // 0 = disabled

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
function shouldLog(level) {
  const cur = LEVELS[LOG_LEVEL] ?? LEVELS.info;
  const want = LEVELS[level] ?? LEVELS.info;
  return want <= cur;
}
function safeJson(obj) {
  try { return JSON.stringify(obj); } catch { return "\"<unserializable>\""; }
}
function log(level, msg, meta) {
  if (!shouldLog(level)) return;
  const line = meta ? `${msg} ${safeJson(meta)}` : msg;
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}
function redactHeaders(headers) {
  const h = { ...(headers || {}) };
  for (const k of Object.keys(h)) {
    if (String(k).toLowerCase() === "authorization") h[k] = "<redacted>";
    if (String(k).toLowerCase() === "cookie") h[k] = "<redacted>";
  }
  return h;
}
function getClientIp(req) {
  const xfwd = req.headers["x-forwarded-for"];
  if (xfwd) return String(xfwd).split(",")[0].trim();
  return req.socket?.remoteAddress || req.ip;
}
function newRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function hrMs(start) {
  const diff = process.hrtime.bigint() - start;
  return Number(diff / 1000000n);
}

// Optional timeout (helps catch hung requests)
if (REQUEST_TIMEOUT_MS > 0) {
  app.use((req, res, next) => {
    res.setTimeout(REQUEST_TIMEOUT_MS, () => {
      const rid = req.requestId || "<no-rid>";
      log("warn", "[timeout] request exceeded timeout", { rid, ms: REQUEST_TIMEOUT_MS, method: req.method, url: req.originalUrl });
      try { res.status(408).json({ error: "Request timeout", requestId: rid, ms: REQUEST_TIMEOUT_MS }); } catch {}
    });
    next();
  });
}

// Request ID + request logging
app.use((req, res, next) => {
  req.requestId = req.headers["x-request-id"] ? String(req.headers["x-request-id"]) : newRequestId();
  res.setHeader("x-request-id", req.requestId);

  if (!LOG_REQUESTS) return next();

  const start = process.hrtime.bigint();
  const ip = getClientIp(req);
  const baseMeta = {
    rid: req.requestId,
    ip,
    method: req.method,
    url: req.originalUrl,
    ua: req.headers["user-agent"],
  };

  if (LOG_REQUEST_HEADERS) {
    log("debug", "[http] request headers", { ...baseMeta, headers: redactHeaders(req.headers) });
  } else {
    log("info", "[http] request", baseMeta);
  }

  res.on("finish", () => {
    const ms = hrMs(start);
    const meta = { ...baseMeta, status: res.statusCode, ms };
    if (LOG_RESPONSE_HEADERS) meta.resHeaders = redactHeaders(res.getHeaders());
    log(res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info", "[http] response", meta);
  });

  next();
});

// === HARDCODED CONFIG ===

const PORT = 4000;

const HOST = "0.0.0.0";



// Automatically choose the path based on the Operating System

const MEDIA_ROOT = process.platform === "win32"

  ? "G:/"                            // Your Windows Drive

  : "/media/davids11971/VAULT";      // Your Raspberry Pi Drive



const FOLDERS = ["Photos", "Videos", "Movies", "TVShows", "Documents"];

const VIDEO_CHUNK_SIZE = 1024 * 1024; // 1MB

const ALLOWED_EXTS = [".mp4", ".mov", ".avi", ".mkv", ".jpg", ".jpeg", ".png", ".gif", ".webp"];



// Force MEDIA_ROOTS to use the hardcoded MEDIA_ROOT

const MEDIA_ROOTS = [{

  id: "vault",

  rootPath: MEDIA_ROOT,

  abs: path.resolve(MEDIA_ROOT)

}];

// THUMB_CACHE is configured after MEDIA_ROOTS is computed (so we can default it under the VAULT root).

app.use(
  cors({
    origin: (origin, cb) => {
      if (LOG_CORS) log("debug", "[cors] origin check", { origin });
      cb(null, true); // allow all (current behavior)
    },
    credentials: false,
  })
);

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

function ensureWritableDir(preferredPath, fallbackPath) {
  const prefer = path.resolve(preferredPath);
  try {
    if (!fs.existsSync(prefer)) fs.mkdirSync(prefer, { recursive: true });
    fs.accessSync(prefer, fs.constants.W_OK);
    return prefer;
  } catch (err) {
    const fallback = path.resolve(fallbackPath);
    try {
      if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
      fs.accessSync(fallback, fs.constants.W_OK);
      // eslint-disable-next-line no-console
      console.warn(
        `[thumbcache] Cannot use "${prefer}" (${err?.code || err}). Falling back to "${fallback}".`
      );
      return fallback;
    } catch (err2) {
      // eslint-disable-next-line no-console
      console.warn(
        `[thumbcache] Cannot use "${prefer}" and fallback "${fallback}" (${err2?.code || err2}). Thumbnails disabled.`
      );
      return null;
    }
  }
}

const DEFAULT_THUMB_CACHE_DIR = (() => {
  const primaryRoot = MEDIA_ROOTS[0]?.abs || __dirname;
  // Keep cache with the media volume by default (works great for your VAULT mount).
  return path.join(primaryRoot, ".mediaserver-cache", "thumbcache");
})();

const THUMB_CACHE = ensureWritableDir(
  process.env.THUMB_CACHE_DIR || DEFAULT_THUMB_CACHE_DIR,
  path.join(os.tmpdir(), "mediaserver-thumbcache")
);

function resolveVirtualMediaPath(virtualPath) {
  const normalized = String(virtualPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (!normalized) {
    if (LOG_RESOLVE) log("warn", "[resolve] empty path", { rid: "<unknown>" });
    return null;
  }

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

  if (!chosenRoot) {
    if (LOG_RESOLVE) log("warn", "[resolve] unknown rootId", { rootId: maybeRootId, parts, roots: MEDIA_ROOTS.map((r) => r.id) });
    return null;
  }

  const candidateAbs = path.resolve(chosenRoot.abs, relativeWithinRoot);
  const rootPrefix = chosenRoot.abs.endsWith(path.sep)
    ? chosenRoot.abs
    : `${chosenRoot.abs}${path.sep}`;

  // Prevent path traversal outside the configured root
  if (candidateAbs !== chosenRoot.abs && !candidateAbs.startsWith(rootPrefix)) {
    if (LOG_RESOLVE) log("warn", "[resolve] traversal blocked", { root: chosenRoot.id, candidateAbs, rootAbs: chosenRoot.abs });
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
    try { files = fs.readdirSync(currentPath); } catch (err) {
      if (LOG_SCAN) log("warn", "[scan] cannot read dir", { rootId, dir: currentPath, err: err?.code || String(err) });
      return;
    }

    for (const f of files) {
      if (f.startsWith("$") || f.startsWith(".")) continue;
      const fullPath = path.join(currentPath, f);
      let stat;
      try { stat = fs.statSync(fullPath); } catch (err) {
        if (LOG_SCAN) log("warn", "[scan] stat failed", { rootId, fullPath, err: err?.code || String(err) });
        continue;
      }

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
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    port: PORT,
    host: HOST,
    roots: MEDIA_ROOTS.map((r) => ({ id: r.id, path: r.rootPath })),
    folders: FOLDERS,
    logging: {
      level: LOG_LEVEL,
      requests: LOG_REQUESTS,
      requestHeaders: LOG_REQUEST_HEADERS,
      responseHeaders: LOG_RESPONSE_HEADERS,
      scan: LOG_SCAN,
      resolve: LOG_RESOLVE,
      cors: LOG_CORS,
      stream: LOG_STREAM,
      thumbs: LOG_THUMBS,
      debugEndpoints: DEBUG_ENDPOINTS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    },
  });
});

if (DEBUG_ENDPOINTS) {
  app.get("/debug/config", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      port: PORT,
      host: HOST,
      nodeEnv: process.env.NODE_ENV,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      cwd: process.cwd(),
      mediaRoots: MEDIA_ROOTS,
      folders: FOLDERS,
      thumbCache: THUMB_CACHE,
      videoChunkSize: VIDEO_CHUNK_SIZE,
      logging: {
        level: LOG_LEVEL,
        requests: LOG_REQUESTS,
        requestHeaders: LOG_REQUEST_HEADERS,
        responseHeaders: LOG_RESPONSE_HEADERS,
        scan: LOG_SCAN,
        resolve: LOG_RESOLVE,
        cors: LOG_CORS,
        stream: LOG_STREAM,
        thumbs: LOG_THUMBS,
        debugEndpoints: DEBUG_ENDPOINTS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
      },
      networkInterfaces: os.networkInterfaces(),
    });
  });

  app.get("/debug/routes", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const routes = [];
    // eslint-disable-next-line no-underscore-dangle
    for (const layer of app._router?.stack || []) {
      if (layer.route?.path) {
        routes.push({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods || {}).filter((m) => layer.route.methods[m]),
        });
      }
    }
    res.json({ count: routes.length, routes });
  });
}

// 1. API List
app.get("/api/media", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const started = process.hrtime.bigint();
  const result = {};
  for (const folder of FOLDERS) {
    const combined = [];
    for (const root of MEDIA_ROOTS) {
      const fullPath = path.join(root.abs, folder);
      if (fs.existsSync(fullPath)) {
        if (LOG_SCAN) log("info", "[api/media] scanning", { rid: req.requestId, root: root.id, folder, fullPath });
        combined.push(...scanFolder(fullPath, { rootId: root.id, rootAbs: root.abs }));
      } else if (LOG_SCAN) {
        log("debug", "[api/media] folder missing", { rid: req.requestId, root: root.id, folder, fullPath });
      }
    }
    result[folder] = combined;
  }
  if (LOG_SCAN) {
    log("info", "[api/media] scan complete", {
      rid: req.requestId,
      ms: hrMs(started),
      counts: Object.fromEntries(Object.entries(result).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])),
    });
  }
  res.json(result);
});

// 2. Thumbnails (Cached, 600px, Low Quality)
// (Directory is created/validated above; can be null if thumbs are disabled)

app.get("/thumb/*", async (req, res) => {
  if (!THUMB_CACHE) return res.status(503).send("Thumbnail cache unavailable");
  const rel = req.params[0];
  const resolved = resolveVirtualMediaPath(rel);
  if (!resolved) {
    if (LOG_THUMBS || LOG_RESOLVE) log("warn", "[thumb] bad path", { rid: req.requestId, rel });
    return res.status(400).send("Bad path");
  }
  const srcPath = resolved.absPath;
  
  if (!fs.existsSync(srcPath)) {
    if (LOG_THUMBS) log("warn", "[thumb] missing source", { rid: req.requestId, srcPath, rel });
    return res.status(404).end();
  }
  // Return cached if exists
  const thumbFile = path.join(
    THUMB_CACHE,
    resolved.virtualKey.replace(/[\\/]/g, "_") + ".jpg"
  );
  if (fs.existsSync(thumbFile)) {
    if (LOG_THUMBS) log("debug", "[thumb] cache hit", { rid: req.requestId, thumbFile, srcPath });
    res.setHeader("Cache-Control", "public, max-age=604800"); 
    return res.sendFile(thumbFile);
  }

  // Generate
  try {
    if (isVideo(srcPath)) return res.status(400).send("No video thumbs");
    if (LOG_THUMBS) log("info", "[thumb] generating", { rid: req.requestId, srcPath, thumbFile });
    
    await sharp(srcPath)
      .rotate()
      .resize({ width: 600, withoutEnlargement: true }) 
      .jpeg({ quality: 60 })
      .toFile(thumbFile);
      
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.sendFile(thumbFile);
  } catch (err) {
    log("error", "[thumb] error", { rid: req.requestId, srcPath, thumbFile, err: String(err) });
    res.status(500).end();
  }
});

// 3. Optimized View (For Fullscreen Phone - 1920px, High Quality)
app.get("/view/*", async (req, res) => {
  const rel = req.params[0];
  const resolved = resolveVirtualMediaPath(rel);
  if (!resolved) {
    if (LOG_RESOLVE) log("warn", "[view] bad path", { rid: req.requestId, rel });
    return res.status(400).send("Bad path");
  }
  const srcPath = resolved.absPath;

  if (!fs.existsSync(srcPath)) {
    log("warn", "[view] missing source", { rid: req.requestId, srcPath, rel });
    return res.status(404).end();
  }
  if (isVideo(srcPath)) return res.redirect(`/stream/${rel}`);

  try {
    if (LOG_THUMBS) log("debug", "[view] optimizing image", { rid: req.requestId, srcPath });
    const transform = sharp(srcPath)
      .rotate()
      .resize({ width: 1920, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true });

    res.type("image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    transform.pipe(res);
  } catch (err) {
    log("warn", "[view] sharp failed, sending original", { rid: req.requestId, srcPath, err: String(err) });
    fs.createReadStream(srcPath).pipe(res);
  }
});

// 4. Optimized Video Stream (Strict Chunking)
app.get("/stream/*", (req, res) => {
  const rel = req.params[0];
  const resolved = resolveVirtualMediaPath(rel);
  if (!resolved) {
    if (LOG_RESOLVE || LOG_STREAM) log("warn", "[stream] bad path", { rid: req.requestId, rel });
    return res.status(400).send("Bad path");
  }
  const filePath = resolved.absPath;
  
  if (!fs.existsSync(filePath)) {
    if (LOG_STREAM) log("warn", "[stream] missing file", { rid: req.requestId, filePath, rel });
    return res.status(404).end();
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const mimeType = getMimeType(filePath, "video/mp4");

  if (LOG_STREAM) {
    log("info", "[stream] request", {
      rid: req.requestId,
      filePath,
      size: fileSize,
      range: range || null,
      mime: mimeType,
    });
  }

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
  if (!resolved) {
    if (LOG_RESOLVE) log("warn", "[media] bad path", { rid: req.requestId, rel });
    return res.status(400).send("Bad path");
  }
  const filePath = resolved.absPath;
  if (fs.existsSync(filePath)) {
    log("info", "[media] sendFile", { rid: req.requestId, filePath });
    res.sendFile(filePath);
  } else {
    log("warn", "[media] missing file", { rid: req.requestId, filePath, rel });
    res.status(404).end();
  }
});

// Central error handler (last middleware)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log("error", "[express] unhandled error", {
    rid: req?.requestId,
    method: req?.method,
    url: req?.originalUrl,
    err: String(err?.stack || err),
  });
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal Server Error", requestId: req?.requestId });
});

// Listen
function getLanUrls({ host, port }) {
  const urls = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const family = net.family || net.address?.includes(":") ? "IPv6" : "IPv4";
      if (net.internal) continue;
      if (family !== "IPv4") continue; // keep output simple
      urls.push(`http://${net.address}:${port}`);
    }
  }
  // Always include what we actually bind to (useful for debugging)
  urls.unshift(`http://${host}:${port}`);
  return Array.from(new Set(urls));
}

app.listen(PORT, HOST, () => {
  const urls = getLanUrls({ host: HOST, port: PORT });
  // eslint-disable-next-line no-console
  log("info", "🚀 Optimized Media Server listening:", {
    host: HOST,
    port: PORT,
    nodeEnv: process.env.NODE_ENV,
    platform: process.platform,
    pid: process.pid,
    cwd: process.cwd(),
    mediaRoots: MEDIA_ROOTS,
    folders: FOLDERS,
    thumbCache: THUMB_CACHE,
    videoChunkSize: VIDEO_CHUNK_SIZE,
    logging: {
      level: LOG_LEVEL,
      requests: LOG_REQUESTS,
      requestHeaders: LOG_REQUEST_HEADERS,
      responseHeaders: LOG_RESPONSE_HEADERS,
      scan: LOG_SCAN,
      resolve: LOG_RESOLVE,
      cors: LOG_CORS,
      stream: LOG_STREAM,
      thumbs: LOG_THUMBS,
      debugEndpoints: DEBUG_ENDPOINTS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    },
  });
  for (const u of urls) console.log(`- ${u}`);
  log("info", "- Health:", { url: `${urls[0]}/healthz` });
  log("info", "- Media API:", { url: `${urls[0]}/api/media` });
});