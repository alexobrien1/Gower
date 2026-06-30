// storage.js — file storage abstraction. Local disk under DATA_DIR/files for now.
// Designed so a OneDrive (Microsoft Graph) adapter can be dropped in later behind
// the same save/read/remove interface, without touching callers.
const fs = require('fs'), path = require('path');
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILES = path.join(DIR, 'files');

function ensure(d){ if(!fs.existsSync(d)) fs.mkdirSync(d, {recursive:true}); }
function safe(s){ return String(s||'').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,120) || 'file'; }

// Save a base64 data URL (or raw base64). Returns metadata to store against the record.
function saveBase64(category, filename, dataUrl){
  const cat = safe(category);
  ensure(path.join(FILES, cat));
  let mime = 'application/octet-stream', b64 = dataUrl || '';
  const m = /^data:([^;]+);base64,(.*)$/s.exec(b64);
  if(m){ mime = m[1]; b64 = m[2]; }
  const buf = Buffer.from(b64, 'base64');
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const name = safe(filename);
  const rel = cat + '/' + id + '__' + name;
  fs.writeFileSync(path.join(FILES, rel), buf);
  return { fileId:id, name, size:buf.length, mime, rel, created_at:new Date().toISOString() };
}

function abspath(rel){ return path.join(FILES, rel); }
function exists(rel){ try{ return !!rel && fs.existsSync(abspath(rel)); }catch(e){ return false; } }
function read(rel){ return fs.readFileSync(abspath(rel)); }
function removeFile(rel){ try{ if(rel) fs.unlinkSync(abspath(rel)); }catch(e){} }

module.exports = { FILES, saveBase64, abspath, exists, read, removeFile, safe };
