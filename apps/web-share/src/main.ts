// Public endpoint only: do not put access tokens or private user data in share pages.
const id = location.pathname.match(/^\/p\/([^/]+)$/)?.[1];
const title = document.querySelector<HTMLHeadingElement>('#title')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const audio = document.querySelector<HTMLAudioElement>('#audio')!;
const open = document.querySelector<HTMLAnchorElement>('#open')!;
const api = (import.meta as ImportMeta & { env: Record<string,string> }).env.VITE_API_BASE || 'https://api.demo2song.eexx.me';
if (!id) { title.textContent = '找不到这首歌'; }
else {
 open.href = `suiheng://song/p/${encodeURIComponent(id)}`;
 if (/MicroMessenger/i.test(navigator.userAgent)) document.querySelector<HTMLElement>('#wechat')!.hidden = false;
 fetch(`${api}/v1/public/songs/${encodeURIComponent(id)}`).then(async response => {
  if (!response.ok) throw new Error('歌曲暂不可用，请稍后重试');
  const song = await response.json() as { title?: string; lyrics?: string; playbackUrl?: string; status: string };
  title.textContent = song.title || '我的歌曲'; document.title = `${title.textContent} · 随哼`;
  document.querySelector('#lyrics')!.textContent = song.lyrics || '';
  if (song.status === 'ready' && song.playbackUrl) { const url = new URL(song.playbackUrl); if (url.protocol !== 'https:') throw new Error('音频链接不可用'); audio.src = url.href; audio.hidden = false; }
  else status.textContent = song.status === 'failed' ? '生成失败' : '歌曲还在生成中';
 }).catch(error => { title.textContent = '暂时无法播放'; status.textContent = error.message; });
}
