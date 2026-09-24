import Space from './space';
import {getChatGPTUser,chatGPTSignInPath} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home(){
 const user=await getChatGPTUser();
 if(!user)return <main className="onboarding"><section className="setup-card"><div className="eyebrow">SANGO SPACE</div><h1>Sign in to Sango Space</h1><p>Manage your team’s documents, files, and projects.</p><a className="primary" href={chatGPTSignInPath('/')} target="_top">Create account or sign in with ChatGPT</a><p className="muted">Your ChatGPT account securely signs you in. You’ll choose your name and create a space next.</p></section></main>;
 return <Space/>;
}
