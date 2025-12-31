## MediaServer (Raspberry Pi Ready)

This is a simple Node/Express media server that:
- Scans your media folders and returns a JSON listing at `GET /api/media`
- Streams videos with Range requests at `GET /stream/<path>`
- Serves optimized images at `GET /view/<path>`
- Generates cached thumbnails at `GET /thumb/<path>`
- Downloads originals at `GET /media/<path>`
- **NEW: Upload files** at `POST /api/upload`
- **NEW: Create folders** at `POST /api/folder`
- **NEW: List folders** at `GET /api/folders`

### Family Member Folders
On startup, the server automatically creates an `Uploads` folder with subfolders for each family member:
- John, David, Max, Juliette, Tomas, Camille

### What changed for Raspberry Pi
- **No Windows drive letters**: paths are configured via environment variables.
- **Multiple disks/volumes supported**: set `MEDIA_ROOTS` to a comma-separated list of mount points.
- **Safer path handling**: requests can only access files inside the configured mount points.

---

## Raspberry Pi OS (Desktop) setup

Install **Raspberry Pi OS (64-bit)** (the regular Desktop image).

After first boot:

```bash
sudo apt update && sudo apt upgrade -y
```

### Install Node.js
Recommended: **Node 20 LTS** (works well with `sharp`).

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

If `sharp` ever needs to build from source, install prerequisites:

```bash
sudo apt install -y build-essential python3 pkg-config libvips
```

---

## Mounting your multi-bay enclosure (separate volumes)

Because your enclosure exposes each drive as a separate volume, the clean approach is:
- Mount each disk at its own mount point, e.g. `/mnt/media1`, `/mnt/media2`, `/mnt/media3`
- Then choose **one** of these layouts:
  - **Layout A (simple)**: each mounted disk contains one or more of the category folders (`Photos/`, `Movies/`, etc).
  - **Layout B (recommended)**: mount disks anywhere, then create a single “virtual root” (e.g. `/srv/media`) made of **symlinks** to the right disks.

### Find your disks and filesystems

```bash
lsblk -f
```

You want to identify each disk partition (like `/dev/sda1`, `/dev/sdb1`, etc) and its filesystem type (often `ext4`, `exfat`, or `ntfs`).

### Create mount points

```bash
sudo mkdir -p /mnt/media1 /mnt/media2 /mnt/media3
```

### Option A (recommended): auto-mount via `/etc/fstab` using UUID
1) Get UUIDs:

```bash
lsblk -f
```

2) Edit fstab:

```bash
sudo nano /etc/fstab
```

Example entries:

```fstab
UUID=XXXX-XXXX  /mnt/media1  ext4  defaults,noatime  0  2
UUID=YYYY-YYYY  /mnt/media2  ext4  defaults,noatime  0  2
UUID=ZZZZ-ZZZZ  /mnt/media3  ext4  defaults,noatime  0  2
```

Then test:

```bash
sudo mount -a
```

### Layout A (simple): category folders live on the mounted disks
Create whatever folders you actually use on each disk, for example:

```bash
sudo mkdir -p /mnt/media1/Photos
sudo mkdir -p /mnt/media2/Movies
sudo mkdir -p /mnt/media3/TVShows
```

Then set (example) in `.env`:
- `MEDIA_ROOTS=/mnt/media1,/mnt/media2,/mnt/media3`

The server will scan each root for each category folder; missing folders are simply skipped.

### Layout B (recommended): one stable “virtual root” using symlinks
This is the least confusing way to manage “separate volumes”, because the server sees **one** consistent structure, but your data stays on separate disks.

1) Create a virtual root:

```bash
sudo mkdir -p /srv/media
sudo chown -R pi:pi /srv/media
```

2) Create the category folders as symlinks to the right disks:

```bash
ln -s /mnt/media1/Photos /srv/media/Photos
ln -s /mnt/media2/Movies /srv/media/Movies
ln -s /mnt/media3/TVShows /srv/media/TVShows
```

3) In `.env`, use a single root:
- `MEDIA_ROOT=/srv/media`

### Filesystem notes (important)
- **ext4**: best for Linux/Raspberry Pi.
- **exFAT**: readable/writable, good cross-platform.
- **NTFS**: works, but can be slower; you may need `ntfs-3g`.

If you tell me what `lsblk -f` shows, I can suggest the best fstab lines + mount options for your exact drives.

---

## Running the server

### 1) Clone from GitHub

```bash
git clone <YOUR_GITHUB_REPO_URL> MediaServer
cd MediaServer
```

### 2) Configure environment
This repo includes `env.example`. Copy/rename it to `.env` and edit:

```bash
cp env.example .env
nano .env
```

Set:
- `MEDIA_ROOTS=/mnt/media1,/mnt/media2,...` (Layout A)
- OR `MEDIA_ROOT=/srv/media` (Layout B)

### 3) Install and run

```bash
npm install
npm start
```

Check health:

```bash
curl http://localhost:4000/healthz
```

From another device on your LAN:
- `http://<pi-ip>:4000/api/media`

### If ping works but port 4000 is NOT reachable (common)
If your Windows PC shows `PingSucceeded: True` but `TcpTestSucceeded: False`, the Pi is either:
- not running the server
- running it on a different port
- blocked by a firewall

Run these **on the Pi**:

```bash
# 1) Is anything listening on 4000, and on which interface?
sudo ss -lntp | grep ':4000' || true

# 2) Is the service running (if you use systemd)?
sudo systemctl status mediaserver --no-pager

# 3) Quick local checks from the Pi itself
curl -sS http://127.0.0.1:4000/healthz
curl -sS http://localhost:4000/healthz
```

If you use UFW, allow the port:

```bash
sudo ufw status
sudo ufw allow 4000/tcp
```

Also watch the server startup logs: it prints the LAN URLs it thinks you can use (like `http://192.168.x.x:4000`).

---

## Pi: turn logging up to “a ton” (recommended while debugging)
### Tail logs live (systemd)

```bash
sudo journalctl -u mediaserver@${USER} -f -n 200
```

### Crank logging via `.env` (preferred)
Edit `/home/pi/MediaServer/.env` and set:
- `LOG_LEVEL=debug`
- `LOG_REQUESTS=1`
- Optional deep logs: `LOG_SCAN=1`, `LOG_RESOLVE=1`, `LOG_STREAM=1`, `LOG_THUMBS=1`
- Optional: `DEBUG_ENDPOINTS=1` (enables `/debug/config`)

Then restart:

```bash
sudo systemctl restart mediaserver
sudo systemctl status mediaserver --no-pager
```

### Quick “what config is the server actually using?”
If `DEBUG_ENDPOINTS=1`:

```bash
curl -sS http://127.0.0.1:4000/debug/config | head
```

---

## Run at boot (systemd)

This repo includes a systemd **instance** unit file: `mediaserver@.service`

### Install (recommended)
Run the installer script (auto-detects your user):

```bash
chmod +x ./scripts/install-systemd.sh
./scripts/install-systemd.sh
```

Note: If you installed Node via **nvm**, the service uses `scripts/systemd-entrypoint.sh` to source `~/.nvm/nvm.sh` so systemd can find `node`.

### Manual install (if you prefer)
1) Copy it into place:

```bash
sudo cp mediaserver@.service /etc/systemd/system/mediaserver@.service
sudo systemctl daemon-reload
```

2) Enable and start (replace USER):

```bash
sudo systemctl enable --now mediaserver@USER
sudo systemctl status mediaserver@USER --no-pager
```

### If Windows can SSH but cannot reach port 4000
Run the read-only diagnostics script on the Pi:

```bash
chmod +x ./scripts/diag-network.sh
./scripts/diag-network.sh 4000
```

---

## 📤 Upload & Folder Management API (Frontend Guide)

This section is for the frontend developer. Here's everything you need to integrate uploads and folder management.

### Quick Summary of New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/folders` | List all available folders (including family member folders) |
| `POST` | `/api/folder` | Create a new folder |
| `POST` | `/api/upload` | Upload one or more files |
| `DELETE` | `/api/file` | Delete a file (Uploads folder only) |

---

### 1. List Available Folders

```http
GET /api/folders
```

**Response:**

```json
{
  "folders": [
    { "name": "Photos", "path": "Photos", "isFamily": false },
    { "name": "Videos", "path": "Videos", "isFamily": false },
    { "name": "Uploads", "path": "Uploads", "isFamily": false },
    { "name": "John", "path": "Uploads/John", "isFamily": true },
    { "name": "David", "path": "Uploads/David", "isFamily": true },
    { "name": "Max", "path": "Uploads/Max", "isFamily": true },
    { "name": "Juliette", "path": "Uploads/Juliette", "isFamily": true },
    { "name": "Tomas", "path": "Uploads/Tomas", "isFamily": true },
    { "name": "Camille", "path": "Uploads/Camille", "isFamily": true }
  ],
  "familyMembers": ["John", "David", "Max", "Juliette", "Tomas", "Camille"],
  "root": "vault"
}
```

**Frontend Example (JavaScript):**

```javascript
async function getFolders() {
  const response = await fetch('http://YOUR_SERVER:4000/api/folders');
  const data = await response.json();
  
  // Get family member folders for a dropdown
  const familyFolders = data.folders.filter(f => f.isFamily);
  console.log('Family folders:', familyFolders);
  
  return data;
}
```

---

### 2. Create a New Folder

```http
POST /api/folder
Content-Type: application/json
```

**Request Body:**

```json
{
  "folderName": "Summer 2025",
  "parentFolder": "Uploads/John"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `folderName` | string | ✅ Yes | Name of the new folder |
| `parentFolder` | string | No | Parent folder path (defaults to `"Uploads"`) |

**Success Response (201):**

```json
{
  "success": true,
  "message": "Folder created successfully",
  "folder": {
    "name": "Summer_2025",
    "path": "Uploads/John/Summer_2025"
  }
}
```

**Error Responses:**

- `400` - Missing or invalid folder name
- `409` - Folder already exists
- `500` - Server error

**Frontend Example (JavaScript):**

```javascript
async function createFolder(folderName, parentFolder = 'Uploads') {
  const response = await fetch('http://YOUR_SERVER:4000/api/folder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      folderName,
      parentFolder,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }
  
  return response.json();
}

// Usage
await createFolder('Vacation Photos', 'Uploads/David');
```

---

### 3. Upload Files

```http
POST /api/upload
Content-Type: multipart/form-data
```

**Form Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files` | File(s) | ✅ Yes | One or more files to upload (max 20 per request) |
| `folder` | string | No | Target folder path (defaults to `"Uploads"`) |

**Supported File Types:**
- Images: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Videos: `.mp4`, `.mov`, `.avi`, `.mkv`
- Documents: `.pdf`, `.doc`, `.docx`

**Max File Size:** 500MB (configurable via `MAX_UPLOAD_SIZE` env var)

**Success Response (201):**

```json
{
  "success": true,
  "message": "3 file(s) uploaded successfully",
  "files": [
    {
      "originalName": "beach photo.jpg",
      "savedAs": "beach_photo_1704067200000.jpg",
      "size": 2048576,
      "mimetype": "image/jpeg",
      "path": "vault/Uploads/John/beach_photo_1704067200000.jpg",
      "viewUrl": "/view/vault/Uploads/John/beach_photo_1704067200000.jpg",
      "thumbUrl": "/thumb/vault/Uploads/John/beach_photo_1704067200000.jpg"
    }
  ]
}
```

**Error Responses:**

- `400` - No files or invalid file type
- `413` - File too large

**Frontend Example (JavaScript):**

```javascript
async function uploadFiles(files, targetFolder = 'Uploads') {
  const formData = new FormData();
  
  // Add files to form data
  for (const file of files) {
    formData.append('files', file);
  }
  
  // Specify target folder
  formData.append('folder', targetFolder);
  
  const response = await fetch('http://YOUR_SERVER:4000/api/upload', {
    method: 'POST',
    body: formData,
    // Note: Don't set Content-Type header - browser sets it automatically with boundary
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }
  
  return response.json();
}

// Usage with file input
document.getElementById('fileInput').addEventListener('change', async (e) => {
  const files = e.target.files;
  const folder = document.getElementById('folderSelect').value; // e.g., "Uploads/John"
  
  try {
    const result = await uploadFiles(files, folder);
    console.log('Uploaded:', result.files);
    
    // Display thumbnails
    result.files.forEach(file => {
      const img = document.createElement('img');
      img.src = `http://YOUR_SERVER:4000${file.thumbUrl}`;
      document.getElementById('gallery').appendChild(img);
    });
  } catch (err) {
    alert('Upload failed: ' + err.message);
  }
});
```

**React Example:**

```jsx
import { useState } from 'react';

function UploadForm() {
  const [selectedFolder, setSelectedFolder] = useState('Uploads/John');
  const [uploading, setUploading] = useState(false);
  
  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    
    setUploading(true);
    const formData = new FormData();
    
    for (const file of files) {
      formData.append('files', file);
    }
    formData.append('folder', selectedFolder);
    
    try {
      const res = await fetch('http://YOUR_SERVER:4000/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (data.success) {
        alert(`Uploaded ${data.files.length} files!`);
      } else {
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div>
      <select value={selectedFolder} onChange={(e) => setSelectedFolder(e.target.value)}>
        <option value="Uploads">General Uploads</option>
        <option value="Uploads/John">John's Folder</option>
        <option value="Uploads/David">David's Folder</option>
        <option value="Uploads/Max">Max's Folder</option>
        <option value="Uploads/Juliette">Juliette's Folder</option>
        <option value="Uploads/Tomas">Tomas's Folder</option>
        <option value="Uploads/Camille">Camille's Folder</option>
      </select>
      
      <input 
        type="file" 
        multiple 
        onChange={handleUpload}
        disabled={uploading}
        accept="image/*,video/*,.pdf,.doc,.docx"
      />
      
      {uploading && <p>Uploading...</p>}
    </div>
  );
}
```

---

### 4. Delete a File

```http
DELETE /api/file
Content-Type: application/json
```

**Request Body:**

```json
{
  "filePath": "vault/Uploads/John/beach_photo_1704067200000.jpg"
}
```

⚠️ **Security Note:** Files can only be deleted from the `Uploads` folder.

**Success Response:**

```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

**Frontend Example:**

```javascript
async function deleteFile(filePath) {
  const response = await fetch('http://YOUR_SERVER:4000/api/file', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filePath }),
  });
  
  return response.json();
}
```

---

### Complete Upload Flow Example

Here's a complete example showing folder selection, upload, and display:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Family Media Upload</title>
  <style>
    .gallery { display: flex; flex-wrap: wrap; gap: 10px; }
    .gallery img { width: 150px; height: 150px; object-fit: cover; border-radius: 8px; }
    select, input { margin: 10px 0; padding: 8px; }
  </style>
</head>
<body>
  <h1>Upload to Family Media Server</h1>
  
  <label>Select Family Member:</label>
  <select id="folderSelect"></select>
  
  <br>
  
  <input type="file" id="fileInput" multiple accept="image/*,video/*">
  
  <div id="status"></div>
  <div id="gallery" class="gallery"></div>
  
  <script>
    const SERVER = 'http://YOUR_SERVER:4000';
    
    // Load folders on page load
    async function loadFolders() {
      const res = await fetch(`${SERVER}/api/folders`);
      const data = await res.json();
      
      const select = document.getElementById('folderSelect');
      data.folders
        .filter(f => f.isFamily || f.name === 'Uploads')
        .forEach(folder => {
          const option = document.createElement('option');
          option.value = folder.path;
          option.textContent = folder.isFamily ? `📁 ${folder.name}` : folder.name;
          select.appendChild(option);
        });
    }
    
    // Handle file upload
    document.getElementById('fileInput').addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files.length) return;
      
      const folder = document.getElementById('folderSelect').value;
      const status = document.getElementById('status');
      const gallery = document.getElementById('gallery');
      
      status.textContent = `Uploading ${files.length} file(s)...`;
      
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      formData.append('folder', folder);
      
      try {
        const res = await fetch(`${SERVER}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        
        if (data.success) {
          status.textContent = `✅ ${data.message}`;
          
          // Show thumbnails
          data.files.forEach(file => {
            if (file.mimetype.startsWith('image/')) {
              const img = document.createElement('img');
              img.src = `${SERVER}${file.thumbUrl}`;
              img.title = file.originalName;
              gallery.appendChild(img);
            }
          });
        } else {
          status.textContent = `❌ Error: ${data.error}`;
        }
      } catch (err) {
        status.textContent = `❌ Upload failed: ${err.message}`;
      }
    });
    
    loadFolders();
  </script>
</body>
</html>
```

---

### Environment Variables for Upload Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_UPLOAD_SIZE` | `524288000` (500MB) | Maximum file size in bytes |
| `MEDIA_FOLDERS` | `Photos,Videos,Movies,TVShows,Documents,Uploads` | Folders to scan (now includes Uploads) |

---

### Tips for Frontend Integration

1. **Use `multipart/form-data`** for uploads - don't set Content-Type header manually
2. **Show progress** - For large files, consider using `XMLHttpRequest` with progress events
3. **Validate client-side** - Check file types and sizes before uploading
4. **Handle errors gracefully** - Display user-friendly messages for 413 (too large) and 400 (invalid type) errors
5. **Refresh media list** - After upload, call `GET /api/media` to refresh the gallery


