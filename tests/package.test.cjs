const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));

test('manifest uses a shared MV3 browser implementation with minimal permissions',()=>{
  assert.equal(manifest.manifest_version,3);
  assert.deepEqual(manifest.permissions,['storage']);
  assert.deepEqual(manifest.host_permissions,['https://api.bilibili.com/*']);
  assert.ok(manifest.background.service_worker);
  assert.ok(manifest.background.scripts.includes('src/background.js'));
  assert.ok(manifest.content_scripts[0].js.includes('src/content.js'));
});

test('all declared extension files exist',()=>{
  const declared=[
    manifest.background.service_worker,...manifest.background.scripts,
    ...manifest.content_scripts.flatMap(item=>[...item.js,...item.css]),
    manifest.action.default_popup,manifest.options_ui.page,
    ...Object.values(manifest.icons),...Object.values(manifest.action.default_icon)
  ];
  for(const file of declared) assert.ok(fs.existsSync(path.join(root,file)),`missing ${file}`);
});

test('the extension does not contain synthetic account-preference requests or dynamic evaluation',()=>{
  const files=['src/background.js','src/content.js','src/core.js','src/dashboard.js','src/popup.js'];
  const content=files.map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
  assert.ok(!content.includes('clear_history'));
  assert.ok(!content.includes('set_preferences'));
  assert.ok(!/\beval\s*\(/.test(content));
  assert.ok(!/new\s+Function\s*\(/.test(content));
});
