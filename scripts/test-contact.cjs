const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require(process.env.NOBATAK_TYPESCRIPT || 'typescript');
const file=path.join(__dirname,'../app/api/contact/route.ts');
const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(env={},fetcher=()=>{throw Error('Unexpected outbound call')}){const exports={};vm.runInNewContext(source,{exports,require,process:{env},Response,Request,Buffer,AbortSignal,URL,fetch:fetcher});return exports.POST;}
const data={name:'Test User',email:'test@example.com',topic:'مشکل فنی',message:'This is a test message only.',website:'',requestId:'11111111-1111-4111-8111-111111111111'};
const req=(body=data,origin='https://nobatak.example')=>new Request('https://nobatak.example/api/contact',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
(async()=>{
 assert.equal((await load()(req(data,'https://other.example'))).status,403);
 assert.equal((await load()(req({...data,email:'bad'}))).status,400);
 assert.equal((await load()(req({...data,website:'spam'}))).status,400);
 assert.equal((await load()(req({...data,message:'x'.repeat(25000)}))).status,413);
 assert.equal((await load()(req())).status,503);
 let sent;const post=load({RESEND_API_KEY:'test-only',CONTACT_FROM_EMAIL:'verified@example.com'},async(url,options)=>{sent={url,...options};return Response.json({id:'fake-provider-id'});});
 assert.equal((await post(req())).status,200);const payload=JSON.parse(sent.body);assert.deepEqual(payload.to,['fahimullahrasty@gmail.com']);assert.equal(payload.reply_to,'test@example.com');assert.equal(sent.headers['Idempotency-Key'],'contact-'+data.requestId);assert.ok(payload.text.includes(data.message));
 const fail=load({RESEND_API_KEY:'test-only',CONTACT_FROM_EMAIL:'verified@example.com'},async()=>Response.json({error:'failed'},{status:500}));assert.equal((await fail(req())).status,502);
 const limited=load();for(let i=0;i<5;i++)await limited(req());assert.equal((await limited(req())).status,429);
 console.log('PASS: origin, validation, honeypot, size limit, honest unconfigured/failure responses, fixed email recipient, idempotency key and rate limit. No emails sent.');
})().catch(e=>{console.error(e);process.exit(1)});
