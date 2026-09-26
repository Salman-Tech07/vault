<div align="center">

# 🔐 Vault

### Fault-Tolerant Distributed Object Storage System

*Built for reliability, replication, and self-healing recovery — from scratch.*

![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Status](https://img.shields.io/badge/status-active-success?style=for-the-badge)

</div>

---

## 📖 About

**Vault** is a hackathon-built distributed object storage system that
demonstrates how real-world storage platforms (like Amazon S3 or Google Cloud
Storage) stay reliable even when individual machines fail. It automatically
**replicates**, **verifies**, and **self-heals** data across multiple storage
nodes — with zero manual intervention.

No external database. No heavy frameworks. Just Node.js, Express, and a
clean dashboard — built to show that fault tolerance isn't magic, it's
engineering.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔁 **Replication** | Every file is automatically stored across 3 independent storage nodes |
| 💓 **Health Monitoring** | Background checker pings all nodes every 5 seconds |
| 🛡️ **Integrity Verification** | SHA-256 checksums detect any data corruption instantly |
| 🔧 **Auto-Repair** | Missing or corrupted replicas are restored automatically from a healthy copy |
| 📊 **Live Dashboard** | Real-time cluster health, storage stats, and self-healing activity log |
| ⚡ **Zero Downtime Reads** | Files are always served from whichever replica is healthy |

---

## 🏗️ Architecture

```
                    Browser Dashboard
                          │
                          ▼
              ┌───────────────────────┐
              │      Coordinator      │
              │  • Replication engine │
              │  • Health monitor     │
              │  • Auto-repair loop   │
              └───────────┬───────────┘
                 ┌─────────┼─────────┐
                 ▼         ▼         ▼
             ┌───────┐ ┌───────┐ ┌───────┐
             │ Node1 │ │ Node2 │ │ Node3 │
             └───────┘ └───────┘ └───────┘
```

**How it works:**
1. A file uploaded to the coordinator is replicated to all 3 storage nodes
2. Each replica is stored with a SHA-256 checksum
3. A background job runs every 5 seconds — checking node health and replica
   integrity across the cluster
4. If a node goes down, or a replica becomes corrupted or missing, the
   coordinator automatically repairs it using a healthy copy
5. Downloads are always served from an available, verified-healthy replica

---

## 🖥️ Tech Stack

- **Backend** — Node.js, Express, Axios
- **Frontend** — HTML, CSS, Vanilla JavaScript
- **Storage** — Local filesystem (per-node isolated storage)
- **Integrity** — SHA-256 checksums

---

## ⚙️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) (LTS version)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Salman-Tech07/vault.git
cd vault

# 2. Install dependencies
npm install

# 3. Start the entire cluster
npm run start-all
```

This spins up **4 services** simultaneously:

| Service | Port |
|---|---|
| `node1` | `3001` |
| `node2` | `3002` |
| `node3` | `3003` |
| `coordinator` | `4000` |

### Open the Dashboard
```
http://localhost:4000
```

> If `npm run start-all` doesn't work on your system, run each service in
> its own terminal: `npm run node1`, `npm run node2`, `npm run node3`,
> `npm run coordinator`.

---

## 🎬 Demo Walkthrough

| Step | Action | What Happens |
|---|---|---|
| 1️⃣ | Upload a file | Replicated instantly across all 3 nodes |
| 2️⃣ | Kill `node2` (Ctrl+C) | Dashboard flags it "Down" within seconds; file still downloadable |
| 3️⃣ | Restart `node2` | Auto-repair restores its data automatically |
| 4️⃣ | Click "Corrupt" on a replica | Checksum mismatch detected → auto-repaired within 5 seconds |
| 5️⃣ | Download the file | Served seamlessly from any healthy node |

---

## 🔮 Roadmap

- [ ] Erasure coding for reduced storage overhead
- [ ] Raft-based metadata consensus
- [ ] Larger clusters with consistent-hashing placement
- [ ] Network partition simulation & tolerance

---

## 👥 Team

Built with ❤️ for **PROMPT-A-THON** hackathon by **Team Byte Crew**

---

<div align="center">

*Vault — because your data deserves to survive failure.*

</div>
