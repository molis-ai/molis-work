/**
 * Screenshots the person took themselves: pasted, dropped or picked, into the composer or the record being edited.
 * Images stay in the page until the Issue is sent or saved.
 */
export const ISSUE_IMAGES_CLIENT_SCRIPT = String.raw`
  let importing = 0;
  const shots = (items, editable) => items.map((image, index) => '<figure><button type="button" data-preview><img src="' + esc(image.data_url) + '" alt="' + esc(image.name) + '"></button>'
    + (editable ? '<button type="button" class="mw-btn" data-remove="' + index + '" aria-label="' + esc(L('移除截图')) + '">×</button>' : '') + '</figure>').join('');
  const tip = (form, text = '', error = false) => { const box = form.querySelector('[data-issue-tip]'); box.textContent = text; box.classList.toggle('is-error', error); };
  const counted = (form, items) => tip(form, items.length ? items.length + ' / 6 ' + L('张截图') : '');
  const paint = () => { $('thumbs').innerHTML = shots(images, true); $('edit-shots').innerHTML = shots(edits, true); counted(composer, images); counted(editor, edits); ready(); };
  const bytes = items => items.reduce((sum, image) => sum + atob(image.data_url.split(',')[1]).length, 0);
  const dataUrl = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
  const imageInput = async file => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error(L('只能添加 20 MiB 以内的 PNG、JPEG 或 WebP 图片。'));
    let bitmap;
    try {
      // A renamed file decodes in the browser, yet its declared type must match its bytes for the record to save.
      const prefix = [...new Uint8Array(await file.slice(0, 3).arrayBuffer())].join(',');
      if (prefix !== { 'image/png': '137,80,78', 'image/jpeg': '255,216,255', 'image/webp': '82,73,70' }[file.type]) throw new Error();
      bitmap = await createImageBitmap(file);
    } catch { throw new Error(L('图片无法读取，请重新选择有效的图片。')); }
    try {
      if (bitmap.width * bitmap.height > 64000000) throw new Error(L('图片尺寸过大，请裁剪后添加。'));
      let blob = file;
      if (file.size > 2 * 1024 * 1024 || Math.max(bitmap.width, bitmap.height) > 2560) {
        const canvas = document.createElement('canvas'), scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
      }
      if (!blob || blob.size > 2 * 1024 * 1024) throw new Error(L('图片压缩后仍超过 2 MiB，请裁剪后添加。'));
      return { name: file.name.slice(0, 200) || 'image.png', data_url: await dataUrl(blob) };
    } finally { bitmap.close(); }
  };
  // Files land where they were dropped or pasted: the record being edited, otherwise the composer.
  const attach = async (files, form) => {
    const into = form === editor, owner = current, have = into ? edits : images;
    if (have.length + files.length > 6) { tip(form, L('每条最多 6 张截图'), true); return; }
    importing++; ready(); tip(form, L('正在读取截图…'));
    try {
      const added = await Promise.all(files.map(imageInput));
      // Pictures decoded for a record the person has since left belong to no draft now.
      if (into && (current !== owner || !editing)) return;
      const combined = [...(into ? edits : images), ...added];
      if (bytes(combined) > 8 * 1024 * 1024) throw new Error(L('截图合计不能超过 8 MiB'));
      if (into) edits = combined; else images = combined;
      paint();
    } catch (error) { if (scope.alive) tip(form, error.message, true); }
    finally { importing--; ready(); }
  };
  const files = $('files'); let target = composer;
  for (const form of [composer, editor]) {
    scope.listen(form, 'dragover', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); form.classList.add('is-drop'); } });
    scope.listen(form, 'dragleave', () => form.classList.remove('is-drop'));
    scope.listen(form, 'drop', event => { form.classList.remove('is-drop'); const list = [...event.dataTransfer.files]; if (list.length) { event.preventDefault(); void attach(list, form); } });
  }
  scope.listen(root, 'paste', event => {
    const list = [...(event.clipboardData?.files || [])]; if (!list.length || !detail.hidden && !editing) return;
    event.preventDefault(); void attach(list, detail.hidden ? composer : editor);
  });
  scope.listen(files, 'change', () => { const list = [...files.files]; files.value = ''; if (list.length) void attach(list, target); });
  scope.listen(root, 'click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-issue-pick')) { target = button.closest('form'); files.click(); }
    else if (button.dataset.remove) {
      const index = Number(button.dataset.remove), form = button.closest('form');
      if (form === editor) edits = edits.filter((_, at) => at !== index); else images = images.filter((_, at) => at !== index);
      paint(); form.querySelector('[data-issue-pick]').focus();
    } else if (button.hasAttribute('data-preview')) {
      const dialog = $('preview'), img = dialog.querySelector('img'), source = button.querySelector('img');
      img.src = source.src; img.alt = source.alt; delete dialog.dataset.zoom; $('zoom').textContent = L('原始尺寸'); dialog.showModal();
    } else if (button.hasAttribute('data-issue-zoom')) {
      const dialog = $('preview'), zoomed = dialog.toggleAttribute('data-zoom'); button.textContent = L(zoomed ? '适应窗口' : '原始尺寸');
    }
  });
  // A click on the backdrop or beside the picture closes it; a drag that started on the picture does not.
  for (const dialog of root.querySelectorAll('dialog')) {
    let down = null;
    scope.listen(dialog, 'pointerdown', event => { down = event.target; });
    scope.listen(dialog, 'click', event => { if (down === event.target && (event.target === dialog || event.target.matches('.issues-preview form'))) dialog.close(); down = null; });
  }
`;
