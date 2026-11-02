'use client';
import {useCallback,useState} from 'react';
import PageTasks from '../page-tasks';
import WorkspaceSettings from '../workspace-settings';
export default function QA(){
 const register=useCallback(()=>()=>{},[]);const [record,setRecord]=useState('');
 const [workspace,setWorkspace]=useState({id:'test',name:'Test space',description:'Temporary UI test'});
 async function mutate(action:Record<string,unknown>){setRecord(JSON.stringify(action));return {ok:true}}
 return <main className="page"><h1>Temporary component check</h1><WorkspaceSettings workspace={workspace} api={async body=>{if(body.action==='updateWorkspace')setWorkspace({...workspace,name:body.name,description:body.description});return {ok:true}}} onUpdated={async()=>{}} onClose={()=>{}}/><PageTasks block={{id:'qa-board',kind:'kanban',version:1,content:JSON.stringify({title:'Test board',tasks:[]})}} canEdit mutate={mutate} register={register}/><PageTasks block={{id:'qa-checklist',kind:'checklist',version:1,content:JSON.stringify({title:'Test checklist',tasks:[]})}} canEdit mutate={mutate} register={register}/><output aria-label="Saved action">{record}</output></main>
}
