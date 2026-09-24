'use client';
import {useState} from 'react';
import {Plus,Trash2,Save} from 'lucide-react';
type Block={id:string;content:string;kind:string;version:number};
export default function Blocks({blocks,canEdit,mutate}:{blocks:Block[];canEdit:boolean;mutate:(action:Record<string,unknown>)=>Promise<void>}){
 return <section className="blocks"><p className="empty-hint">{blocks.length} blocks · No block count limit. Each block saves separately.</p>{blocks.map(block=><BlockEditor key={block.id+':'+block.version} block={block} canEdit={canEdit} mutate={mutate}/>)}{canEdit&&<button className="secondary" onClick={()=>mutate({action:'addBlock'})}><Plus size={16}/>Add block</button>}</section>;
}
function BlockEditor({block,canEdit,mutate}:{block:Block;canEdit:boolean;mutate:(action:Record<string,unknown>)=>Promise<void>}){
 const [text,setText]=useState(block.content),[kind,setKind]=useState(block.kind),[busy,setBusy]=useState(false),[remove,setRemove]=useState(false);
 const dirty=text!==block.content||kind!==block.kind;
 async function save(action:string){setBusy(true);try{await mutate({action,blockId:block.id,content:text,kind,version:block.version})}finally{setBusy(false)}}
 return <article className="block-editor"><div className="block-toolbar"><select aria-label="Block type" disabled={!canEdit||busy} value={kind} onChange={e=>setKind(e.target.value)}>{['text','heading','todo','bullet','quote'].map(k=><option key={k} value={k}>{k==='todo'?'To-do':k[0].toUpperCase()+k.slice(1)}</option>)}</select>{canEdit&&<><button className="text-button" disabled={!dirty||busy} onClick={()=>save('saveBlock')}><Save size={14}/>{dirty?'Save block':'Saved'}</button><button aria-label="Delete block" disabled={busy} onClick={()=>setRemove(!remove)}><Trash2 size={15}/></button></>}</div><textarea aria-label="Block content" data-block-dirty={dirty?'true':'false'} className={'block-content block-'+kind} value={text} placeholder="Write something…" readOnly={!canEdit} onChange={e=>setText(e.target.value)} maxLength={50000}/>{remove&&<div className="inline-actions"><span>Delete this block?</span><button className="text-button" disabled={busy} onClick={()=>save('deleteBlock')}>Delete</button><button className="text-button" onClick={()=>setRemove(false)}>Cancel</button></div>}</article>
}
