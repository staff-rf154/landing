(function () {
  'use strict';

  var schema = JSON.parse(document.getElementById('blocks-schema').textContent);
  var settingsSchema = JSON.parse(document.getElementById('settings-schema').textContent);
  var defaults = JSON.parse(document.getElementById('block-defaults').textContent);

  var COMMON_FIELDS = [
    { key: 'bg_color', label: 'Цвет фона', type: 'color' },
    { key: 'bg_image', label: 'Фоновое изображение', type: 'image' }
  ];

  var content = null;
  var selected = 0;
  var tab = 'blocks';
  var dirty = false;

  var el = {
    list: document.getElementById('block-list'),
    body: document.getElementById('editor-body'),
    title: document.getElementById('editor-title'),
    addType: document.getElementById('add-type'),
    addBtn: document.getElementById('add-btn'),
    addWrap: document.getElementById('add-block'),
    save: document.getElementById('save-btn'),
    status: document.getElementById('save-status'),
    preview: document.getElementById('preview'),
    previewFrame: document.getElementById('preview-frame'),
    layout: document.getElementById('layout'),
    toast: document.getElementById('toast')
  };

  function node(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function setDirty() {
    dirty = true;
    el.status.textContent = 'Есть несохранённые изменения';
    el.status.className = 'save-status';
  }

  function typeLabel(type) {
    return schema[type] ? schema[type].label : type;
  }

  function blockName(b) {
    var raw = b.title || b.eyebrow || '';
    if (!raw && b.html) raw = String(b.html).replace(/<[^>]*>/g, ' ').trim();
    if (!raw) raw = typeLabel(b.type);
    return raw.length > 46 ? raw.slice(0, 46) + '…' : raw;
  }

  function defaultValue(field) {
    if (field.type === 'list') return [];
    if (field.type === 'strings') return [];
    if (field.type === 'group') return defaultsFor(field.fields);
    if (field.type === 'bool') return false;
    if (field.type === 'select') return (field.options && field.options[0]) || '';
    return '';
  }

  function defaultsFor(fields) {
    var obj = {};
    (fields || []).forEach(function (field) { obj[field.key] = defaultValue(field); });
    return obj;
  }

  function uploadFile(file) {
    return fetch('/admin/api/upload?name=' + encodeURIComponent(file.name || 'image'), {
      method: 'POST',
      body: file,
      credentials: 'same-origin'
    }).then(function (res) {
      if (res.status === 401) { location.href = '/admin/login'; throw new Error('Сессия истекла'); }
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.detail || 'Ошибка загрузки'); });
      return res.json();
    }).then(function (data) { return data.url; });
  }

  function toast(text, isError) {
    el.toast.textContent = text;
    el.toast.className = 'toast' + (isError ? ' err' : '');
    el.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.hidden = true; }, 2600);
  }

  function makeField(field, obj, wide) {
    var wrap = node('div', 'field' + (wide || field.type === 'textarea' || field.type === 'list' || field.type === 'group' ? ' wide' : ''));
    if (field.type !== 'bool') wrap.appendChild(node('label', null, field.label));

    if (field.type === 'text' || field.type === 'url') {
      var input = document.createElement('input');
      input.type = 'text';
      input.value = obj[field.key] || '';
      input.addEventListener('input', function () { obj[field.key] = input.value; setDirty(); });
      wrap.appendChild(input);
    } else if (field.type === 'textarea') {
      var ta = document.createElement('textarea');
      ta.value = obj[field.key] || '';
      ta.addEventListener('input', function () { obj[field.key] = ta.value; setDirty(); });
      wrap.appendChild(ta);
    } else if (field.type === 'bool') {
      var lab = node('label', 'check');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!obj[field.key];
      cb.addEventListener('change', function () { obj[field.key] = cb.checked; setDirty(); });
      lab.appendChild(cb);
      lab.appendChild(node('span', null, field.label));
      wrap.appendChild(lab);
    } else if (field.type === 'select') {
      var sel = document.createElement('select');
      (field.options || []).forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (String(obj[field.key]) === String(opt)) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { obj[field.key] = sel.value; setDirty(); });
      wrap.appendChild(sel);
    } else if (field.type === 'color') {
      var box = node('div', 'color-field');
      var pick = document.createElement('input');
      pick.type = 'color';
      pick.value = /^#[0-9a-fA-F]{6}$/.test(obj[field.key] || '') ? obj[field.key] : '#ffffff';
      var txt = document.createElement('input');
      txt.type = 'text';
      txt.placeholder = 'например #0b1020';
      txt.value = obj[field.key] || '';
      pick.addEventListener('input', function () { obj[field.key] = pick.value; txt.value = pick.value; setDirty(); });
      txt.addEventListener('input', function () {
        obj[field.key] = txt.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(obj[field.key])) pick.value = obj[field.key];
        setDirty();
      });
      box.appendChild(pick); box.appendChild(txt);
      wrap.appendChild(box);
    } else if (field.type === 'image') {
      var imgWrap = node('div', 'image-field');
      var row = node('div', 'image-row');
      var url = document.createElement('input');
      url.type = 'text';
      url.placeholder = '/uploads/… или https://…';
      url.value = obj[field.key] || '';
      row.appendChild(url);
      imgWrap.appendChild(row);

      var actions = node('div', 'image-actions');
      var upLabel = node('label', 'upload-btn');
      upLabel.appendChild(document.createTextNode('Загрузить'));
      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
      fileInput.hidden = true;
      upLabel.appendChild(fileInput);
      var clear = node('button', 'btn-ghost', 'Очистить');
      clear.type = 'button';
      clear.style.padding = '6px 11px';
      clear.style.fontSize = '12px';
      actions.appendChild(upLabel); actions.appendChild(clear);
      imgWrap.appendChild(actions);

      var prev = node('div', 'image-preview');
      imgWrap.appendChild(prev);
      function drawPrev() {
        prev.replaceChildren();
        if (obj[field.key]) {
          var img = document.createElement('img');
          img.src = obj[field.key];
          img.alt = '';
          prev.appendChild(img);
        } else {
          prev.appendChild(node('span', 'image-empty', 'Изображение не выбрано'));
        }
      }
      drawPrev();
      url.addEventListener('input', function () { obj[field.key] = url.value.trim(); drawPrev(); setDirty(); });
      clear.addEventListener('click', function () { obj[field.key] = ''; url.value = ''; drawPrev(); setDirty(); });
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        upLabel.style.opacity = '.6';
        uploadFile(f).then(function (u) {
          obj[field.key] = u; url.value = u; drawPrev(); setDirty(); toast('Изображение загружено');
        }).catch(function (e) { toast(e.message || 'Не удалось загрузить', true); })
          .finally(function () { upLabel.style.opacity = ''; fileInput.value = ''; });
      });
      wrap.appendChild(imgWrap);
    } else if (field.type === 'strings') {
      var arr = obj[field.key];
      if (!Array.isArray(arr)) { arr = []; obj[field.key] = arr; }
      var box2 = node('div', 'strings');
      function drawStrings() {
        box2.replaceChildren();
        arr.forEach(function (val, idx) {
          var row2 = node('div', 'string-row');
          var inp = document.createElement('input');
          inp.type = 'text';
          inp.value = val || '';
          inp.addEventListener('input', function () { arr[idx] = inp.value; setDirty(); });
          var del = node('button', null, '✕');
          del.type = 'button';
          del.addEventListener('click', function () { arr.splice(idx, 1); setDirty(); drawStrings(); });
          row2.appendChild(inp); row2.appendChild(del);
          box2.appendChild(row2);
        });
        var add = node('button', 'add-row', '+ Добавить');
        add.type = 'button';
        add.addEventListener('click', function () { arr.push(''); setDirty(); drawStrings(); });
        box2.appendChild(add);
      }
      drawStrings();
      wrap.appendChild(box2);
    } else if (field.type === 'list') {
      var list = obj[field.key];
      if (!Array.isArray(list)) { list = []; obj[field.key] = list; }
      var holder = node('div', 'list-field');
      function drawList() {
        holder.replaceChildren();
        var rows = node('div', 'list-rows');
        list.forEach(function (item, idx) {
          var row = node('div', 'list-row');
          var head = node('div', 'list-row-head');
          head.appendChild(node('span', null, '#' + (idx + 1)));
          var tools = node('div', 'row-tools');
          function tool(label, title, fn, cls) {
            var b = node('button', cls || '', label);
            b.type = 'button'; b.title = title;
            b.addEventListener('click', fn);
            tools.appendChild(b);
          }
          tool('↑', 'Выше', function () { if (idx > 0) { list.splice(idx - 1, 0, list.splice(idx, 1)[0]); setDirty(); drawList(); } });
          tool('↓', 'Ниже', function () { if (idx < list.length - 1) { list.splice(idx + 1, 0, list.splice(idx, 1)[0]); setDirty(); drawList(); } });
          tool('✕', 'Удалить', function () { list.splice(idx, 1); setDirty(); drawList(); }, 'del');
          head.appendChild(tools);
          row.appendChild(head);
          var body = node('div', 'list-fields');
          if (field.item) {
            field.item.forEach(function (sub) { body.appendChild(makeField(sub, item)); });
          } else {
            var inp = document.createElement('input');
            inp.type = 'text';
            inp.value = item || '';
            inp.addEventListener('input', function () { list[idx] = inp.value; setDirty(); });
            body.appendChild(inp);
          }
          row.appendChild(body);
          rows.appendChild(row);
        });
        holder.appendChild(rows);
        var add = node('button', 'add-row', '+ Добавить');
        add.type = 'button';
        add.addEventListener('click', function () {
          list.push(field.item ? defaultsFor(field.item) : '');
          setDirty(); drawList();
        });
        holder.appendChild(add);
      }
      drawList();
      wrap.appendChild(holder);
    } else if (field.type === 'group') {
      var g = node('div', 'fields');
      (field.fields || []).forEach(function (sub) { g.appendChild(makeField(sub, obj[field.key] || (obj[field.key] = {}))); });
      wrap.appendChild(g);
    }
    return wrap;
  }

  function renderBlockList() {
    el.list.replaceChildren();
    content.blocks.forEach(function (b, idx) {
      var item = node('div', 'block-item' + (idx === selected && tab === 'blocks' ? ' is-active' : '') + (b.enabled === false ? ' is-off' : ''));
      var selBtn = node('button', 'block-select');
      selBtn.type = 'button';
      selBtn.appendChild(node('span', 'block-type', typeLabel(b.type)));
      selBtn.appendChild(node('span', 'block-name', blockName(b)));
      selBtn.addEventListener('click', function () { tab = 'blocks'; selected = idx; renderAll(); });
      item.appendChild(selBtn);

      item.draggable = true;
      item.addEventListener('dragstart', function (ev) {
        item.classList.add('dragging');
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', String(idx));
      });
      item.addEventListener('dragend', function () { item.classList.remove('dragging'); });
      item.addEventListener('dragover', function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; item.classList.add('drop-target'); });
      item.addEventListener('dragleave', function () { item.classList.remove('drop-target'); });
      item.addEventListener('drop', function (ev) {
        ev.preventDefault();
        item.classList.remove('drop-target');
        var from = Number(ev.dataTransfer.getData('text/plain'));
        if (Number.isNaN(from) || from === idx) return;
        var moved = content.blocks.splice(from, 1)[0];
        content.blocks.splice(idx, 0, moved);
        selected = idx;
        setDirty();
        renderAll();
      });

      var tools = node('div', 'block-tools');
      function tool(label, title, fn, cls) {
        var b2 = node('button', cls || '', label);
        b2.type = 'button'; b2.title = title;
        b2.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); });
        tools.appendChild(b2);
      }
      tool('↑', 'Выше', function () { if (idx > 0) { content.blocks.splice(idx - 1, 0, content.blocks.splice(idx, 1)[0]); selected = idx - 1; setDirty(); renderAll(); } });
      tool('↓', 'Ниже', function () { if (idx < content.blocks.length - 1) { content.blocks.splice(idx + 1, 0, content.blocks.splice(idx, 1)[0]); selected = idx + 1; setDirty(); renderAll(); } });
      tool(b.enabled === false ? '○' : '●', 'Вкл/выкл', function () { b.enabled = b.enabled === false; setDirty(); renderAll(); });
      tool('✕', 'Удалить', function () {
        if (!confirm('Удалить блок «' + blockName(b) + '»?')) return;
        content.blocks.splice(idx, 1);
        if (selected >= content.blocks.length) selected = Math.max(0, content.blocks.length - 1);
        setDirty(); renderAll();
      }, 'del');
      item.appendChild(tools);
      el.list.appendChild(item);
    });
    if (!content.blocks.length && tab === 'blocks') {
      el.list.appendChild(node('p', 'sidebar-hint', 'Блоков пока нет — добавьте первый.'));
    }
  }

  function renderEditor() {
    el.body.replaceChildren();
    if (tab === 'settings') {
      el.title.textContent = 'Настройки сайта';
      el.addWrap.style.display = 'none';
      var form = node('div', 'fields');
      settingsSchema.forEach(function (field) { form.appendChild(makeField(field, content.settings)); });
      el.body.appendChild(form);
      return;
    }
    el.addWrap.style.display = '';
    var block = content.blocks[selected];
    if (!block) {
      el.title.textContent = 'Контент';
      el.body.appendChild(node('div', 'empty-state', 'Выберите блок слева или добавьте новый.'));
      return;
    }
    el.title.textContent = typeLabel(block.type);

    var head = node('div', 'block-head');
    head.appendChild(node('h3', null, typeLabel(block.type)));
    var sw = node('label', 'switch');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = block.enabled !== false;
    cb.addEventListener('change', function () { block.enabled = cb.checked; setDirty(); renderBlockList(); });
    sw.appendChild(cb); sw.appendChild(node('span', null, 'Включён'));
    head.appendChild(sw);
    el.body.appendChild(head);

    var fields = node('div', 'fields');
    (schema[block.type].fields || []).forEach(function (field) {
      fields.appendChild(makeField(field, block));
    });
    el.body.appendChild(fields);

    el.body.appendChild(node('div', 'group-title', 'Оформление'));
    var styleFields = node('div', 'fields');
    COMMON_FIELDS.forEach(function (field) {
      if (block[field.key] === undefined) block[field.key] = '';
      styleFields.appendChild(makeField(field, block));
    });
    el.body.appendChild(styleFields);
  }

  function renderTabs() {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.tab === tab);
    });
  }

  function renderAll() {
    renderTabs();
    renderBlockList();
    renderEditor();
  }

  function renderAddTypes() {
    el.addType.replaceChildren();
    Object.keys(schema).forEach(function (type) {
      var o = document.createElement('option');
      o.value = type; o.textContent = schema[type].label;
      el.addType.appendChild(o);
    });
  }

  function uid(prefix) {
    return (prefix || 'block') + '-' + Math.random().toString(36).slice(2, 8);
  }

  function addBlock() {
    var type = el.addType.value;
    var block = { id: uid(type), type: type, enabled: true, bg_color: '', bg_image: '' };
    Object.assign(block, JSON.parse(JSON.stringify(defaults[type] || {})));
    if (schema[type].fields.some(function (f) { return f.key === 'anchor'; })) {
      block.anchor = type + '-' + Math.random().toString(36).slice(2, 6);
    }
    content.blocks.push(block);
    selected = content.blocks.length - 1;
    tab = 'blocks';
    setDirty(); renderAll();
    toast('Блок добавлен');
  }

  function save() {
    el.save.disabled = true;
    el.status.textContent = 'Сохранение…';
    el.status.className = 'save-status';
    fetch('/admin/api/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(content)
    }).then(function (res) {
      if (res.status === 401) { location.href = '/admin/login'; throw new Error('Сессия истекла'); }
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.detail || 'Ошибка сохранения'); });
      dirty = false;
      el.status.textContent = 'Сохранено';
      el.status.className = 'save-status ok';
      refreshPreview();
      toast('Изменения опубликованы');
    }).catch(function (e) {
      el.status.textContent = 'Не сохранено';
      el.status.className = 'save-status err';
      toast(e.message || 'Ошибка сохранения', true);
    }).finally(function () { el.save.disabled = false; });
  }

  function refreshPreview() {
    el.preview.src = '/preview?t=' + Date.now();
  }

  function init() {
    renderAddTypes();
    fetch('/admin/api/content', { cache: 'no-store', credentials: 'same-origin' }).then(function (res) {
      if (res.status === 401) { location.href = '/admin/login'; throw new Error('401'); }
      return res.json();
    }).then(function (data) {
      content = data;
      if (!content.settings) content.settings = {};
      if (!Array.isArray(content.blocks)) content.blocks = [];
      renderAll();
    }).catch(function () {
      el.body.appendChild(node('div', 'empty-state', 'Не удалось загрузить контент. Обновите страницу.'));
    });

    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () {
        tab = b.dataset.tab;
        if (tab === 'blocks') selected = Math.min(selected, Math.max(0, content.blocks.length - 1));
        renderAll();
      });
    });
    el.addBtn.addEventListener('click', addBlock);
    el.save.addEventListener('click', save);
    document.getElementById('refresh-preview').addEventListener('click', refreshPreview);
    document.getElementById('toggle-preview').addEventListener('click', function () {
      var open = el.layout.classList.toggle('show-preview');
      document.documentElement.classList.toggle('preview-open', open);
      refreshPreview();
    });
    document.getElementById('close-preview').addEventListener('click', function () {
      el.layout.classList.remove('show-preview');
      document.documentElement.classList.remove('preview-open');
    });
    document.querySelectorAll('.device').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.device').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        el.previewFrame.className = 'preview-frame ' + b.dataset.width;
      });
    });
    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); save(); }
    });
    window.addEventListener('beforeunload', function (ev) {
      if (!dirty) return;
      ev.preventDefault();
      ev.returnValue = '';
    });
  }

  init();
})();
