import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export const dynamic='force-dynamic';
type Row=Record<string,any>;
const bindings=()=>env as unknown as {DB:D1Database;BUCKET:R2Bucket;OWNER_EMAIL?:string};
const now=()=>new Date().toISOString();
const fail: (message:string,status?:number)=>never = (message,status=400)=>{throw Object.assign(new Error(message),{status})};
const str=(v:any,max=200)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():fail('Please check the required fields.');
const email=(v:any)=>{const e=str(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))fail('Enter a valid email address.');return e};
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function identity(){
 const user=await getChatGPTUser();if(!user)fail('Sign in with ChatGPT to continue.',401);
 const {DB:db}=bindings();if(!db)fail('Storage is temporarily unavailable.',503);
 return {db,user:user!,email:user!.email.toLowerCase()};
}
async function context(){
 const c=await identity();
 const member=await c.db.prepare('SELECT * FROM members WHERE email=? AND user_id=?').bind(c.email,c.user.userId).first<Row>();
 if(!member)fail('Complete account setup to continue.',403);
 return {...c,member,owner:member!.role==='owner'};
}
type Context=Awaited<ReturnType<typeof context>>;
async function workspace(c:Context,id:string):Promise<Row>{
 const w=await c.db.prepare('SELECT w.*,m.role AS member_role FROM workspaces w LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.email=? WHERE w.id=?').bind(c.email,id).first<Row>();
 if(!w||(w.owner_id!==c.user.userId&&!w.member_role))fail('Workspace not found or access removed.',404);
 return {...w,canManage:w!.owner_id===c.user.userId||w!.member_role==='admin'};
}
async function managedWorkspace(c:Context,id:string){const w=await workspace(c,id);if(!w.canManage)fail('Only the space owner or an admin can manage this space.',403);return w;}
async function documentAccess(c:Context,id:string,write=false,manage=false):Promise<Row>{
 const d=await c.db.prepare('SELECT * FROM documents WHERE id=?').bind(id).first<Row>();if(!d)fail('Document not found.',404);
 await workspace(c,d.workspace_id);
 let node:Row|null=d;let canEdit=true;const seen=new Set<string>();
 while(node){
  if(seen.has(node.id))fail('Invalid page hierarchy.',409);seen.add(node.id);
  const owner=node.owner_id===c.user.userId;
  const grant=await c.db.prepare('SELECT role FROM collaborators WHERE document_id=? AND email=?').bind(node.id,c.email).first<Row>();
  if(!owner&&node.restricted&&!grant)fail('Document not found.',404);
  if(!owner&&grant?.role==='viewer')canEdit=false;
  if(node.parent_id){node=await c.db.prepare('SELECT * FROM documents WHERE id=?').bind(node.parent_id).first<Row>();if(!node)fail('Parent page not found.',404);}else node=null;
 }
 if(write&&!canEdit)fail('You have read-only access.',403);
 const canManage=d.owner_id===c.user.userId;
 if(manage&&!canManage)fail('Only the document owner can change sharing.',403);
 return {...d,canEdit,canManage};
}
async function visibleDocuments(c:Context,rows:Row[]){const result:Row[]=[];for(const row of rows){try{await documentAccess(c,row.id);result.push(row)}catch(e:any){if(e.status!==404&&e.status!==403)throw e}}return result;}
async function detail(c:Context,id:string){const doc=await documentAccess(c,id);const [comments,history,files,collaborators,blocks]=await Promise.all([c.db.prepare('SELECT * FROM comments WHERE document_id=? ORDER BY created_at').bind(id).all(),c.db.prepare('SELECT id,title,version,author,created_at FROM revisions WHERE document_id=? ORDER BY version DESC LIMIT 50').bind(id).all(),c.db.prepare('SELECT * FROM attachments WHERE document_id=? ORDER BY created_at').bind(id).all(),c.db.prepare('SELECT email,role FROM collaborators WHERE document_id=?').bind(id).all(),c.db.prepare('SELECT * FROM blocks WHERE document_id=? ORDER BY position,id').bind(id).all()]);const childRows=await c.db.prepare('SELECT id,title,icon,parent_id FROM documents WHERE parent_id=? ORDER BY updated_at DESC').bind(id).all<Row>();const children=await visibleDocuments(c,childRows.results);const ancestors:Row[]=[];let parent=doc.parent_id;while(parent){const row=await documentAccess(c,parent);ancestors.unshift({id:row.id,title:row.title});parent=row.parent_id;}return {...doc,children,ancestors,blocks:blocks.results,comments:comments.results,history:history.results,files:files.results,collaborators:collaborators.results}}
export async function GET(req:Request){try{const ident=await identity();const profile=await ident.db.prepare('SELECT * FROM members WHERE email=? AND user_id=?').bind(ident.email,ident.user.userId).first<Row>();if(!profile)return json({needsSetup:true,user:ident.user});const c=await context();const u=new URL(req.url);const imageSpace=u.searchParams.get('workspaceImage');if(imageSpace){const w=await workspace(c,imageSpace);if(!w.image_id)fail('Space image not found.',404);const image=await bindings().BUCKET.get(w.image_id);if(!image)fail('Space image not found.',404);return new Response(image.body,{headers:{'Content-Type':w.image_type||'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}const id=u.searchParams.get('id');const file=u.searchParams.get('file');const revision=u.searchParams.get('revision');if(file){const f=await c.db.prepare('SELECT * FROM attachments WHERE id=?').bind(file).first<Row>();if(!f)fail('File not found.',404);await documentAccess(c,f!.document_id);const obj=await bindings().BUCKET.get(file);if(!obj)fail('File not found.',404);return new Response(obj!.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f!.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}if(revision){const r=await c.db.prepare('SELECT * FROM revisions WHERE id=?').bind(revision).first<Row>();if(!r)fail('Version not found.',404);await documentAccess(c,r!.document_id);return json(r)}if(id)return json(await detail(c,id));const workspaces=await c.db.prepare("SELECT w.*,CASE WHEN w.owner_id=? OR m.role='admin' THEN 1 ELSE 0 END AS canManage,CASE WHEN w.owner_id=? THEN 'owner' ELSE m.role END AS role FROM workspaces w LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.email=? WHERE w.owner_id=? OR m.email=? ORDER BY created_at").bind(c.user.userId,c.user.userId,c.email,c.user.userId,c.email).all<Row>();
const docs=await c.db.prepare("SELECT d.*, CASE WHEN d.owner_id=? THEN 1 ELSE 0 END as canManage FROM documents d JOIN workspaces w ON w.id=d.workspace_id WHERE (w.owner_id=? OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.email=?)) AND (d.restricted=0 OR d.owner_id=? OR EXISTS(SELECT 1 FROM collaborators a WHERE a.document_id=d.id AND a.email=?)) ORDER BY d.updated_at DESC").bind(c.user.userId,c.user.userId,c.email,c.user.userId,c.email).all();
const grants=await c.db.prepare("SELECT wm.*,m.name,m.joined_at FROM workspace_members wm JOIN members m ON m.email=wm.email WHERE EXISTS(SELECT 1 FROM workspaces w WHERE w.id=wm.workspace_id AND (w.owner_id=? OR EXISTS(SELECT 1 FROM workspace_members mine WHERE mine.workspace_id=w.id AND mine.email=?))) UNION ALL SELECT w.id,m.email,'owner',m.name,m.joined_at FROM workspaces w JOIN members m ON m.user_id=w.owner_id WHERE w.owner_id=? OR EXISTS(SELECT 1 FROM workspace_members mine WHERE mine.workspace_id=w.id AND mine.email=?)").bind(c.user.userId,c.email,c.user.userId,c.email).all();
return json({user:{...c.user,displayName:c.member.name,fullName:c.member.name,isOwner:c.owner},workspaces:workspaces.results,documents:await visibleDocuments(c,docs.results),members:[],workspaceMembers:grants.results});}catch(e:any){console.error('space read',e.message);return json({error:e.status?e.message:'Unable to load your workspace. Please retry.'},e.status||503)}}
export async function POST(req:Request){try{if(req.headers.get('origin')!==new URL(req.url).origin)fail('Request origin is not allowed.',403);if(req.headers.get('content-type')?.includes('application/json')){
 const setup=await req.clone().json() as Row;if(setup.action==='register'){
 const c=await identity();const name=str(setup.name,80);
 const existing=await c.db.prepare('SELECT user_id FROM members WHERE email=?').bind(c.email).first<Row>();
 if(existing?.user_id&&existing.user_id!==c.user.userId)fail('This account belongs to another sign-in.',403);
 await c.db.prepare("INSERT INTO members(email,user_id,name,role,joined_at) VALUES(?,?,?,'member',?) ON CONFLICT(email) DO UPDATE SET user_id=excluded.user_id,name=excluded.name,joined_at=COALESCE(members.joined_at,excluded.joined_at) WHERE members.user_id IS NULL OR members.user_id=excluded.user_id").bind(c.email,c.user.userId,name,now()).run();return json({ok:true});
 }}const c=await context();if(req.headers.get('content-type')?.includes('multipart/form-data')){if(Number(req.headers.get('content-length')||0)>21*1024*1024)fail('Files must be 20 MB or smaller.');const form=await req.formData();if(form.get('action')==='workspaceImage'){
 const w=await managedWorkspace(c,str(form.get('workspaceId')));const file=form.get('file');if(!(file instanceof File)||!file.size||file.size>5*1024*1024)fail('Choose a PNG, JPEG, GIF, or WebP image up to 5 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());const signature=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
 const mime=bytes[0]===137&&signature(1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':signature(0,6)==='GIF87a'||signature(0,6)==='GIF89a'?'image/gif':signature(0,4)==='RIFF'&&signature(8,12)==='WEBP'?'image/webp':null;
 if(!mime)fail('Choose a PNG, JPEG, GIF, or WebP image.');const key='workspace-'+crypto.randomUUID();await bindings().BUCKET.put(key,bytes);
 try{await c.db.prepare('UPDATE workspaces SET image_id=?,image_type=? WHERE id=?').bind(key,mime,w.id).run()}catch(e){await bindings().BUCKET.delete(key);throw e}
 if(w.image_id)try{await bindings().BUCKET.delete(w.image_id)}catch(e){console.error('Space image cleanup failed',e)}return json({ok:true});
 }const documentId=str(form.get('documentId'));await documentAccess(c,documentId,true);const f=form.get('file');if(!(f instanceof File)||f.size>20*1024*1024)fail('Choose a file of 20 MB or smaller.');const id=crypto.randomUUID();await bindings().BUCKET.put(id,f.stream());try{await c.db.prepare('INSERT INTO attachments(id,document_id,name,size,created_at) VALUES(?,?,?,?,?)').bind(id,documentId,f.name.slice(0,255),f.size,now()).run()}catch(e){await bindings().BUCKET.delete(id);throw e}return json({id})}
 const bodyText=await req.text();if(bodyText.length>1100000)fail('Document is too large.');const b=JSON.parse(bodyText);const id=b.id;const stamp=now();
 switch(b.action){
 case 'createWorkspace':{const name=str(b.name,80);const visibility=b.visibility==='private'?'private':'team';const wid=crypto.randomUUID();await c.db.prepare('INSERT INTO workspaces(id,name,description,visibility,owner_id,created_at) VALUES(?,?,?,?,?,?)').bind(wid,name,typeof b.description==='string'?b.description.slice(0,200):'',visibility,c.user.userId,stamp).run();return json({id:wid})}
 case 'updateWorkspace':{await managedWorkspace(c,str(id));const name=str(b.name,80);if(typeof b.description!=='string'||b.description.length>200)fail('Keep the description under 200 characters.');await c.db.prepare('UPDATE workspaces SET name=?,description=? WHERE id=?').bind(name,b.description.trim(),id).run();return json({ok:true});}
 case 'removeWorkspaceImage':{const w=await managedWorkspace(c,str(id));await c.db.prepare('UPDATE workspaces SET image_id=NULL,image_type=NULL WHERE id=?').bind(id).run();if(w.image_id)try{await bindings().BUCKET.delete(w.image_id)}catch(e){console.error('Space image cleanup failed',e)}return json({ok:true});}
 case 'invite':
 case 'shareWorkspace':{const w=await managedWorkspace(c,str(id));const em=email(b.email);const owner=await c.db.prepare('SELECT email FROM members WHERE user_id=?').bind(w.owner_id).first<Row>();if(em===owner?.email)fail('The space owner cannot be changed or removed.');if(em===c.email)fail('You cannot change your own membership.');
 if(b.remove){await c.db.batch([c.db.prepare('DELETE FROM collaborators WHERE email=? AND document_id IN (SELECT id FROM documents WHERE workspace_id=?)').bind(em,id),c.db.prepare('DELETE FROM workspace_members WHERE workspace_id=? AND email=?').bind(id,em)]);}else{
 const role=b.role==='admin'?'admin':'member';
 await c.db.batch([c.db.prepare("INSERT OR IGNORE INTO members(email,name,role) VALUES(?,?,'member')").bind(em,em.split('@')[0]),c.db.prepare('INSERT INTO workspace_members(workspace_id,email,role) VALUES(?,?,?) ON CONFLICT(workspace_id,email) DO UPDATE SET role=excluded.role').bind(id,em,role)]);
 }return json({ok:true})}
 case 'addBlock':{await documentAccess(c,str(id),true);const bid=crypto.randomUUID();const kind=['kanban','checklist'].includes(b.kind)?b.kind:'text';const content=kind==='text'?'':JSON.stringify({title:kind==='kanban'?'Kanban board':'Checklist',tasks:[]});await c.db.prepare('INSERT INTO blocks(id,document_id,kind,content,position) SELECT ?,?,?,?,COALESCE(MAX(position),0)+1 FROM blocks WHERE document_id=?').bind(bid,id,kind,content,id).run();return json({id:bid})}
 case 'saveBlock':
 case 'deleteBlock':{const block=await c.db.prepare('SELECT * FROM blocks WHERE id=?').bind(str(b.blockId)).first<Row>();if(!block)fail('Block not found.',404);await documentAccess(c,block!.document_id,true);
 if(b.action==='deleteBlock')await c.db.prepare('DELETE FROM blocks WHERE id=?').bind(block!.id).run();else{
 if(typeof b.content!=='string'||b.content.length>50000)fail('Keep each block under 50,000 characters. Add another block to continue.');
 if(['kanban','checklist'].includes(b.kind)){
 let data:Row;try{data=JSON.parse(b.content)}catch{fail('Invalid task data.');}if(!data||typeof data.title!=='string'||data.title.length>120||!Array.isArray(data.tasks)||data.tasks.length>200)fail('Use a title under 120 characters and at most 200 tasks.');
 const ids=new Set<string>();for(const task of data.tasks){if(!task||typeof task.id!=='string'||!task.id||task.id.length>80||ids.has(task.id)||typeof task.title!=='string'||task.title.length>500||!['todo','doing','done'].includes(task.status))fail('Invalid task. Use a title under 500 characters and a valid status.');ids.add(task.id)}
 }
 const result=await c.db.prepare('UPDATE blocks SET content=?,kind=?,version=version+1 WHERE id=? AND version=?').bind(b.content,['text','heading','todo','bullet','quote','kanban','checklist'].includes(b.kind)?b.kind:'text',block!.id,b.version).run();if(!result.meta.changes)fail('This block has changed. Copy your draft, then reload before saving.',409);
 }return json({ok:true})}
 case 'createDocument':{await workspace(c,str(b.workspaceId));const parentId=b.parentId?str(b.parentId):null;if(parentId){const parent=await documentAccess(c,parentId,true);if(parent.workspace_id!==b.workspaceId)fail('A child page must be in the same workspace.');}const did=crypto.randomUUID();const title=str(b.title,200);const content=typeof b.content==='string'?b.content.slice(0,500000):'';await c.db.prepare('INSERT INTO documents(id,workspace_id,title,content,kind,status,restricted,owner_id,updated_by,version,updated_at,parent_id) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)').bind(did,b.workspaceId,title,content,b.kind==='project'?'project':'document','Draft',b.restricted?1:0,c.user.userId,c.email,stamp,parentId).run();return json({id:did})}
 case 'setDocumentIcon':{await documentAccess(c,str(id),true);if(typeof b.icon!=='string'||b.icon.length>32||(b.icon!==''&&(!/^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0f\u20e3\d#*]+$/u.test(b.icon)||[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(b.icon)].length!==1)))fail('Choose a single emoji or clear the icon.');await c.db.prepare('UPDATE documents SET icon=? WHERE id=?').bind(b.icon,id).run();return json({ok:true,icon:b.icon});}
 case 'deleteDocument':{const d=await documentAccess(c,str(id));if(!d.canManage)fail('Only the document owner can delete this document.',403);
 const child=await c.db.prepare('SELECT id FROM documents WHERE parent_id=? LIMIT 1').bind(id).first();if(child)fail('Delete the nested pages first, then delete this document.',409);
 const files=await c.db.prepare('SELECT id FROM attachments WHERE document_id=?').bind(id).all<Row>();
 await c.db.batch([...['attachments','collaborators','comments','revisions','blocks'].map(table=>c.db.prepare(`DELETE FROM ${table} WHERE document_id=?`).bind(id)),c.db.prepare('DELETE FROM documents WHERE id=?').bind(id)]);
 for(const file of files.results){try{await bindings().BUCKET.delete(file.id)}catch(e){console.error('Deleted document attachment cleanup failed',file.id,e)}}
 return json({ok:true});}
 case 'saveDocument':{const d=await documentAccess(c,str(id),true);if(b.version!==d.version)fail('Someone else saved a newer version. Your draft is safe here. Copy your changes, then reload the document.',409);const title=str(b.title,200);if(typeof b.content!=='string'||b.content.length>500000)fail('Content must be under 500,000 characters.');const status=['Draft','In progress','In review','Done'].includes(b.status)?b.status:d.status;const result=await c.db.batch([c.db.prepare('INSERT INTO revisions(id,document_id,title,content,version,author,created_at) SELECT ?,id,title,content,version,updated_by,updated_at FROM documents WHERE id=? AND version=?').bind(crypto.randomUUID(),id,b.version),c.db.prepare('UPDATE documents SET title=?,content=?,status=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(title,b.content,status,c.email,stamp,id,b.version)]);if(!result[1].meta.changes)fail('A newer version was saved. Copy your draft before reloading.',409);return json(await detail(c,id))}
 case 'shareDocument':{await documentAccess(c,str(id),false,true);const em=email(b.email);const m=await c.db.prepare('SELECT email FROM members WHERE email=?').bind(em).first();if(!m)fail('Invite this person to the space first.');const d=await documentAccess(c,str(id));const allowed=await c.db.prepare('SELECT 1 FROM workspaces w WHERE w.id=? AND (w.owner_id=(SELECT user_id FROM members WHERE email=?) OR EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=w.id AND wm.email=?))').bind(d.workspace_id,em,em).first();if(!allowed)fail('Invite this person to the space first.');if(b.remove)await c.db.prepare('DELETE FROM collaborators WHERE document_id=? AND email=?').bind(id,em).run();else await c.db.prepare('INSERT INTO collaborators(document_id,email,role) VALUES(?,?,?) ON CONFLICT(document_id,email) DO UPDATE SET role=excluded.role').bind(id,em,b.role==='viewer'?'viewer':'editor').run();return json({ok:true})}
 case 'setDocumentAccess':{await documentAccess(c,str(id),false,true);await c.db.prepare('UPDATE documents SET restricted=? WHERE id=?').bind(b.restricted?1:0,id).run();return json({ok:true})}
 case 'comment':{await documentAccess(c,str(id));await c.db.prepare('INSERT INTO comments(id,document_id,author,body,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,c.email,str(b.body,4000),stamp).run();return json({ok:true})}
 default:fail('Unknown action.');}
 }catch(e:any){console.error('space write',e.message);return json({error:e.status?e.message:'Unable to save. Your changes are still here; please retry.'},e.status||503)}}
