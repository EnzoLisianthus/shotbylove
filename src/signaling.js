const NTFY_BASE="https://ntfy.sh";
const PROTOCOL_VERSION=2;
const encoder=new TextEncoder();
const KEY_PATTERN=/^[A-Za-z0-9_-]{22}$/;

function bytesToBase64Url(bytes){let bin="";for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function base64UrlToBytes(value){const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);const bin=atob(padded);return Uint8Array.from(bin,c=>c.charCodeAt(0))}
function hex(bytes){return[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function sha256(value){return crypto.subtle.digest("SHA-256",encoder.encode(value))}
async function hmac(secret,value){const key=await crypto.subtle.importKey("raw",base64UrlToBytes(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(value))))}
function canonical(message){return JSON.stringify([message.v,message.room,message.from,message.seq,message.ts,message.type,message.payload])}
function makeClientId(){return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(12)))}

export function createSessionSecret(){return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))}
export function normalizeSessionInput(input){
  let raw=String(input||"").trim();
  if(!raw)return"";
  try{if(/^https?:\/\//i.test(raw))raw=new URL(raw).hash}catch{return""}
  if(raw.startsWith("#"))raw=raw.slice(1);
  if(raw.startsWith("/"))raw=raw.slice(1);
  if(raw.startsWith("join/"))raw=raw.slice(5);
  return KEY_PATTERN.test(raw)?raw:"";
}
export async function sessionLabel(secret){const digest=new Uint8Array(await sha256("label:"+secret));const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let out="";for(let i=0;i<8;i++)out+=alphabet[digest[i]%alphabet.length];return out.slice(0,4)+"-"+out.slice(4)}
async function topicForSecret(secret){const digest=await sha256("shotbylove:v0:"+secret);return"sbl-"+hex(digest).slice(0,40)}

export class NtfySignaling extends EventTarget{
  constructor(secret,deviceId){
    super();
    this.secret=secret;
    this.deviceId=deviceId;
    this.clientId=makeClientId(); // Unique to this tab/connection, not shared across tabs.
    this.seq=0;
    this.source=null;
    this.topic="";
    this.opened=false;
    this.closed=false;
    this.seen=new Map();
  }

  async connect(){
    this.closed=false;
    this.topic=await topicForSecret(this.secret);
    const source=new EventSource(NTFY_BASE+"/"+encodeURIComponent(this.topic)+"/sse");
    this.source=source;

    source.addEventListener("message",async event=>{
      if(this.closed)return;
      try{
        const outer=JSON.parse(event.data);
        if(outer.event!=="message"||!outer.message)return;
        const message=JSON.parse(outer.message);
        if(message.from===this.clientId||message.v!==PROTOCOL_VERSION||message.room!==this.topic)return;
        if(!Number.isFinite(message.ts)||Math.abs(Date.now()-message.ts)>120000)return;
        if(typeof message.from!=="string"||!Number.isSafeInteger(message.seq)||message.seq<=0)return;
        const expected=await hmac(this.secret,canonical(message));
        if(expected!==message.sig||this.closed)return;
        // HMAC checks finish asynchronously; do not discard valid lower sequence
        // numbers merely because a later ICE message was verified first.
        let sequenceSet=this.seen.get(message.from);
        if(!sequenceSet){sequenceSet=new Set();this.seen.set(message.from,sequenceSet)}
        if(sequenceSet.has(message.seq))return;
        sequenceSet.add(message.seq);
        if(sequenceSet.size>256)sequenceSet.delete(sequenceSet.values().next().value);
        if(this.seen.size>64)this.seen.delete(this.seen.keys().next().value);
        this.dispatchEvent(new CustomEvent("message",{detail:message}));
      }catch{}
    });

    await new Promise((resolve,reject)=>{
      let settled=false;
      const timer=setTimeout(()=>{
        if(settled)return;
        settled=true;
        source.close();
        reject(new Error("Signaling connection timed out"));
      },12000);
      source.addEventListener("open",()=>{
        if(this.closed)return;
        this.opened=true;
        this.dispatchEvent(new CustomEvent("state",{detail:"connected"}));
        if(!settled){settled=true;clearTimeout(timer);resolve()}
      });
      source.addEventListener("error",()=>{
        this.opened=false;
        if(!this.closed)this.dispatchEvent(new CustomEvent("state",{detail:"reconnecting"}));
      });
    });
  }

  async send(type,payload=null){
    if(!this.opened||this.closed)throw new Error("Signaling is offline");
    const message={v:PROTOCOL_VERSION,room:this.topic,from:this.clientId,seq:++this.seq,ts:Date.now(),type,payload};
    message.sig=await hmac(this.secret,canonical(message));
    const response=await fetch(NTFY_BASE+"/"+encodeURIComponent(this.topic),{
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8","Cache":"no"},
      body:JSON.stringify(message)
    });
    if(!response.ok){
      let detail="";
      try{detail=(await response.text()).trim().slice(0,240)}catch{}
      throw new Error("Signaling publish failed ("+response.status+")"+(detail?": "+detail:""));
    }
  }

  close(){
    this.closed=true;
    this.opened=false;
    this.source?.close();
    this.source=null;
    this.dispatchEvent(new CustomEvent("state",{detail:"closed"}));
  }
}
