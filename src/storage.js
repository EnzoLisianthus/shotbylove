const FALLBACK_LIMIT=512*1024*1024;
function safeTempName(){return".shotbylove-"+crypto.randomUUID()+".part"}
class MemorySink{
  constructor(meta){this.meta=meta;this.parts=[];this.kind="memory"}
  async open(){if(this.meta.size>FALLBACK_LIMIT)throw new Error("This browser has no streaming file sink and the file is too large for the safe memory fallback.")}
  async write(_offset,data){this.parts.push(data)}
  async finish(){const blob=new Blob(this.parts,{type:this.meta.type||"application/octet-stream"});this.parts=[];return{blob,kind:this.kind,cleanup:async()=>{}}}
  async abort(){this.parts=[]}
}
class OpfsSink{
  constructor(meta){this.meta=meta;this.kind="opfs";this.root=null;this.name=safeTempName();this.handle=null;this.writable=null}
  async open(){this.root=await navigator.storage.getDirectory();this.handle=await this.root.getFileHandle(this.name,{create:true});this.writable=await this.handle.createWritable()}
  async write(offset,data){await this.writable.write({type:"write",position:offset,data})}
  async finish(){await this.writable.close();const file=await this.handle.getFile();return{blob:file,kind:this.kind,cleanup:async()=>{try{await this.root.removeEntry(this.name)}catch{}}}}
  async abort(){try{await this.writable?.abort()}catch{}try{await this.root?.removeEntry(this.name)}catch{}}
}
export async function createReceiveSink(meta){if(navigator.storage?.getDirectory){try{const sink=new OpfsSink(meta);await sink.open();return sink}catch{}}const sink=new MemorySink(meta);await sink.open();return sink}
