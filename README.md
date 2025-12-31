# Media Server - Upload API Documentation

## Overview

This media server supports file uploads with **no size limits** using streaming uploads. Files are streamed directly to disk without buffering in memory, making it fast and efficient for large files.

**Base URL:** `http://your-server:4000`

---

## User Folders

On startup, the server creates 6 user folders under `{MEDIA_ROOT}/Uploads/`:

| Folder | Description |
|--------|-------------|
| `John` | John's personal uploads |
| `Max` | Max's personal uploads |
| `Juliette` | Juliette's personal uploads |
| `Thomas` | Thomas's personal uploads |
| `David` | David's personal uploads |
| `Shared` | Shared uploads for everyone |

All uploads must go into one of these user folders (or subfolders within them).

---

## API Endpoints

### 1. Get User Folders

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

### 2. List Folder Contents

```http
GET /api/folders/:userFolder?path=optional/subfolder
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userFolder` | path | Yes | One of: John, Max, Juliette, Thomas, David, Shared |
| `path` | query | No | Subfolder path relative to user folder |

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
    },
    {
      "name": "videos",
      "type": "folder",
      "size": null,
      "modified": 1704067200000,
      "path": "John/vacation/2024/videos",
      "mediaPath": null
    }
  ]
}
```

> **Note:** Use `mediaPath` with existing endpoints (`/stream/`, `/view/`, `/thumb/`, `/media/`) to access uploaded files.

---

### 3. Create Folder

```http
POST /api/folders/:userFolder
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "NewFolderName",
  "path": "optional/parent/path"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "name": "NewFolderName",
  "path": "John/optional/parent/path/NewFolderName"
}
```

---

### 4. Delete Folder

```http
DELETE /api/folders/:userFolder?path=folder/to/delete
```

> **Note:** Folder must be empty.

**Response:**
```json
{
  "success": true
}
```

---

### 5. Simple Upload (Recommended for files < 100MB)

```http
POST /api/upload/:userFolder?path=optional/subfolder
Content-Type: multipart/form-data
```

**Form Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `file` | File | One or more files to upload |

**Response:**
```json
{
  "success": true,
  "uploaded": [
    {
      "filename": "photo.jpg",
      "originalName": "My Photo.jpg",
      "size": 2048576,
      "path": "John/vacation/2024/photo.jpg",
      "mediaPath": "vault/Uploads/John/vacation/2024/photo.jpg",
      "mimeType": "image/jpeg",
      "uploadTimeMs": 245
    }
  ]
}
```

---

### 6. Chunked Upload (Recommended for files > 100MB)

For very large files, use chunked uploads for resumability and progress tracking.

#### Step 1: Initialize Upload

```http
POST /api/upload/:userFolder/chunked/init
Content-Type: application/json
```

**Request Body:**
```json
{
  "filename": "huge_video.mp4",
  "totalSize": 5368709120,
  "totalChunks": 512,
  "path": "optional/subfolder"
}
```

**Response:**
```json
{
  "uploadId": "lxyz123-abc456",
  "filename": "huge_video.mp4",
  "totalChunks": 512,
  "chunkUploadUrl": "/api/upload/John/chunked/lxyz123-abc456"
}
```

#### Step 2: Upload Each Chunk

```http
POST /api/upload/:userFolder/chunked/:uploadId?chunkIndex=0
Content-Type: multipart/form-data
```

**Form Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `chunk` | File | The chunk data |

**Response (partial):**
```json
{
  "success": true,
  "chunkIndex": 0,
  "receivedChunks": 1,
  "totalChunks": 512,
  "complete": false
}
```

**Response (final chunk - file assembled):**
```json
{
  "success": true,
  "complete": true,
  "filename": "huge_video.mp4",
  "size": 5368709120,
  "path": "John/huge_video.mp4",
  "mediaPath": "vault/Uploads/John/huge_video.mp4",
  "uploadTimeMs": 45230
}
```

#### Step 3: Check Upload Status (Optional)

```http
GET /api/upload/:userFolder/chunked/:uploadId
```

**Response:**
```json
{
  "uploadId": "lxyz123-abc456",
  "filename": "huge_video.mp4",
  "totalChunks": 512,
  "receivedChunks": 156,
  "missingChunks": [156, 157, 158],
  "complete": false
}
```

---

### 7. Delete File

```http
DELETE /api/files/:userFolder?path=path/to/file.jpg
```

**Response:**
```json
{
  "success": true
}
```

---

## Accessing Uploaded Files

Once uploaded, files can be accessed using the existing media endpoints with the `mediaPath` returned:

| Purpose | Endpoint | Example |
|---------|----------|---------|
| Stream video | `GET /stream/{mediaPath}` | `/stream/vault/Uploads/John/video.mp4` |
| View optimized image | `GET /view/{mediaPath}` | `/view/vault/Uploads/John/photo.jpg` |
| Get thumbnail | `GET /thumb/{mediaPath}` | `/thumb/vault/Uploads/John/photo.jpg` |
| Download original | `GET /media/{mediaPath}` | `/media/vault/Uploads/John/photo.jpg` |

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
| `400` | Bad request (invalid user folder, path traversal attempt, invalid filename) |
| `404` | Resource not found |
| `409` | Conflict (folder already exists) |
| `500` | Server error |

---

## Code Examples

### Simple Upload

```javascript
async function uploadFile(userFolder, file, subPath = '') {
  const formData = new FormData();
  formData.append('file', file);
  
  const url = `/api/upload/${userFolder}${subPath ? `?path=${encodeURIComponent(subPath)}` : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });
  
  return response.json();
}

// Usage
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const result = await uploadFile('John', file, 'vacation/2024');
console.log('Uploaded:', result.uploaded[0].mediaPath);
```

### Simple Upload with Progress (XMLHttpRequest)

```javascript
function uploadFileWithProgress(userFolder, file, subPath = '', onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const url = `/api/upload/${userFolder}${subPath ? `?path=${encodeURIComponent(subPath)}` : ''}`;
    
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percent: Math.round((e.loaded / e.total) * 100)
        });
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });
    
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    
    xhr.open('POST', url);
    xhr.send(formData);
  });
}

// Usage
const result = await uploadFileWithProgress('John', file, '', (progress) => {
  console.log(`Upload: ${progress.percent}%`);
});
```

### Chunked Upload (Large Files)

```javascript
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

async function uploadLargeFile(userFolder, file, subPath = '', onProgress) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  // Step 1: Initialize
  const initRes = await fetch(`/api/upload/${userFolder}/chunked/init`, {
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
  
  // Step 2: Upload chunks
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    
    const formData = new FormData();
    formData.append('chunk', chunk);
    
    const res = await fetch(
      `/api/upload/${userFolder}/chunked/${uploadId}?chunkIndex=${i}`,
      { method: 'POST', body: formData }
    );
    
    if (!res.ok) throw new Error(`Failed to upload chunk ${i}`);
    const result = await res.json();
    
    if (onProgress) {
      onProgress({ 
        uploaded: i + 1, 
        total: totalChunks, 
        percent: Math.round(((i + 1) / totalChunks) * 100)
      });
    }
    
    if (result.complete) {
      return result; // Final response with file info
    }
  }
}

// Usage
const file = document.querySelector('input[type="file"]').files[0];
const result = await uploadLargeFile('John', file, 'videos', (progress) => {
  console.log(`Upload: ${progress.percent}%`);
});
console.log('Complete!', result.mediaPath);
```

### Create Folder

```javascript
async function createFolder(userFolder, folderName, parentPath = '') {
  const response = await fetch(`/api/folders/${userFolder}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      path: parentPath
    })
  });
  
  return response.json();
}

// Usage
await createFolder('John', 'vacation', '');           // Creates John/vacation
await createFolder('John', '2024', 'vacation');       // Creates John/vacation/2024
```

### List Folder Contents

```javascript
async function listFolder(userFolder, subPath = '') {
  const url = `/api/folders/${userFolder}${subPath ? `?path=${encodeURIComponent(subPath)}` : ''}`;
  const response = await fetch(url);
  return response.json();
}

// Usage
const contents = await listFolder('John', 'vacation/2024');
console.log('Files:', contents.items.filter(i => i.type === 'file'));
console.log('Folders:', contents.items.filter(i => i.type === 'folder'));
```

### Delete File

```javascript
async function deleteFile(userFolder, filePath) {
  const response = await fetch(
    `/api/files/${userFolder}?path=${encodeURIComponent(filePath)}`,
    { method: 'DELETE' }
  );
  return response.json();
}

// Usage
await deleteFile('John', 'vacation/2024/photo.jpg');
```

### Drag & Drop Upload

```javascript
const dropZone = document.getElementById('drop-zone');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  
  const files = Array.from(e.dataTransfer.files);
  const userFolder = 'John'; // Or get from UI selection
  
  for (const file of files) {
    try {
      const result = await uploadFile(userFolder, file);
      console.log('Uploaded:', result.uploaded[0].filename);
    } catch (err) {
      console.error('Failed to upload:', file.name, err);
    }
  }
});
```

---

## React Hook Example

```jsx
import { useState, useCallback } from 'react';

export function useUpload(userFolder) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const upload = useCallback(async (file, subPath = '') => {
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const CHUNK_SIZE = 10 * 1024 * 1024;
      
      // Use simple upload for small files
      if (file.size < CHUNK_SIZE) {
        const formData = new FormData();
        formData.append('file', file);
        
        const url = `/api/upload/${userFolder}${subPath ? `?path=${encodeURIComponent(subPath)}` : ''}`;
        const res = await fetch(url, { method: 'POST', body: formData });
        
        if (!res.ok) throw new Error('Upload failed');
        setProgress(100);
        return await res.json();
      }

      // Use chunked upload for large files
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      
      const initRes = await fetch(`/api/upload/${userFolder}/chunked/init`, {
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
          `/api/upload/${userFolder}/chunked/${uploadId}?chunkIndex=${i}`,
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
  }, [userFolder]);

  return { upload, uploading, progress, error };
}

// Usage in component
function UploadButton({ userFolder }) {
  const { upload, uploading, progress, error } = useUpload(userFolder);
  
  const handleChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const result = await upload(file);
      console.log('Uploaded:', result);
    }
  };
  
  return (
    <div>
      <input type="file" onChange={handleChange} disabled={uploading} />
      {uploading && <progress value={progress} max="100" />}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

---

## TypeScript Types

```typescript
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

interface ChunkedInitResponse {
  uploadId: string;
  filename: string;
  totalChunks: number;
  chunkUploadUrl: string;
}

interface ChunkUploadResponse {
  success: boolean;
  chunkIndex: number;
  receivedChunks: number;
  totalChunks: number;
  complete: boolean;
  // Only present when complete=true:
  filename?: string;
  size?: number;
  path?: string;
  mediaPath?: string;
  uploadTimeMs?: number;
}

interface ChunkStatusResponse {
  uploadId: string;
  filename: string;
  totalChunks: number;
  receivedChunks: number;
  missingChunks: number[];
  complete: boolean;
}

interface ErrorResponse {
  error: string;
}
```
