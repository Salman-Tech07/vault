// storageNode.js
// Ye ek "storage node" hai — har node apna alag folder use karta hai file store karne ke liye.
// Hum isko alag-alag PORT aur NODE_ID de ke 3 baar chalayenge (node1, node2, node3)
// taaki 3 independent "storage nodes" simulate ho jaayein.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.argv[2] || 3001;
const NODE_ID = process.argv[3] || 'node1';
const DATA_DIR = path.join(__dirname, 'data', NODE_ID);

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '50mb' }));

function getFilePath(fileId) {
  return path.join(DATA_DIR, fileId);
}

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// --- Health check: coordinator ye call karke check karega node zinda hai ya nahi ---
app.get('/health', (req, res) => {
  res.json({ status: 'up', nodeId: NODE_ID });
});

// --- File store karo (aur uska checksum bhi save karo, integrity check ke liye) ---
app.post('/store/:fileId', (req, res) => {
  const { fileId } = req.params;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'No content provided' });

  fs.writeFileSync(getFilePath(fileId), content, 'utf8');
  const checksum = computeChecksum(content);
  fs.writeFileSync(getFilePath(fileId + '.checksum'), checksum, 'utf8');

  res.json({ success: true, nodeId: NODE_ID, fileId, checksum });
});

// --- File wapas do ---
app.get('/retrieve/:fileId', (req, res) => {
  const { fileId } = req.params;
  const filePath = getFilePath(fileId);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on this node' });
  }
  const content = fs.readFileSync(filePath, 'utf8');
  res.json({ success: true, nodeId: NODE_ID, fileId, content });
});

// --- Checksum verify karo: file corrupt hai ya theek hai batao ---
app.get('/checksum/:fileId', (req, res) => {
  const { fileId } = req.params;
  const filePath = getFilePath(fileId);
  const checksumPath = getFilePath(fileId + '.checksum');
  if (!fs.existsSync(filePath) || !fs.existsSync(checksumPath)) {
    return res.status(404).json({ error: 'File not found on this node' });
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const storedChecksum = fs.readFileSync(checksumPath, 'utf8');
  const actualChecksum = computeChecksum(content);
  const corrupted = actualChecksum !== storedChecksum;
  res.json({ nodeId: NODE_ID, fileId, storedChecksum, actualChecksum, corrupted });
});

// --- Is node pe kaunsi files hain, list karo (debugging ke liye useful) ---
app.get('/list', (req, res) => {
  const files = fs.readdirSync(DATA_DIR).filter(f => !f.endsWith('.checksum'));
  res.json({ nodeId: NODE_ID, files });
});

// --- Demo/testing ke liye: file delete karo (repair test karne ke liye) ---
app.delete('/delete/:fileId', (req, res) => {
  const { fileId } = req.params;
  const filePath = getFilePath(fileId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  const checksumPath = getFilePath(fileId + '.checksum');
  if (fs.existsSync(checksumPath)) fs.unlinkSync(checksumPath);
  res.json({ success: true });
});

// --- Demo ke liye: file content ko corrupt kar do lekin checksum purana hi rehne do ---
// Isse "bit-rot" / data corruption simulate hoti hai — checksum verify karne pe mismatch milega
app.post('/store-raw-corrupt/:fileId', (req, res) => {
  const { fileId } = req.params;
  const { content } = req.body;
  fs.writeFileSync(getFilePath(fileId), content, 'utf8'); // checksum file jaan-bujhke update nahi kar rahe
  res.json({ success: true, note: 'content corrupted, checksum intentionally left mismatched' });
});

app.listen(PORT, () => {
  console.log(`✅ Storage Node [${NODE_ID}] running on http://localhost:${PORT} (data: ${DATA_DIR})`);
});
