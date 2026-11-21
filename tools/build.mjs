/**
 * 生产构建：把 src/main.js 及 three 依赖打成单个 ES Module（含内嵌 GLB），
 * 输出到 dist/，dist/index.html 可直接 file:// 双击打开，完全离线、无后端。
 */
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'dist');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [resolve(root, 'src/main.js')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  outfile: resolve(outDir, 'app.js'),
  loader: { '.js': 'jsx' },
});

// 内联进 HTML：Chromium 在 file:// 下禁止外部 module 脚本（CORS），
// 内联 <script type="module"> 可直接执行，实现双击即开、零依赖离线运行
const bundle = readFileSync(resolve(outDir, 'app.js'), 'utf8');
const html = readFileSync(resolve(root, 'index.html'), 'utf8')
  .replace(/\s*<script type="module" src="\.\/src\/main\.js"><\/script>/,
    () => `\n  <script type="module">\n${bundle}\n  </script>`);
writeFileSync(resolve(outDir, 'index.html'), html, 'utf8');
rmSync(resolve(outDir, 'app.js'));

// 原始 GLB 一并拷贝，方便后续替换为外部开源模型（运行时默认用内嵌数据）
mkdirSync(resolve(outDir, 'models'), { recursive: true });
copyFileSync(resolve(root, 'assets/models/sailboat.glb'), resolve(outDir, 'models/sailboat.glb'));
copyFileSync(resolve(root, 'assets/models/tree.glb'), resolve(outDir, 'models/tree.glb'));

console.log('✓ 构建完成: dist/（双击 dist/index.html 即可离线运行）');
