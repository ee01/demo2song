import { mkdir, writeFile } from 'node:fs/promises';
const appID = process.env.APPLE_TEAM_ID && process.env.APPLE_BUNDLE_ID ? `${process.env.APPLE_TEAM_ID}.${process.env.APPLE_BUNDLE_ID}` : null;
if (!appID) { console.warn('AASA not generated: set APPLE_TEAM_ID and APPLE_BUNDLE_ID before deploying Universal Links.'); }
else {
 if (!/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(appID)) throw new Error('Invalid Apple application identifier');
 await mkdir('dist/.well-known',{recursive:true}); await writeFile('dist/.well-known/apple-app-site-association',JSON.stringify({applinks:{details:[{appID,paths:['/p/*','/wx/*']}]}}));
}
