# Media Server - Upload API Documentation

## Overview

This media server supports file uploads with **no size limits** using streaming uploads. Files are streamed directly to disk without buffering in memory, making it fast and efficient for large files.

**Base URL:** `http://your-server:4000`

---

## Two Upload Systems

The server provides **two upload systems**:

| System | Purpose | Endpoint Pattern | Storage Location |
|--------|---------|------------------|------------------|
| **Section Upload** | Global uploads to main media sections | `/api/upload/section/:section` | `{MEDIA_ROOT}/Movies/`, etc. |
| **User Upload** | Personal uploads for individual users | `/api/upload/:userFolder` | `{MEDIA_ROOT}/Uploads/{user}/` |

---

## Section Upload API (Global Media)

Upload directly to main media sections: **Movies**, **TVShows**, **Photos**, **Videos**, **Documents**.

### Available Sections

```http
GET /api/sections
```

**Response:**
```json
{
  "sections": ["Photos", "Videos", "Movies", "TVShows", "Documents"],
  "description": "Main media sections available for upload"
}
```

---

### List Section Contents

```http
GET /api/sections/:section?path=optional/subfolder
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `section` | path | Yes | One of: Photos, Videos, Movies, TVShows, Documents |
| `path` | query | No | Subfolder path (e.g., `TheOffice` for TVShows) |

**Example - List all TV shows:**
```http
GET /api/sections/TVShows
```

**Example - List episodes of a show:**
```http
GET /api/sections/TVShows?path=TheOffice
```

**Response:**
```json
{
  "section": "TVShows",
  "currentPath": "TheOffice",
  "items": [
    {
      "name": "S01E01.mp4",
      "type": "file",
      "mediaType": "video",
      "size": 524288000,
      "modified": 1704067200000,
      "path": "TheOffice/S01E01.mp4",
      "mediaPath": "vault/TVShows/TheOffice/S01E01.mp4"
    },
    {
      "name": "Season 2",
      "type": "folder",
      "mediaType": null,
      "size": null,
      "modified": 1704067200000,
      "path": "TheOffice/Season 2",
      "mediaPath": null
    }
  ]
}
```

---

### Create Folder in Section

Create new folders (e.g., new TV show folder, movie collection folder).

```http
POST /api/sections/:section/folder
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "NewShowName",
  "path": "optional/parent/path"
}
```

**Example - Create a new TV show folder:**
```http
POST /api/sections/TVShows/folder
Content-Type: application/json

{
  "name": "BreakingBad"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "name": "BreakingBad",
  "path": "BreakingBad",
  "section": "TVShows"
}
```

---

### Upload to Section (Simple)

For files under 100MB. Supports multiple files.

```http
POST /api/upload/section/:section?path=optional/subfolder
Content-Type: multipart/form-data
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `section` | path | Yes | One of: Photos, Videos, Movies, TVShows, Documents |
| `path` | query | No | Subfolder path within section |

**Examples:**

```http
# Upload a movie directly to Movies folder
POST /api/upload/section/Movies

# Upload a TV episode to a specific show
POST /api/upload/section/TVShows?path=TheOffice/Season1

# Upload photos to a subfolder
POST /api/upload/section/Photos?path=Vacation2024
```

**Response:**
```json
{
  "success": true,
  "section": "Movies",
  "uploaded": [
    {
      "filename": "Inception.mp4",
      "originalName": "Inception (2010).mp4",
      "size": 2147483648,
      "path": "Inception.mp4",
      "mediaPath": "vault/Movies/Inception.mp4",
      "mimeType": "video/mp4",
      "uploadTimeMs": 15234
    }
  ]
}
```

---

### Upload to Section (Chunked)

For large files (100MB+). Supports resumable uploads.

#### Step 1: Initialize Upload

```http
POST /api/upload/section/:section/chunked/init
Content-Type: application/json
```

**Request Body:**
```json
{
  "filename": "BigMovie.mkv",
  "totalSize": 8589934592,
  "totalChunks": 819,
  "path": "optional/subfolder"
}
```

**Response:**
```json
{
  "uploadId": "section-1704067200000-abc123",
  "filename": "BigMovie.mkv",
  "totalChunks": 819,
  "chunkUploadUrl": "/api/upload/section/Movies/chunked/section-1704067200000-abc123"
}
```

#### Step 2: Upload Each Chunk

```http
POST /api/upload/section/:section/chunked/:uploadId?chunkIndex=0
Content-Type: multipart/form-data
```

**Response (partial):**
```json
{
  "success": true,
  "chunkIndex": 0,
  "receivedChunks": 1,
  "totalChunks": 819,
  "complete": false
}
```

**Response (final chunk):**
```json
{
  "success": true,
  "complete": true,
  "section": "Movies",
  "filename": "BigMovie.mkv",
  "size": 8589934592,
  "path": "BigMovie.mkv",
  "mediaPath": "vault/Movies/BigMovie.mkv",
  "uploadTimeMs": 245000
}
```

#### Step 3: Check Upload Status (Optional)

```http
GET /api/upload/section/:section/chunked/:uploadId
```

**Response:**
```json
{
  "uploadId": "section-1704067200000-abc123",
  "section": "Movies",
  "filename": "BigMovie.mkv",
  "totalChunks": 819,
  "receivedChunks": 400,
  "missingChunks": [400, 401, 402],
  "complete": false
}
```

---

### Delete File from Section

```http
DELETE /api/sections/:section/file?path=path/to/file.mp4
```

**Response:**
```json
{
  "success": true
}
```

---

### Delete Folder from Section

```http
DELETE /api/sections/:section/folder?path=folder/to/delete
```

> **Note:** Folder must be empty.

**Response:**
```json
{
  "success": true
}
```

---

## User Upload API (Personal Folders)

For personal user uploads. On startup, the server creates 6 user folders under `{MEDIA_ROOT}/Uploads/`:

| Folder | Description |
|--------|-------------|
| `John` | John's personal uploads |
| `Max` | Max's personal uploads |
| `Juliette` | Juliette's personal uploads |
| `Thomas` | Thomas's personal uploads |
| `David` | David's personal uploads |
| `Shared` | Shared uploads for everyone |

### Get User Folders

```http
GET /api/users
```

**Response:**
```json
{
  "users": ["John", "Max", "Juliette", "Thomas", "David", "Shared"],
  "uploadsRoot": "Uploads"
}
```

---

### List User Folder Contents

```http
GET /api/folders/:userFolder?path=optional/subfolder
```

**Response:**
```json
{
  "user": "John",
  "currentPath": "vacation/2024",
  "items": [
    {
      "name": "photo.jpg",
      "type": "file",
      "size": 2048576,
      "modified": 1704067200000,
      "path": "John/vacation/2024/photo.jpg",
      "mediaPath": "vault/Uploads/John/vacation/2024/photo.jpg"
    }
  ]
}
```

---

### Create Folder (User)

```http
POST /api/folders/:userFolder
Content-Type: application/json

{
  "name": "NewFolderName",
  "path": "optional/parent/path"
}
```

---

### Upload to User Folder (Simple)

```http
POST /api/upload/:userFolder?path=optional/subfolder
Content-Type: multipart/form-data
```

---

### Upload to User Folder (Chunked)

Same flow as section chunked upload:

```http
POST /api/upload/:userFolder/chunked/init
POST /api/upload/:userFolder/chunked/:uploadId?chunkIndex=0
GET /api/upload/:userFolder/chunked/:uploadId
```

---

### Delete File (User)

```http
DELETE /api/files/:userFolder?path=path/to/file.jpg
```

---

### Delete Folder (User)

```http
DELETE /api/folders/:userFolder?path=folder/to/delete
```

---

## Accessing Uploaded Files

Once uploaded, files can be accessed using the existing media endpoints with the `mediaPath` returned:

| Purpose | Endpoint | Example |
|---------|----------|---------|
| Stream video | `GET /stream/{mediaPath}` | `/stream/vault/Movies/Inception.mp4` |
| View optimized image | `GET /view/{mediaPath}` | `/view/vault/Photos/photo.jpg` |
| Get thumbnail | `GET /thumb/{mediaPath}` | `/thumb/vault/Photos/photo.jpg` |
| Download original | `GET /media/{mediaPath}` | `/media/vault/Movies/Inception.mp4` |

---

## Frontend Implementation Examples

### React: Section Upload Component

```jsx
import { useState, useCallback } from 'react';

const SECTIONS = ['Photos', 'Videos', 'Movies', 'TVShows', 'Documents'];
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

export function SectionUpload({ serverUrl = '' }) {
  const [section, setSection] = useState('Movies');
  const [subPath, setSubPath] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  const uploadFile = useCallback(async (file) => {
    setUploading(true);
    setProgress(0);
    setResult(null);

    try {
      // Use simple upload for small files
      if (file.size < CHUNK_SIZE) {
        const formData = new FormData();
        formData.append('file', file);

        const url = `${serverUrl}/api/upload/section/${section}${subPath ? `?path=${encodeURIComponent(subPath)}` : ''}`;
        
        const res = await fetch(url, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        
        setProgress(100);
        const data = await res.json();
        setResult(data);
        return data;
      }

      // Use chunked upload for large files
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // Initialize
      const initRes = await fetch(`${serverUrl}/api/upload/section/${section}/chunked/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          totalSize: file.size,
          totalChunks,
          path: subPath
        })
      });

      if (!initRes.ok) throw new Error('Failed to initialize upload');
      const { uploadId } = await initRes.json();

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);

        const res = await fetch(
          `${serverUrl}/api/upload/section/${section}/chunked/${uploadId}?chunkIndex=${i}`,
          { method: 'POST', body: formData }
        );

        if (!res.ok) throw new Error(`Failed to upload chunk ${i}`);
        const chunkResult = await res.json();

        setProgress(Math.round(((i + 1) / totalChunks) * 100));

        if (chunkResult.complete) {
          setResult(chunkResult);
          return chunkResult;
        }
      }
    } catch (err) {
      setResult({ error: err.message });
      throw err;
    } finally {
      setUploading(false);
    }
  }, [serverUrl, section, subPath]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  };

  return (
    <div className="section-upload">
      <h2>Upload to Media Library</h2>
      
      <div className="form-group">
        <label>Section:</label>
        <select value={section} onChange={(e) => setSection(e.target.value)}>
          {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label>Subfolder (optional):</label>
        <input 
          type="text" 
          value={subPath} 
          onChange={(e) => setSubPath(e.target.value)}
          placeholder="e.g., TheOffice/Season1"
        />
      </div>

      <div className="form-group">
        <input 
          type="file" 
          onChange={handleFileChange} 
          disabled={uploading}
        />
      </div>

      {uploading && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      )}

      {result && (
        <div className={result.error ? 'error' : 'success'}>
          {result.error ? (
            <p>Error: {result.error}</p>
          ) : (
            <p>Uploaded: {result.uploaded?.[0]?.filename || result.filename}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

---

### React: Section Browser with Upload

```jsx
import { useState, useEffect, useCallback } from 'react';

const SECTIONS = ['Photos', 'Videos', 'Movies', 'TVShows', 'Documents'];

export function SectionBrowser({ serverUrl = '' }) {
  const [section, setSection] = useState('Movies');
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch folder contents
  const fetchContents = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${serverUrl}/api/sections/${section}${currentPath ? `?path=${encodeURIComponent(currentPath)}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, section, currentPath]);

  useEffect(() => {
    fetchContents();
  }, [fetchContents]);

  // Navigate into folder
  const openFolder = (folderPath) => {
    setCurrentPath(folderPath);
  };

  // Go back
  const goBack = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  // Create new folder
  const createFolder = async () => {
    const name = prompt('Folder name:');
    if (!name) return;

    await fetch(`${serverUrl}/api/sections/${section}/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path: currentPath })
    });

    fetchContents(); // Refresh
  };

  // Upload file
  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${serverUrl}/api/upload/section/${section}${currentPath ? `?path=${encodeURIComponent(currentPath)}` : ''}`;
    await fetch(url, { method: 'POST', body: formData });

    fetchContents(); // Refresh
  };

  // Delete item
  const deleteItem = async (item) => {
    if (!confirm(`Delete ${item.name}?`)) return;

    const endpoint = item.type === 'folder' ? 'folder' : 'file';
    await fetch(`${serverUrl}/api/sections/${section}/${endpoint}?path=${encodeURIComponent(item.path)}`, {
      method: 'DELETE'
    });

    fetchContents(); // Refresh
  };

  return (
    <div className="section-browser">
      {/* Section selector */}
      <div className="toolbar">
        <select value={section} onChange={(e) => { setSection(e.target.value); setCurrentPath(''); }}>
          {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {currentPath && <button onClick={goBack}>← Back</button>}
        <button onClick={createFolder}>+ New Folder</button>
        
        <label className="upload-btn">
          + Upload
          <input type="file" hidden onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
        </label>
      </div>

      {/* Breadcrumb */}
      <div className="breadcrumb">
        <span onClick={() => setCurrentPath('')}>{section}</span>
        {currentPath.split('/').filter(Boolean).map((part, i, arr) => (
          <span key={i} onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))}>
            {' / '}{part}
          </span>
        ))}
      </div>

      {/* Items list */}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="items-grid">
          {items.map(item => (
            <div key={item.path} className={`item ${item.type}`}>
              {item.type === 'folder' ? (
                <div onClick={() => openFolder(item.path)}>📁 {item.name}</div>
              ) : (
                <div>
                  {item.mediaType === 'video' ? '🎬' : '🖼️'} {item.name}
                  <a href={`${serverUrl}/stream/${item.mediaPath}`} target="_blank">▶</a>
                </div>
              )}
              <button onClick={() => deleteItem(item)}>🗑️</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### React: Global Upload Button Hook

```jsx
import { useState, useCallback } from 'react';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

export function useSectionUpload(serverUrl = '') {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const upload = useCallback(async (section, file, subPath = '') => {
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      // Simple upload for small files
      if (file.size < CHUNK_SIZE) {
        const formData = new FormData();
        formData.append('file', file);

        const url = `${serverUrl}/api/upload/section/${section}${subPath ? `?path=${encodeURIComponent(subPath)}` : ''}`;
        const res = await fetch(url, { method: 'POST', body: formData });

        if (!res.ok) throw new Error('Upload failed');
        setProgress(100);
        return await res.json();
      }

      // Chunked upload for large files
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      const initRes = await fetch(`${serverUrl}/api/upload/section/${section}/chunked/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          totalSize: file.size,
          totalChunks,
          path: subPath
        })
      });

      const { uploadId } = await initRes.json();

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);

        const res = await fetch(
          `${serverUrl}/api/upload/section/${section}/chunked/${uploadId}?chunkIndex=${i}`,
          { method: 'POST', body: formData }
        );

        const result = await res.json();
        setProgress(Math.round(((i + 1) / totalChunks) * 100));

        if (result.complete) return result;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setUploading(false);
    }
  }, [serverUrl]);

  return { upload, uploading, progress, error };
}

// Usage
function MovieUploadButton() {
  const { upload, uploading, progress, error } = useSectionUpload('http://192.168.1.100:4000');

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const result = await upload('Movies', file);
      console.log('Uploaded to:', result.mediaPath);
    }
  };

  return (
    <div>
      <label>
        {uploading ? `Uploading... ${progress}%` : '+ Upload Movie'}
        <input type="file" hidden onChange={handleUpload} disabled={uploading} accept="video/*" />
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

---

### Vanilla JavaScript: Upload to Section

```javascript
const SERVER_URL = 'http://192.168.1.100:4000';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

// Simple upload
async function uploadToSection(section, file, subPath = '') {
  const formData = new FormData();
  formData.append('file', file);

  const url = `${SERVER_URL}/api/upload/section/${section}${subPath ? `?path=${encodeURIComponent(subPath)}` : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  return response.json();
}

// Chunked upload with progress
async function uploadLargeToSection(section, file, subPath = '', onProgress) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Initialize
  const initRes = await fetch(`${SERVER_URL}/api/upload/section/${section}/chunked/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      totalSize: file.size,
      totalChunks,
      path: subPath
    })
  });

  const { uploadId } = await initRes.json();

  // Upload chunks
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', chunk);

    const res = await fetch(
      `${SERVER_URL}/api/upload/section/${section}/chunked/${uploadId}?chunkIndex=${i}`,
      { method: 'POST', body: formData }
    );

    const result = await res.json();

    if (onProgress) {
      onProgress({ uploaded: i + 1, total: totalChunks, percent: Math.round(((i + 1) / totalChunks) * 100) });
    }

    if (result.complete) return result;
  }
}

// Usage Examples:

// Upload movie
const movieFile = document.querySelector('#movie-input').files[0];
await uploadToSection('Movies', movieFile);

// Upload TV episode to specific show folder
const episodeFile = document.querySelector('#episode-input').files[0];
await uploadToSection('TVShows', episodeFile, 'BreakingBad/Season1');

// Upload large movie with progress
await uploadLargeToSection('Movies', hugeMovieFile, '', (progress) => {
  console.log(`Upload: ${progress.percent}%`);
});
```

---

### Create TV Show Folder Then Upload

```javascript
// Step 1: Create show folder
async function createShowFolder(showName) {
  const res = await fetch(`${SERVER_URL}/api/sections/TVShows/folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: showName })
  });
  return res.json();
}

// Step 2: Upload episode to that folder
async function uploadEpisode(showName, seasonFolder, file) {
  return uploadToSection('TVShows', file, `${showName}/${seasonFolder}`);
}

// Usage
await createShowFolder('Stranger Things');
await uploadEpisode('Stranger Things', 'Season1', episodeFile);
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

**HTTP Status Codes:**
| Code | Description |
|------|-------------|
| `400` | Bad request (invalid section, path traversal attempt, invalid filename) |
| `404` | Resource not found |
| `409` | Conflict (folder already exists) |
| `500` | Server error |

---

## TypeScript Types

```typescript
// Sections
type Section = 'Photos' | 'Videos' | 'Movies' | 'TVShows' | 'Documents';

interface SectionsResponse {
  sections: Section[];
  description: string;
}

interface SectionItem {
  name: string;
  type: 'file' | 'folder';
  mediaType: 'video' | 'image' | null;
  size: number | null;
  modified: number;
  path: string;
  mediaPath: string | null;
}

interface SectionListResponse {
  section: Section;
  currentPath: string;
  items: SectionItem[];
}

interface SectionUploadedFile {
  filename: string;
  originalName: string;
  size: number;
  path: string;
  mediaPath: string;
  mimeType: string;
  uploadTimeMs: number;
}

interface SectionUploadResponse {
  success: boolean;
  section: Section;
  uploaded: SectionUploadedFile[];
  errors?: { filename: string; error: string }[];
}

interface SectionChunkedInitResponse {
  uploadId: string;
  filename: string;
  totalChunks: number;
  chunkUploadUrl: string;
}

interface SectionChunkUploadResponse {
  success: boolean;
  chunkIndex: number;
  receivedChunks: number;
  totalChunks: number;
  complete: boolean;
  // Only present when complete=true:
  section?: Section;
  filename?: string;
  size?: number;
  path?: string;
  mediaPath?: string;
  uploadTimeMs?: number;
}

// Users (unchanged from before)
interface UserFoldersResponse {
  users: string[];
  uploadsRoot: string;
}

interface FolderItem {
  name: string;
  type: 'file' | 'folder';
  size: number | null;
  modified: number;
  path: string;
  mediaPath: string | null;
}

interface FolderListResponse {
  user: string;
  currentPath: string;
  items: FolderItem[];
}

interface UploadedFile {
  filename: string;
  originalName: string;
  size: number;
  path: string;
  mediaPath: string;
  mimeType: string;
  uploadTimeMs: number;
}

interface UploadResponse {
  success: boolean;
  uploaded: UploadedFile[];
  errors?: { filename: string; error: string }[];
}

interface ErrorResponse {
  error: string;
}
```

---

## Quick Reference

| Action | Method | Endpoint |
|--------|--------|----------|
| List sections | GET | `/api/sections` |
| Browse section | GET | `/api/sections/:section?path=...` |
| Create folder in section | POST | `/api/sections/:section/folder` |
| Upload to section | POST | `/api/upload/section/:section?path=...` |
| Chunked init (section) | POST | `/api/upload/section/:section/chunked/init` |
| Chunked upload (section) | POST | `/api/upload/section/:section/chunked/:uploadId` |
| Delete file (section) | DELETE | `/api/sections/:section/file?path=...` |
| Delete folder (section) | DELETE | `/api/sections/:section/folder?path=...` |
| List users | GET | `/api/users` |
| Browse user folder | GET | `/api/folders/:user?path=...` |
| Create user folder | POST | `/api/folders/:user` |
| Upload to user | POST | `/api/upload/:user?path=...` |
| Delete user file | DELETE | `/api/files/:user?path=...` |
| Delete user folder | DELETE | `/api/folders/:user?path=...` |
