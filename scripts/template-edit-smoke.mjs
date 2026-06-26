import {
  applyTemplateBundlePatch,
  listTemplateBundlePatchFiles,
} from '../src/lib/template-edit.ts';

const assertOk = (result, label) => {
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.error}`);
  }
  return result;
};

const assertFail = (result, label, includes) => {
  if (result.ok) {
    throw new Error(`${label} unexpectedly succeeded`);
  }
  if (includes && !result.error.includes(includes)) {
    throw new Error(`${label} returned unexpected error: ${result.error}`);
  }
};

const patchText = `*** Begin Patch
*** Update File: template.typ
@@ #let title = "A"
-#let title = "A"
+#let title = "B"
 #title
*** Update File: data.json
@@
 {
-  "title": "A"
+  "title": "B"
 }
*** End Patch`;

const patchFiles = assertOk(listTemplateBundlePatchFiles(patchText), 'patch file listing');
if (patchFiles.files.join(',') !== 'template.typ,data.json') {
  throw new Error(`patch file listing failed: ${patchFiles.files.join(',')}`);
}

const patchResult = assertOk(
  applyTemplateBundlePatch({
    'template.typ': '#let title = "A"\n#title',
    'data.json': '{\n  "title": "A"\n}',
  }, patchText),
  'multi-file patch',
);

if (!patchResult.files['template.typ'].includes('"B"') || !patchResult.files['data.json'].includes('"B"')) {
  throw new Error('multi-file patch did not update both files');
}

const loosePatchResult = assertOk(
  applyTemplateBundlePatch({
    'template.typ': 'alpha   \n  beta\nomega',
    'data.json': '{}',
  }, `*** Begin Patch
*** Update File: template.typ
@@
 alpha
-beta
+BETA
 omega
*** End Patch`),
  'loose whitespace patch',
);

if (loosePatchResult.files['template.typ'] !== 'alpha\nBETA\nomega') {
  throw new Error(`loose whitespace patch produced unexpected content: ${loosePatchResult.files['template.typ']}`);
}

const repeatedPatchResult = assertOk(
  applyTemplateBundlePatch({
    'template.typ': 'item: A\nstatus: old\nitem: A\nstatus: old\n',
    'data.json': '{}',
  }, `*** Begin Patch
*** Update File: template.typ
@@
 item: A
-status: old
+status: new
@@
 item: A
-status: old
+status: done
*** End Patch`),
  'ordered repeated patch',
);

if (repeatedPatchResult.files['template.typ'] !== 'item: A\nstatus: new\nitem: A\nstatus: done\n') {
  throw new Error(`ordered repeated patch failed: ${repeatedPatchResult.files['template.typ']}`);
}

assertFail(
  applyTemplateBundlePatch({
    'template.typ': '#text[hello]',
    'data.json': '{}',
  }, '```typst\n#text[bad]\n```'),
  'rejects fenced patch',
  'Markdown',
);

assertFail(
  applyTemplateBundlePatch({
    'template.typ': 'same',
    'data.json': '{}',
  }, `*** Begin Patch
*** Update File: template.typ
@@
 same
*** End Patch`),
  'rejects no-op patch',
  'match exactly',
);

console.log('Template edit smoke passed');
