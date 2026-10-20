// MTC Informant 1.1.0
// Автор: нейросеть Claude. Создатель всех идей: Komarchik (TG: @komarchikoff)
import { world, system, Player } from '@minecraft/server';
import { ActionFormData, FormCancelationReason } from '@minecraft/server-ui';
import { SECTIONS, SEARCH_RADIUS, SOUND_VOLUME, TRAIN_NAMESPACES, TRAIN_ENTITY_IDS } from './config.js';

const ITEM_ID = 'mtcinformant:informant';
const PROP_SECTION = 'mtcinformant:section'; // выбранный раздел у игрока
const PROP_LAST = 'mtcinformant:last_sound'; // последний включённый звук
const ICON_BACK = 'textures/mtcinformant/ui/back';
const ICON_SOUND = 'textures/mtcinformant/ui/sound';
const ICON_SECTION = 'textures/mtcinformant/ui/section';

// ---------------------------------------------------------------------
//  Разделы из дополнений (отдельных паков, например «Каховская линия»).
//  Дополнение при загрузке мира присылает событие mtcinformant:add_section
//  и mtcinformant:add_sound; мы просим их повторить через mtcinformant:request.
// ---------------------------------------------------------------------
const ADDON_SECTIONS = [];
const allSections = () => [...SECTIONS, ...ADDON_SECTIONS];
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  let data;
  try { data = JSON.parse(ev.message || '{}'); } catch { return; }
  if (ev.id === 'mtcinformant:add_section') {
    const id = str(data.id, 64);
    if (!id) return;
    let sec = allSections().find((s) => s.id === id);
    if (!sec) { sec = { id, name: id, sounds: [] }; ADDON_SECTIONS.push(sec); }
    if (ADDON_SECTIONS.includes(sec)) {
      sec.name = str(data.name, 64) || sec.name;
      sec.icon = str(data.icon, 128) || sec.icon;
    }
  } else if (ev.id === 'mtcinformant:add_sound') {
    const sid = str(data.section, 64);
    const id = str(data.id, 128);
    if (!sid || !id.startsWith('mtcinformant:')) return;
    let sec = allSections().find((s) => s.id === sid);
    if (!sec) { sec = { id: sid, name: sid, sounds: [] }; ADDON_SECTIONS.push(sec); }
    if (!ADDON_SECTIONS.includes(sec)) return; // встроенные разделы меняются только в config.js
    const name = str(data.name, 64) || id;
    const old = sec.sounds.find((s) => s.id === id);
    if (old) old.name = name;
    else sec.sounds.push({ id, name });
  }
}, { namespaces: ['mtcinformant'] });

// На случай, если дополнение загрузилось раньше нас — просим прислать всё ещё раз
system.runTimeout(() => {
  try { system.sendScriptEvent('mtcinformant:request', ''); } catch { /* ничего страшного */ }
}, 20);

const tr = (key, ...args) => ({ translate: key, with: args.map(String) });
const lines = (...parts) => ({ rawtext: parts.flatMap((p, i) => (i ? [{ text: '\n' }, p] : [p])) });

// Нажали предметом (ПКМ / долгое нажатие на телефоне) — открываем информатор
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (!itemStack || itemStack.typeId !== ITEM_ID || !(source instanceof Player)) return;
  system.run(() => openInformant(source));
});

function openInformant(player) {
  const saved = player.getDynamicProperty(PROP_SECTION);
  const section = allSections().find((s) => s.id === saved);
  if (section) showSection(player, section);
  else showSectionPicker(player);
}

// Показ формы; если игрок занят (открыт чат и т.п.) — пробуем ещё пару раз
async function show(player, form, tries = 3) {
  const res = await form.show(player);
  if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy && tries > 0) {
    await new Promise((r) => system.runTimeout(() => r(undefined), 10));
    return show(player, form, tries - 1);
  }
  return res;
}

async function showSectionPicker(player) {
  const form = new ActionFormData().title(tr('mtcinformant.ui.title'));
  const sections = allSections();
  if (!sections.length) {
    form.body(tr('mtcinformant.ui.no_sections'));
    await show(player, form);
    return;
  }
  form.body(tr('mtcinformant.ui.choose_section'));
  for (const s of sections) form.button(`§l${s.name}§r\n§8${s.sounds.length} ♪`, s.icon || ICON_SECTION);
  const res = await show(player, form);
  if (res.canceled || res.selection === undefined) return;
  const section = sections[res.selection];
  player.setDynamicProperty(PROP_SECTION, section.id);
  showSection(player, section);
}

async function showSection(player, section) {
  const lastId = player.getDynamicProperty(PROP_LAST);
  const last = section.sounds.find((s) => s.id === lastId);
  const form = new ActionFormData()
    .title(tr('mtcinformant.ui.title'))
    .body(lines(
      tr('mtcinformant.ui.section', section.name),
      last ? tr('mtcinformant.ui.last', last.name) : tr('mtcinformant.ui.last', '—'),
      { text: '' },
      section.sounds.length ? tr('mtcinformant.ui.hint', SEARCH_RADIUS) : tr('mtcinformant.ui.empty'),
    ));
  // в самом верху — «Назад», чтобы выбрать другой раздел
  form.button(tr('mtcinformant.ui.back'), ICON_BACK);
  for (const s of section.sounds) form.button(`§l${s.name}`, ICON_SOUND);

  const res = await show(player, form);
  if (res.canceled || res.selection === undefined) return;
  if (res.selection === 0) {
    player.setDynamicProperty(PROP_SECTION, undefined);
    showSectionPicker(player);
    return;
  }
  const sound = section.sounds[res.selection - 1];
  if (playInNearestCar(player, sound)) {
    player.setDynamicProperty(PROP_LAST, sound.id);
    player.onScreenDisplay.setActionBar(tr('mtcinformant.msg.playing', section.name, sound.name));
  }
}

function isTrainCar(entity) {
  const id = entity.typeId;
  const ns = id.includes(':') ? id.slice(0, id.indexOf(':')) : 'minecraft';
  if (ns === 'mtcinformant') return false;
  return TRAIN_ENTITY_IDS.includes(id) || TRAIN_NAMESPACES.includes(ns);
}

// Звук играет в одном вагоне — самом близком к игроку (не дальше SEARCH_RADIUS)
function playInNearestCar(player, sound) {
  const dim = player.dimension;
  const at = player.location;
  let nearby;
  try {
    nearby = dim.getEntities({ location: at, maxDistance: SEARCH_RADIUS });
  } catch {
    nearby = [];
  }
  let best = null;
  let bestD = Infinity;
  for (const e of nearby) {
    if (!e.isValid || !isTrainCar(e)) continue;
    const l = e.location;
    const d = (l.x - at.x) ** 2 + (l.y - at.y) ** 2 + (l.z - at.z) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) {
    // подсказка для настройки: какие сущности рядом
    const kinds = [...new Set(nearby
      .map((e) => e.typeId)
      .filter((t) => t !== 'minecraft:player' && t !== 'minecraft:item'))].slice(0, 8);
    const msg = [tr('mtcinformant.msg.no_train', SEARCH_RADIUS)];
    if (kinds.length) msg.push(tr('mtcinformant.msg.nearby', kinds.join(', ')));
    player.sendMessage(lines(...msg));
    return false;
  }
  dim.playSound(sound.id, best.location, { volume: SOUND_VOLUME });
  return true;
}
