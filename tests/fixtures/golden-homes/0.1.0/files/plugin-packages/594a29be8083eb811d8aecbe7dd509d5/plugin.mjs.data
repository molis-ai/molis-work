// 1.0.0
export const operations = {
  'notes.list': async (_input, sdk) => {
    const rows = await sdk.homeDatabase.all('SELECT CAST(id AS TEXT) AS id, text FROM notes ORDER BY id'), file = await sdk.ownerFiles.read('notes.txt');
    return [...rows, { id: 'file', text: file?.data_base64 ?? 'no file' }];
  },
  'notes.add': async (input, sdk) => {
    await sdk.homeDatabase.transaction([{ sql: 'INSERT INTO notes(text) VALUES (?)', parameters: [input.text] }]);
    await sdk.ownerFiles.write([{ op: 'write', path: 'notes.txt', data_base64: 'Z29sZGVu', mode: (await sdk.ownerFiles.read('notes.txt')) ? 'replace' : 'create' }]);
    return true;
  },
};
