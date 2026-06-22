// Simple, dependency-free JSON datastore. Fine for low volume; atomic writes via temp file.
const fs=require('fs'), path=require('path');
const dir=process.env.DATA_DIR||path.join(__dirname,'data');
const file=path.join(dir,'applications.json');

function ensure(){
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  if(!fs.existsSync(file)) fs.writeFileSync(file,'[]');
}
function list(){
  ensure();
  try { return JSON.parse(fs.readFileSync(file,'utf8'))||[]; } catch(e){ return []; }
}
function saveAll(arr){
  ensure();
  const tmp=file+'.tmp';
  fs.writeFileSync(tmp, JSON.stringify(arr,null,2));
  fs.renameSync(tmp,file);
}
function add(rec){
  const arr=list();
  rec.id = Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  rec.created_at = new Date().toISOString();
  arr.unshift(rec);
  saveAll(arr);
  return rec;
}
function update(id, patch){
  const arr=list();
  const i=arr.findIndex(x=>String(x.id)===String(id));
  if(i<0) return null;
  arr[i]=Object.assign({},arr[i],patch);
  saveAll(arr);
  return arr[i];
}

module.exports={ list, add, update, saveAll };
