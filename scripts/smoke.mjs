const baseUrl = process.env.DEEPPRINT_BASE_URL || 'http://127.0.0.1:3000';
const headers = {
  'content-type': 'application/json',
  'x-deepprint-dev-user-id': 'smoke-user',
};

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text
  }
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
};

await request('/api/health', { headers: {} });

const files = {
  'manifest.json': JSON.stringify({
    kind: 'template_bundle',
    version: 'v1',
    id: 'smoke',
    document_type: 'test',
    mode: 'parametric',
    entry: 'template.typ',
    data: 'data.json',
    data_schema: 'data.schema.json',
    data_contract: 'smoke.v1',
  }),
  'template.typ': '#let data = json("data.json")\n#set page(width: 60mm, height: 30mm, margin: 4mm)\n#set text(font: "Noto Sans SC", size: 10pt)\n= #data.title',
  'data.json': JSON.stringify({ title: 'DeepPrint Smoke' }),
  'data.schema.json': JSON.stringify({
    type: 'object',
    required: ['title'],
    properties: { title: { type: 'string' } },
  }),
};

const compiled = await request('/api/render/compile', {
  method: 'POST',
  body: JSON.stringify({
    files,
    format: 'png',
    include_artifact_base64: true,
  }),
});

if (!compiled.ok || !compiled.artifact_base64) {
  throw new Error(`render smoke failed: ${JSON.stringify(compiled)}`);
}

const folder = await request('/api/folders', {
  method: 'POST',
  body: JSON.stringify({ name: `Smoke ${Date.now()}` }),
});

const template = await request('/api/templates', {
  method: 'POST',
  body: JSON.stringify({ folder_id: folder.id, name: 'Smoke Template' }),
});

await request(`/api/templates/${template.id}`, {
  method: 'PUT',
  body: JSON.stringify({
    content: files['template.typ'],
    mock_data: JSON.parse(files['data.json']),
    files_json: files,
    update_source: 'manual',
    update_summary: 'smoke',
  }),
});

const versions = await request(`/api/templates/${template.id}/versions`);
if (!versions.versions?.length) {
  throw new Error('version smoke failed');
}

console.log('DeepPrint smoke passed');
