(() => {
  'use strict';
  const settings = window.HP_MOCK_SETTINGS;
  const values = Object.fromEntries(settings.map(row => [row.key, row.default]));
  const byPart = document.body.dataset.layout === 'part';
  const pages = byPart ? ['Bar', 'HP Text', 'Name', 'Indicators', 'Units', 'Presets'] : ['Enemy', 'Ally', 'Units', 'Shared', 'Presets'];
  const $ = id => document.getElementById(id);
  let page = pages[0], side = 'enemy', kind = 'hero', hp = 75, sequence = null, feedback = '';
  const presets = [];
  const description = {
    Bar: 'Colors, feedback and geometry. Shared settings below affect both sides.',
    'HP Text': 'The native health number, with separate enemy and ally styling.',
    Name: 'Player names. Shared visibility and geometry apply to both sides.',
    Indicators: 'Pips, pulse, stamina, ultimate, level and pickup indicators.',
    Enemy: 'Everything for enemy hero bars, grouped by part. Common geometry lives under Shared.',
    Ally: 'Everything for ally hero bars, grouped by part. Common geometry lives under Shared.',
    Units: 'NPC, neutral and objective gates. Switch the preview kind to compare.',
    Shared: 'Common bar geometry, names, indicators, thresholds and own HUD settings.',
    Presets: 'Try a session-only snapshot or return to shipped defaults. No save or share-code protocol is implemented.'
  };
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function belongs(row) {
    if (byPart) return row.part === page;
    if (page === 'Units') return row.part === 'Units';
    return row.part !== 'Units' && row.side === page.toLowerCase();
  }
  function query() { return $('search-wrap').hidden ? '' : $('search').value.trim().toLowerCase(); }
  function updateValue(row, value) {
    values[row.key] = value;
    if (row.side !== 'shared') side = row.side;
    // Synchronize the range/number and picker/hex pairs.
    document.querySelectorAll(`[data-control="${row.key}"]`).forEach(control => {
      if (control.type === 'checkbox') control.checked = value;
      else control.value = value;
    });
    document.querySelectorAll(`[data-default="${row.key}"]`).forEach(meta => {
      meta.classList.toggle('changed', value !== row.default);
      meta.closest('.setting-row').classList.toggle('changed', value !== row.default);
    });
    paint();
  }
  function settingRow(row) {
    const container = node('div', `setting-row type-${row.type}`);
    container.dataset.key = row.key;
    container.classList.toggle('changed', values[row.key] !== row.default);
    const copy = node('div', 'copy');
    const label = node('label', '', row.name);
    label.htmlFor = `control-${row.key}`;
    copy.append(label);
    const help = node('p', 'setting-help', row.help);
    help.id = `help-${row.key}`;
    copy.append(help);
    container.append(copy);
    const controls = node('div', 'controls');
    const add = (control, primary = true) => {
      if (primary) control.id = `control-${row.key}`;
      else control.setAttribute('aria-label', `${row.name} ${control.type === 'range' ? 'slider' : 'hex color'}`);
      control.setAttribute('aria-describedby', help.id);
      control.dataset.control = row.key;
      controls.append(control);
      return control;
    };
    if (row.type === 'boolean') {
      const control = add(node('input'));
      control.type = 'checkbox'; control.checked = values[row.key];
      control.addEventListener('change', () => updateValue(row, control.checked));
    } else if (row.type === 'enum') {
      const control = add(node('select'));
      const labels = row.key === 'barMask' ? { none: 'V1', original: 'V2', old: 'OLD' } : {};
      row.options.forEach(option => { const item = node('option', '', labels[option] || option.toUpperCase()); item.value = option; control.append(item); });
      control.value = values[row.key];
      control.addEventListener('change', () => updateValue(row, control.value));
    } else if (row.type === 'color') {
      const control = add(node('input')); control.type = 'color'; control.value = values[row.key];
      control.addEventListener('input', () => updateValue(row, control.value.toUpperCase()));
      const hex = add(node('input'), false); hex.type = 'text'; hex.value = values[row.key]; hex.maxLength = 7; hex.pattern = '#[0-9a-fA-F]{6}';
      hex.addEventListener('change', () => {
        if (/^#[0-9a-f]{6}$/i.test(hex.value)) updateValue(row, hex.value.toUpperCase());
        else { hex.value = values[row.key]; $('preview-status').textContent = 'Use a six-digit hex color, e.g. #FF2222.'; }
      });
    } else {
      const number = add(node('input')); number.type = 'number';
      const range = add(node('input'), false); range.type = 'range';
      [number, range].forEach(control => {
        control.min = row.min; control.max = row.max; control.step = row.step; control.value = values[row.key];
        control.addEventListener('input', () => {
          if (control.value === '' || !Number.isFinite(control.valueAsNumber)) return;
          const value = Math.max(row.min, Math.min(row.max, Math.round(control.valueAsNumber / row.step) * row.step));
          updateValue(row, Math.round(value * 100) / 100);
        });
        control.addEventListener('change', () => { control.value = values[row.key]; });
      });
      if (row.unit) controls.append(node('span', '', row.unit));
    }
    container.append(controls);
    const bounds = row.type === 'number' ? ` · ${row.min}–${row.max} ${row.unit} · step ${row.step}` : '';
    const meta = node('div', 'meta', `${row.side.toUpperCase()} · Default ${row.default}${bounds}`);
    meta.dataset.default = row.key;
    meta.classList.toggle('changed', values[row.key] !== row.default);
    copy.append(meta);
    return container;
  }
  function group(title, rows, className = '') {
    const section = node('section', `column ${className}`);
    const heading = node('h3', '', title);
    heading.append(node('span', 'count', String(rows.length)));
    section.append(heading);
    if (!rows.length) section.append(node('p', 'setting-help', 'No separate settings here. Use the shared controls below.'));
    const appendRows = (target, list) => list.forEach(row => target.append(settingRow(row)));
    if (!$('folds').checked || query()) appendRows(section, rows);
    else {
      const basic = node('details'); basic.open = true;
      basic.append(node('summary', '', `BASIC · ${rows.filter(row => !row.advanced).length}`));
      appendRows(basic, rows.filter(row => !row.advanced));
      const advanced = node('details');
      advanced.append(node('summary', '', `ADVANCED · ${rows.filter(row => row.advanced).length}`));
      appendRows(advanced, rows.filter(row => row.advanced));
      if (rows.some(row => !row.advanced)) section.append(basic);
      if (rows.some(row => row.advanced)) section.append(advanced);
    }
    return section;
  }
  function presetPage() {
    const columns = node('div', 'side-columns');
    ['enemy', 'ally'].forEach(target => {
      const section = node('section', `column ${target} preset-summary`);
      section.append(node('h3', '', `${target.toUpperCase()} · CURRENT LOOK`));
      section.append(node('p', '', `Mode: ${values[`${target}Mode`]} · Low ${values[`${target}Low`]} · High ${values[`${target}High`]}`));
      const preview = node('button', '', `Preview ${target}`); preview.type = 'button';
      preview.addEventListener('click', () => { side = target; paint(); }); section.append(preview); columns.append(section);
    });
    $('rows').append(columns);
    const actions = node('div', 'preset-actions');
    const name = node('input'); name.type = 'text'; name.placeholder = 'Snapshot name'; name.maxLength = 32; name.setAttribute('aria-label', 'Snapshot name');
    const save = node('button', '', 'Keep session snapshot'); save.type = 'button';
    save.addEventListener('click', () => { presets.push({ name: name.value.trim() || `Snapshot ${presets.length + 1}`, values: { ...values } }); render(); });
    actions.append(name, save); $('rows').append(actions);
    presets.forEach(preset => { const apply = node('button', '', `Apply ${preset.name}`); apply.type = 'button'; apply.addEventListener('click', () => { Object.assign(values, preset.values); render(); }); $('rows').append(apply); });
    $('rows').append(node('p', 'setting-help', 'Snapshots disappear on reload. v2 hero routing, conditions, durable presets, import and export are not simulated in this layout study.'));
  }
  function render() {
    const text = query();
    const terms = text.split(/\s+/);
    const filtered = text ? settings.filter(row => {
      const words = `${row.name} ${row.help} ${row.keywords}`.toLowerCase().split(/[^a-z0-9#]+/);
      return terms.every(term => words.some(word => word.startsWith(term)));
    }) : settings.filter(belongs);
    $('page-title').textContent = text ? `SEARCH RESULTS · ${filtered.length}` : page.toUpperCase();
    $('page-description').textContent = text ? 'Matches from every page. All results are editable; folds are bypassed during search.' : description[page];
    $('page-kicker').textContent = text ? `SEARCH: ${text}` : byPart ? 'ORGANIZED BY PART' : 'ORGANIZED BY SIDE';
    $('rows').replaceChildren();
    if (!text && page === 'Presets') presetPage();
    else if (text || byPart || page === 'Units') {
      const columns = node('div', 'side-columns');
      ['enemy', 'ally'].forEach(target => columns.append(group(target.toUpperCase(), filtered.filter(row => row.side === target), target)));
      $('rows').append(columns);
      const shared = filtered.filter(row => row.side === 'shared');
      if (shared.length) $('rows').append(group('SHARED · BOTH SIDES', shared));
      if (!filtered.length) $('rows').append(node('p', 'setting-help', 'No matching settings. Try red, offset or name.'));
    } else {
      ['Bar', 'HP Text', 'Name', 'Indicators'].forEach(part => {
        const rows = filtered.filter(row => row.part === part);
        if (rows.length) $('rows').append(group(part.toUpperCase(), rows, page.toLowerCase()));
      });
    }
    document.querySelectorAll('#navigation button').forEach(button => {
      if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    $('kind-switch').hidden = page !== 'Units';
    paint();
  }
  function mix(a, b, amount) {
    const rgb = color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
    const first = rgb(a), second = rgb(b);
    return '#' + first.map((value, index) => Math.round(value + (second[index] - value) * Math.max(0, Math.min(1, amount))).toString(16).padStart(2, '0')).join('');
  }
  function palette(prefix, mode, highColor = values[`${prefix}High`]) {
    const low = values.lowThreshold, high = values.highThreshold;
    if (mode === 'fixed') return hp <= low ? values[`${prefix}Low`] : hp <= high ? values[`${prefix}Mid`] : highColor;
    if (hp <= low) return values[`${prefix}Low`];
    return hp <= high ? mix(values[`${prefix}Low`], values[`${prefix}Mid`], (hp - low) / Math.max(1, high - low)) : mix(values[`${prefix}Mid`], highColor, (hp - high) / Math.max(1, 100 - high));
  }
  function paint() {
    const effectiveKind = page === 'Units' ? kind === 'hero' ? 'npc' : kind : 'hero';
    const readout = side === 'ally' ? 'allyReadout' : 'readout';
    const enabled = values.enabled && (effectiveKind === 'hero' ? values[`${side}Enabled`] : effectiveKind === 'objective' ? values[`building${side === 'enemy' ? 'Enemy' : 'Ally'}Enabled`] : effectiveKind === 'neutral' ? values.npcNeutralEnabled : values[`npc${side === 'enemy' ? 'Enemy' : 'Ally'}Enabled`]);
    const stockColor = side === 'enemy' ? '#FD4949' : '#FFEFD7';
    const highColor = values[`${side}TeamHigh`] ? side === 'enemy' ? '#5B79E6' : '#E7B659' : values[`${side}High`];
    const fillColor = !enabled ? stockColor : effectiveKind === 'neutral' ? values.neutralColor : palette(side, values[`${side}Mode`], highColor);
    $('preview-title').textContent = `${effectiveKind.toUpperCase()} · ${side.toUpperCase()}`;
    document.querySelector('.stage').dataset.kind = effectiveKind;
    document.querySelectorAll('[data-side]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.side === side)));
    document.querySelectorAll('[data-kind]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kind === effectiveKind)));
    $('hp-slider').value = hp; $('hp-output').textContent = `${hp}%`;
    $('bar-visual').style.width = `${76 * (enabled ? values.widthScale : 100) / 100}px`;
    $('bar-visual').style.transform = `translate(calc(-50% + ${enabled ? values.positionX : 0}px), ${enabled ? values.positionY : 0}px)`;
    $('bar-visual').style.visibility = effectiveKind === 'hero' && !values[`${side}Visible`] && values.enabled ? 'hidden' : 'visible';
    const frame = document.querySelector('.bar-frame');
    frame.style.height = `${18 * (enabled ? values.heightScale : 100) / 100}px`;
    frame.style.borderWidth = `${enabled && values.barOutlineEnabled ? values.barOutlineThickness : 0}px`;
    frame.style.borderColor = enabled && values.barOutlineCustomColor ? values[side === 'enemy' ? 'barOutlineColor' : 'allyBarOutlineColor'] : '#000000';
    frame.style.clipPath = enabled && values.barMask === 'original' ? 'polygon(5% 0,100% 0,95% 100%,0 100%)' : 'none';
    $('bar-fill').style.width = `${hp}%`;
    $('bar-fill').style.backgroundColor = feedback === 'Healing' && enabled ? values[`${side}Healing`] : fillColor;
    $('bar-delta').style.width = `${Math.min(100, hp + (feedback === 'Damage' ? 18 : 0))}%`;
    $('bar-delta').style.backgroundColor = values[`${side}Delta`];
    $('bar-markers').hidden = !values.pipsVisible;
    $('bar-markers').style.opacity = values.pipOpacity / 100;
    $('hp-text').textContent = String(Math.round(hp * (effectiveKind === 'objective' ? 40 : effectiveKind === 'hero' ? 10 : 6)));
    $('hp-text').hidden = enabled && !values[`${readout}Visible`];
    $('hp-text').style.color = enabled && values[`${readout}ColorMode`] === 'custom' ? palette(readout, values[`${readout}Mode`]) : fillColor;
    $('hp-text').style.fontSize = `${14 * (enabled ? values[`${readout}Size`] : 100) / 100}px`;
    $('hp-text').style.transform = `translate(${enabled ? values[`${readout}OffsetX`] : 0}px, ${enabled ? values[`${readout}OffsetY`] : 0}px) rotate(${enabled ? values[`${readout}Tilt`] : 0}deg)`;
    $('hp-text').style.fontFamily = values[`${readout}Font`] === 'oracle' ? "oracle, 'Segoe UI', sans-serif" : values[`${readout}Font`] === 'pulp' ? 'pulp, Georgia, serif' : "'Segoe UI', sans-serif";
    $('hp-text').style.left = values.hpTextAlign === 'left' ? '60%' : values.hpTextAlign === 'center' ? '40%' : '0';
    $('hero-name').textContent = effectiveKind === 'hero' ? side === 'enemy' ? 'THE WARDEN' : 'LADY GEIST' : effectiveKind === 'objective' ? 'WALKER' : effectiveKind === 'neutral' ? 'NEUTRAL CAMP' : 'SENTRY';
    $('hero-name').hidden = effectiveKind === 'hero' && !values.playerNamesVisible;
    $('hero-name').style.fontSize = `${enabled ? values.nameSize : 14}px`;
    $('hero-name').style.color = enabled && values[`${side}NameColorEnabled`] ? values[`${side}NameColor`] : '#FFEFD7';
    $('hero-name').style.textAlign = values.nameAlign;
    $('hero-name').style.transform = `translate(${enabled ? values.nameOffsetX : 0}px, ${enabled ? values.nameOffsetY : 0}px) rotate(${enabled ? values.nameTilt : 0}deg)`;
    $('preview-status').textContent = `${feedback || 'Ready'} · ${enabled ? 'custom settings' : 'stock approximation (customization off)'}`;
  }
  function stop() { clearInterval(sequence); sequence = null; feedback = ''; $('play').textContent = '▶ Play damage / heal'; }
  $('layout-label').textContent = byPart ? 'BY PART OF THE BAR' : 'BY SIDE';
  if (!byPart) { $('other-layout').href = 'by-part.html'; $('other-layout').textContent = 'Compare by part →'; }
  pages.forEach((name, index) => {
    const button = node('button'); button.type = 'button'; button.dataset.page = name;
    button.append(node('span', '', String(index + 1).padStart(2, '0')), node('strong', '', name));
    button.addEventListener('click', () => { page = name; if (name === 'Enemy' || name === 'Ally') side = name.toLowerCase(); stop(); $('search').value = ''; render(); document.querySelector('main').scrollTop = 0; });
    $('navigation').append(button);
  });
  $('search-toggle').addEventListener('click', () => {
    $('search-wrap').hidden = !$('search-wrap').hidden;
    $('search-toggle').setAttribute('aria-expanded', String(!$('search-wrap').hidden));
    if (!$('search-wrap').hidden) $('search').focus(); else $('search').value = '';
    render();
    document.querySelector('main').scrollTop = 0;
  });
  $('search').addEventListener('input', render);
  $('search').addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); $('search-toggle').click(); $('search-toggle').focus(); } });
  $('folds').addEventListener('change', render);
  document.querySelectorAll('[data-side]').forEach(button => button.addEventListener('click', () => { side = button.dataset.side; paint(); }));
  document.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => { kind = button.dataset.kind; paint(); }));
  $('hp-slider').addEventListener('input', () => { stop(); hp = Number($('hp-slider').value); paint(); });
  $('play').addEventListener('click', () => {
    if (sequence !== null) { stop(); paint(); return; }
    const steps = [90, 72, 45, 20, 8, 28, 52, 78, 100]; let index = 0;
    $('play').textContent = '■ Stop sequence';
    sequence = setInterval(() => { const next = steps[index++]; feedback = next < hp ? 'Damage' : 'Healing'; hp = next; paint(); if (index === steps.length) { stop(); paint(); } }, 450);
  });
  $('reset').addEventListener('click', () => { stop(); settings.forEach(row => { values[row.key] = row.default; }); hp = 75; render(); });
  render();
})();
