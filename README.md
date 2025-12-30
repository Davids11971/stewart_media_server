## MediaServer (Raspberry Pi Ready)

This is a simple Node/Express media server that:
- Scans your media folders and returns a JSON listing at `GET /api/media`
- Streams videos with Range requests at `GET /stream/<path>`
- Serves optimized images at `GET /view/<path>`
- Generates cached thumbnails at `GET /thumb/<path>`
- Downloads originals at `GET /media/<path>`

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

## Run at boot (systemd)

This repo includes a template unit file: `mediaserver.service`

1) Copy it into place:

```bash
sudo cp mediaserver.service /etc/systemd/system/mediaserver.service
```

2) Edit paths/user if needed:

```bash
sudo nano /etc/systemd/system/mediaserver.service
```

3) Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mediaserver
sudo systemctl status mediaserver --no-pager
```


