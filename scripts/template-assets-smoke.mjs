const { getStarterContext, listTemplateStarters } = await import('../functions/lib/template-assets.ts');

const starters = listTemplateStarters();
if (starters.length < 5) {
  throw new Error(`expected starter assets, got ${starters.length}`);
}

for (const starter of starters) {
  const context = getStarterContext(starter.starterId);
  for (const name of ['manifest.json', 'template.typ', 'data.json', 'data.schema.json']) {
    if (!context.starter.files[name]) {
      throw new Error(`${starter.starterId} missing ${name}`);
    }
  }
  if (context.componentSource.documentType !== starter.documentType) {
    throw new Error(`${starter.starterId} component document type mismatch`);
  }
  if (!context.componentSource.source.includes('AI usage:')) {
    throw new Error(`${starter.starterId} component source needs AI usage comments`);
  }
  if (typeof context.designBrief !== 'string' || context.designBrief.trim().length === 0) {
    throw new Error(`${starter.starterId} missing design brief`);
  }
  if (context.componentSource.source.includes('label-value-row(left, right,')) {
    throw new Error(`${starter.starterId} shadows Typst right alignment in label-value-row`);
  }
}

console.log(`Template assets smoke passed (${starters.length} starters)`);
