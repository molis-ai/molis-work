/** Uses the Issue editor's existing lifecycle and draft. Images stay local until the person asks the Assistant to organize or saves manually. */
export const ISSUE_IMAGES_CLIENT_SCRIPT = String.raw`
  const imageMarkup = (items, editable = false) => items.map((image,index) => '<figure><button type="button" class="mw-btn mw-btn--ghost" data-issue-preview><img src="'+esc(image.data_url)+'" alt="'+esc(image.name)+'"></button><figcaption><span>'+esc(image.name)+'</span>'+(editable ? '<button type="button" class="mw-btn mw-btn--ghost" data-issue-remove="'+index+'" aria-label="'+L('移除图片')+'">×</button>' : '')+'</figcaption></figure>').join('');
  const renderImages = () => { $('images').innerHTML = imageMarkup(images,true); $('image-count').textContent=images.length+' / 6'; $('pick').disabled=images.length>=6; };
  const zoom = original => { $('image-dialog').dataset.zoom=String(original); $('zoom').textContent=L(original ? '适应窗口' : '原始尺寸'); $('zoom').setAttribute('aria-pressed',String(original)); };
  const preview = source => { const dialog=$('image-dialog'), img=dialog.querySelector('img'); img.src=source.src; img.alt=source.alt; $('image-name').textContent=source.alt; zoom(false); dialog.showModal(); dialog.querySelector('.issues-image-canvas').scrollTo(0,0); };
  const dataUrl = blob => new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
  const imageInput = async file => {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 20*1024*1024) throw new Error(L('请选择 20 MiB 以内的 PNG、JPEG 或 WebP 图片。'));
    let bitmap;
    try {
      // Browsers can decode a mislabeled file, but its declared MIME must also match the saved image contract.
      const prefix = [...new Uint8Array(await file.slice(0,3).arrayBuffer())].join(',');
      if (prefix !== {'image/png':'137,80,78','image/jpeg':'255,216,255','image/webp':'82,73,70'}[file.type]) throw new Error();
      bitmap=await createImageBitmap(file);
    } catch { throw new Error(L('图片无法读取，请重新选择有效的图片。')); }
    try {
      if (bitmap.width * bitmap.height > 64000000) throw new Error(L('图片尺寸过大，请裁剪后添加。'));
      let blob = file;
      if (file.size > 2*1024*1024 || Math.max(bitmap.width,bitmap.height) > 2560) {
        const canvas = document.createElement('canvas'), scale = Math.min(1,2560 / Math.max(bitmap.width,bitmap.height));
        canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale); canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        blob = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',0.9));
      }
      if (!blob || blob.size > 2*1024*1024) throw new Error(L('图片压缩后仍超过 2 MiB，请裁剪后添加。'));
      return {name:file.name.slice(0,200) || 'image.png',data_url:await dataUrl(blob)};
    } finally { bitmap.close(); }
  };
  const attach = async (files, signal) => {
    if (images.length + files.length > 6) throw new Error(L('每条问题最多添加 6 张图片'));
    const added = await Promise.all(files.map(imageInput)); scope.assertCurrent(signal);
    const combined = [...images,...added];
    if (combined.reduce((n,image) => n+atob(image.data_url.split(',')[1]).length,0) > 8*1024*1024) throw new Error(L('图片总大小不能超过 8 MiB'));
    images = combined; renderImages(); edited(); note(L('图片已加入草稿，保存后生效。'));
  };
  const mediaTask = async work => {
    if (viewing() || busy || imageBusy || assistant) return;
    imageBusy = true; $('save').disabled = true; $('pick').disabled = true; mode();
    note(L('正在准备图片…'));
    const signal = host.capture || host.onNew ? scope.signal : viewSignal;
    try { await work(signal); }
    catch (error) { if (!signal?.aborted && scope.alive) note(error.message || L('图片读取失败，请重新选择。'),true); }
    finally { imageBusy = false; $('save').disabled = false; $('pick').disabled = false; mode(); }
  };
  const drop = $('drop'), picker = $('files');
  for(const type of ['dragover','drop','paste']) scope.listen(root,type,event=>{ if(viewing() && (event.dataTransfer?.types.includes('Files') || event.clipboardData?.files.length)) event.preventDefault(); });
  scope.listen(picker,'change',() => { const files=[...picker.files]; picker.value=''; if(files.length) void mediaTask(signal => attach(files,signal)); });
  scope.listen(drop,'dragover',event => { if(event.dataTransfer.types.includes('Files')) {event.preventDefault();drop.classList.add('is-dragging');} });
  scope.listen(drop,'dragleave',() => drop.classList.remove('is-dragging'));
  scope.listen(drop,'drop',event => { drop.classList.remove('is-dragging'); const files=[...event.dataTransfer.files]; if(files.length) { event.preventDefault();void mediaTask(signal => attach(files,signal)); } });
  scope.listen(drop,'paste',event => { const files=[...(event.clipboardData?.files || [])]; if(files.length) {event.preventDefault();void mediaTask(signal => attach(files,signal));} });
`;
