const NTFY_BASE="https://ntfy.sh";
const PROTOCOL_VERSION=1;
const encoder=new TextEncoder();

function bytesToBase64Url(bytes){let bin="";for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function base64UrlToBytes(value){const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);const bin=atob(padded);return Uint8Array.from(bin,c=>c.charCodeAt(0))}
function hex(bytes){return[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function sha256(value){return crypto.subtle.digest("SHA-256",encoder.encode(value))}
async function hmac(secret,value){const key=await crypto.subtle.importKey("raw",base64UrlToBytes(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(value))))}
function canonical(message){return JSON.stringify([message.v,message.room,message.from,message.seq,message.type,message.payload])}

export function createSessionSecret(){return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))}
export function normalizeSessionInput(input){const raw=input.trim();if(!raw)return"";try{if(/^https?:\/\//i.test(raw)){const url=new URL(raw);return url.hash.replace(/^#\/?join\/?/,"").replace(/^#/,"").trim()}}catch{}return raw.replace(/^#\/?join\/?/,"").trim()}
export async function sessionLabel(secret){const digest=new Uint8Array(await sha256("label:"+secret));const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let out="";for(let i=0;i<8;i++)out+=alphabet[digest[i]%alphabet.length];return out.slice(0,4)+"-"+out.slice(4)}
async function topicForSecret(secret){const digest=await sha256("shotbylove:v0:"+secret);return"sbl-"+hex(digest).slice(0,40)}
function makeClientId(){return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(9)))}

export class NtfySignaling extends EventTarget{
  constructor(secret){super();this.secret=secret;this.clientId=makeClientId();this.seq=0;this.source=null;this.topic="";this.opened=false}
  async connect(){
    this.topic=await topicForSecret(this.secret);
    const url=NTFY_BASE+"/"+encodeURIComponent(this.topic)+"/sse?since=0";
    this.source=new EventSource(url);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Signaling connection timed out")),10000);
      this.source.addEventListener("open",()=>{clearTimeout(timer);this.opened=true;this.dispatchEvent(new CustomEvent("state",{detail:"connected"}));resolve()},{once:true});
      this.source.addEventListener("error",()=>{if(!this.opened){clearTimeout(timer);reject(new Error("Could not connect to signaling transport"))}else this.dispatchEvent(new CustomEvent("state",{detail:"reconnecting"}))})
    });
    this.source.onmessage=async event=>{try{const outer=JSON.parse(event.data);if(outer.event!=="message"||!outer.message)return;const message=JSON.parse(outer.message);if(message.from===this.clientId||message.v!==PROTOCOL_VERSION)return;if(message.room!==this.topic)return;const expected=await hmac(this.secret,canonical(message));if(expected!==message.sig)return;this.dispatchEvent(new CustomEvent("message",{detail:message}))}catch{}}
  }
  async send(type,payload=null){
    if(!this.opened)throw new Error("Signaling is not connected");
    const message={v:PROTOCOL_VERSION,room:this.topic,from:this.clientId,seq:++this.seq,type,payload};
    message.sig=await hmac(this.secret,canonical(message));
    const response=await fetch(NTFY_BASE+"/",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:this.topic,message:JSON.stringify(message),cache:false})});
    if(!response.ok)throw new Error("Signaling publish failed ("+response.status+")")
  }
  close(){this.opened=false;this.source?.close();this.source=null;this.dispatchEvent(new CustomEvent("state",{detail:"closed"}))}
}
