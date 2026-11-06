/**
 * 生成 GitHub Pages 静态站点到仓库根目录。
 *
 * GitHub Pages 可以直接发布 main 分支的根目录（/），但不能选择 public/。
 * 这个脚本把 public/ 复制到根目录，并把资源路径改成相对路径。
 *
 * 根目录下生成：index.html、styles.css、manifest.webmanifest、js/、assets/、.nojekyll
 * 源文件仍然在 public/；改完 public/ 后重新运行 npm run build:pages。
 *
 * 静态版保留一人食、结果饭票、地图、饭历和设计手记；
 * 联机饭局需要 Node 服务，group.js 会在静态版显示说明页。
 */

import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const docsDir = path.join(root, 'docs');

const generated = ['index.html', 'styles.css', 'manifest.webmanifest', 'js', 'assets'];

// docs/ 现在只保留 README 的预览图；旧的 /docs 静态站清掉，避免两套产物。
const legacyDocsGenerated = [...generated, '.nojekyll'];
for (const entry of legacyDocsGenerated) {
  await rm(path.join(docsDir, entry), { recursive: true, force: true });
}

// 根目录只替换构建产物，不碰 README、server.js、public、test 等源文件。
for (const entry of generated) {
  await rm(path.join(root, entry), { recursive: true, force: true });
}
for (const entry of await readdir(publicDir)) {
  await cp(path.join(publicDir, entry), path.join(root, entry), { recursive: true });
}

let html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
html = html
  .replaceAll('href="/assets/icon.svg"', 'href="./assets/icon.svg"')
  .replaceAll('href="/manifest.webmanifest"', 'href="./manifest.webmanifest"')
  .replaceAll('href="/styles.css"', 'href="./styles.css"')
  .replaceAll('src="/js/app.js"', 'src="./js/app.js"')
  .replace('</head>', '  <meta name="zhedun-edition" content="static">\n</head>')
  .replace(
    '  <script type="module" src="./js/app.js"></script>',
    '  <script>window.__ZHEDUN_STATIC__ = true;</script>\n  <script type="module" src="./js/app.js"></script>'
  );

if (!html.includes('window.__ZHEDUN_STATIC__')) {
  throw new Error('未能向 Pages 版 index.html 注入静态模式标记');
}

await writeFile(path.join(root, 'index.html'), html, 'utf8');

const manifestPath = path.join(root, 'manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.start_url = './';
manifest.scope = './';
manifest.icons = (manifest.icons || []).map((icon) => ({
  ...icon,
  src: './assets/icon.svg'
}));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

// 防止 GitHub Pages 用 Jekyll 处理这个纯静态站点。
await writeFile(path.join(root, '.nojekyll'), '', 'utf8');

console.log('GitHub Pages 已生成：index.html（仓库根目录）');
console.log('发布设置：Settings → Pages → Deploy from a branch → main / (root)');
