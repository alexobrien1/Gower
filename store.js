// store.js — tiny JSON-collection datastore on the persistent disk (DATA_DIR).
// Atomic writes via temp file + rename. No native deps. Fine for this volume.
// Collections (arrays of {id,...}): repairs, condition_reports, tenants.
// Docs (single objects): compliance.
const fs = require('fs'), path = require('path');
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

function ensure(){ if(!fs.existsSync(DIR)) fs.mkdirSync(DIR, {recursive:true}); }
function file(name){ return path.join(DIR, name + '.json'); }
function read(name, fallback){ ensure(); try{ return JSON.parse(fs.readFileSync(file(name),'utf8')); }catch(e){ return fallback; } }
function write(name, val){ ensure(); const tmp = file(name)+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(val,null,1)); fs.renameSync(tmp, file(name)); return val; }

// ---- collection helpers (array of records) ----
function list(name){ const v = read(name, []); return Array.isArray(v) ? v : []; }
function newId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function add(name, rec){
  const arr = list(name);
  rec.id = rec.id || newId();
  rec.created_at = rec.created_at || new Date().toISOString();
  arr.unshift(rec);
  write(name, arr);
  return rec;
}
function update(name, id, patch){
  const arr = list(name);
  const i = arr.findIndex(x => String(x.id) === String(id));
  if(i < 0) return null;
  arr[i] = Object.assign({}, arr[i], patch, { updated_at: new Date().toISOString() });
  write(name, arr);
  return arr[i];
}
function remove(name, id){
  const arr = list(name).filter(x => String(x.id) !== String(id));
  write(name, arr);
  return true;
}

// ---- doc helpers (single object) ----
function getDoc(name, fallback){ return read(name, fallback === undefined ? {} : fallback); }
function setDoc(name, val){ return write(name, val); }

module.exports = { DIR, read, write, list, add, update, remove, getDoc, setDoc, newId };
