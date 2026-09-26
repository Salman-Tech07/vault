// coordinator.js
// Ye "coordinator" hai — client isi se baat karta hai.
// Kaam: (1) upload aane pe teeno nodes pe replicate karna
//       (2) download request pe jo bhi node available hai usse file dena
//       (3) background mein har 5 second check karna ki sab replicas healthy hain,
//           agar koi missing/corrupt hai to doosre healthy replica se copy karke "repair" karna

const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'))); // dashboard yahi se serve hoga

const PORT = 4000;

const NODES = [
  { id: 'node1', url: 'http://localhost:3001' },
  { id: 'node2', url: 'http://localhost:3002' },
  { id: 'node3', url: 'http://localhost:3003' },
];

// in-memory "metadata store" — real system mein ye database/Raft mein hota hai,
// hackathon ke liye simple JS object kaafi hai
const metadata = {}; // { fileId: { nodes, size, filename, mimeType, uploadedAt } }

let nodeStatus = {}; // live health cache
let prevNodeStatus = {}; // to detect up/down transitions for the activity log

// Activity log — dashboard ke "Recovery" tab mein isko dikhayenge
const events = [];
function logEvent(kind, message) {
  events.unshift({ kind, message, timestamp: new Date().toISOString() });
  if (events.length > 50) events.pop(); // purane events hata do, list chhoti rakhne ke liye
}

async function checkNodeHealth(node) {
  try {
    await axios.get(`${node.url}/health`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// ---------- BACKGROUND HEALTH CHECK + AUTO-REPAIR ----------
async function backgroundChecker() {
  for (const node of NODES) {
    nodeStatus[node.id] = await checkNodeHealth(node);

    // node up/down mein transition hua toh activity log mein daal do
    if (prevNodeStatus[node.id] !== undefined && prevNodeStatus[node.id] !== nodeStatus[node.id]) {
      if (nodeStatus[node.id]) {
        logEvent('recovered', `${node.id} back online`);
      } else {
        logEvent('failure', `${node.id} failure detected`);
      }
    }
    prevNodeStatus[node.id] = nodeStatus[node.id];
  }

  for (const fileId of Object.keys(metadata)) {
    const meta = metadata[fileId];

    // Step 1: find one healthy, non-corrupted copy to use as the "repair source"
    let sourceNode = null;
    let sourceContent = null;

    for (const nodeId of meta.nodes) {
      const node = NODES.find(n => n.id === nodeId);
      if (!nodeStatus[nodeId]) continue;
      try {
        const chk = await axios.get(`${node.url}/checksum/${fileId}`, { timeout: 2000 });
        if (!chk.data.corrupted) {
          const got = await axios.get(`${node.url}/retrieve/${fileId}`, { timeout: 2000 });
          sourceNode = node;
          sourceContent = got.data.content;
          break;
        }
      } catch {
        // file missing on this node, try next
      }
    }

    if (!sourceContent) continue; // no healthy copy anywhere right now, nothing we can do yet

    // Step 2: check every node that SHOULD have this file, repair if missing/corrupted
    for (const nodeId of meta.nodes) {
      if (!nodeStatus[nodeId]) continue; // node itself is down, skip
      if (nodeId === sourceNode.id) continue;
      const node = NODES.find(n => n.id === nodeId);
      try {
        const chk = await axios.get(`${node.url}/checksum/${fileId}`, { timeout: 2000 });
        if (chk.data.corrupted) {
          await axios.post(`${node.url}/store/${fileId}`, { content: sourceContent });
          console.log(`[REPAIR] Fixed corrupted copy of ${fileId} on ${nodeId}`);
          logEvent('repair', `${meta.filename} — corrupted replica on ${nodeId} automatically repaired`);
        }
      } catch {
        // file missing entirely -> restore it
        try {
          await axios.post(`${node.url}/store/${fileId}`, { content: sourceContent });
          console.log(`[REPAIR] Restored missing copy of ${fileId} on ${nodeId}`);
          logEvent('repair', `${meta.filename} — missing replica on ${nodeId} automatically restored`);
        } catch {}
      }
    }
  }
}

setInterval(backgroundChecker, 5000);
backgroundChecker();

// ---------- UPLOAD: replicate to all available nodes ----------
app.post('/upload', async (req, res) => {
  const { fileId, content, filename, mimeType } = req.body;
  if (!fileId || !content) return res.status(400).json({ error: 'fileId and content required' });

  const results = [];
  const successNodes = [];

  for (const node of NODES) {
    try {
      await axios.post(`${node.url}/store/${fileId}`, { content }, { timeout: 5000 });
      successNodes.push(node.id);
      results.push({ nodeId: node.id, status: 'success' });
    } catch (err) {
      results.push({ nodeId: node.id, status: 'failed' });
    }
  }

  if (successNodes.length === 0) {
    return res.status(500).json({ error: 'Upload failed on all nodes' });
  }

  metadata[fileId] = {
    nodes: NODES.map(n => n.id), // ye "target" replicas hain — down node baad mein auto-repair se milega
    size: content.length,
    filename: filename || fileId,
    mimeType: mimeType || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  };

  logEvent('upload', `${metadata[fileId].filename} replicated to ${successNodes.length}/${NODES.length} nodes`);

  res.json({ success: true, fileId, replicatedTo: successNodes, results });
});

// ---------- DOWNLOAD: jo bhi node available hai usse de do ----------
app.get('/download/:fileId', async (req, res) => {
  const { fileId } = req.params;
  if (!metadata[fileId]) return res.status(404).json({ error: 'Unknown file' });

  for (const node of NODES) {
    try {
      const r = await axios.get(`${node.url}/retrieve/${fileId}`, { timeout: 2000 });
      return res.json({
        success: true,
        servedBy: node.id,
        content: r.data.content,
        filename: metadata[fileId].filename,
        mimeType: metadata[fileId].mimeType,
      });
    } catch {
      continue; // is node se nahi mila, agle node try karo
    }
  }
  res.status(503).json({ error: 'File currently unavailable on all nodes' });
});

// ---------- STATUS: dashboard ke liye poora cluster + files ka health ----------
app.get('/status', async (req, res) => {
  for (const node of NODES) {
    nodeStatus[node.id] = await checkNodeHealth(node);
  }

  const files = await Promise.all(
    Object.keys(metadata).map(async fileId => {
      const replicaStatus = {};
      for (const node of NODES) {
        if (!nodeStatus[node.id]) {
          replicaStatus[node.id] = 'node-down';
          continue;
        }
        try {
          const r = await axios.get(`${node.url}/checksum/${fileId}`, { timeout: 2000 });
          replicaStatus[node.id] = r.data.corrupted ? 'corrupted' : 'healthy';
        } catch {
          replicaStatus[node.id] = 'missing';
        }
      }
      return { fileId, ...metadata[fileId], replicaStatus };
    })
  );

  const totalStorageBytes = Object.values(metadata).reduce(
    (sum, m) => sum + Math.floor((m.size || 0) * 3 / 4), // base64 length se approx original bytes
    0
  );
  const nodesUp = NODES.filter(n => nodeStatus[n.id]).length;

  res.json({
    nodes: NODES.map(n => ({ ...n, up: nodeStatus[n.id] })),
    files,
    summary: {
      totalObjects: Object.keys(metadata).length,
      totalNodes: NODES.length,
      nodesUp,
      totalStorageBytes,
      healthPercent: NODES.length ? Math.round((nodesUp / NODES.length) * 100) : 0,
    },
  });
});

// ---------- RECOVERY TAB: activity/event log ----------
app.get('/events', (req, res) => {
  res.json({ events });
});

// ---------- DEMO HELPER: kisi node pe kisi file ko corrupt kar do ----------
app.post('/simulate-corrupt/:nodeId/:fileId', async (req, res) => {
  const { nodeId, fileId } = req.params;
  const node = NODES.find(n => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Unknown node' });
  try {
    const r = await axios.get(`${node.url}/retrieve/${fileId}`);
    const corrupted = r.data.content.slice(0, -10) + 'XXXXXXXXXX'; // content ko tamper kar do
    await axios.post(`${node.url}/store-raw-corrupt/${fileId}`, { content: corrupted });
    logEvent('corruption', `${metadata[fileId]?.filename || fileId} — corruption simulated on ${nodeId}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Coordinator running on http://localhost:${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}`);
});
