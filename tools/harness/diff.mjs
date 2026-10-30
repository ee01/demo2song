import {PNG} from 'pngjs';
import {ssim} from 'ssim.js';
export function compareTrees(golden,actual){return {structure:JSON.stringify(golden.map(n=>n.id))===JSON.stringify(actual.map(n=>n.id)),copy:golden.filter(n=>n.copy).every(n=>actual.find(a=>a.id===n.id)?.text===n.text)}}
export function compareImages(golden,actual){const a=PNG.sync.read(golden),b=PNG.sync.read(actual);if(a.width!==b.width||a.height!==b.height)return {ssim:0};return {ssim:ssim(a,b).mssim}}
