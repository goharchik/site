// MTC Informant 1.2.0
// Автор: нейросеть Claude. Создатель всех идей: Komarchik (TG: @komarchikoff)
import { world, system, Player } from '@minecraft/server';
import { ActionFormData, FormCancelationReason } from '@minecraft/server-ui';
import {
  SECTIONS, SEARCH_RADIUS, SOUND_VOLUME, TRAIN_NAMESPACES, TRAIN_ENTITY_IDS,
  WHOLE_TRAIN, COUPLE_DISTANCE, COUPLE_MAX_ANGLE, MAX_CARS, MIN_SOUND_SPACING,
} from './config.js';

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
  const cars = playInTrain(player, sound);
  if (cars > 0) {
    player.setDynamicProperty(PROP_LAST, sound.id);
    player.onScreenDisplay.setActionBar(cars > 1
      ? tr('mtcinformant.msg.playing_train', section.name, sound.name, cars)
      : tr('mtcinformant.msg.playing', section.name, sound.name));
  }
}

function isTrainCar(entity) {
  const id = entity.typeId;
  const ns = id.includes(':') ? id.slice(0, id.indexOf(':')) : 'minecraft';
  if (ns === 'mtcinformant') return false;
  return TRAIN_ENTITY_IDS.includes(id) || TRAIN_NAMESPACES.includes(ns);
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

// Сцеплены ли вагоны: рядом, на одной высоте и стоят друг за другом вдоль пути.
// Данные сцепки MTC другим модам недоступны, поэтому судим по расположению.
function coupled(a, b) {
  const pa = a.location, pb = b.location;
  if (Math.abs(pa.y - pb.y) > 3) return false;
  const dx = pb.x - pa.x, dz = pb.z - pa.z;
  const len = Math.hypot(dx, dz);
  if (len > COUPLE_DISTANCE) return false;
  if (COUPLE_MAX_ANGLE === false || len < 0.5) return true;
  let ya, yb;
  try { ya = (a.getRotation().y * Math.PI) / 180; yb = (b.getRotation().y * Math.PI) / 180; } catch { return true; }
  // Среднее направление двух вагонов (как ось: «вперёд» и «назад» одно и то же).
  // На кривой линия между центрами вагонов идёт ровно по этому среднему,
  // а у составов на соседних путях — наискосок.
  const axis = (yaw) => [Math.cos(2 * yaw), Math.sin(2 * yaw)];
  const [ax, az] = axis(ya), [bx, bz] = axis(yb);
  const mean = Math.atan2(az + bz, ax + bx) / 2;
  const fx = -Math.sin(mean), fz = Math.cos(mean);
  const cos = Math.abs((fx * dx + fz * dz) / len);
  return cos >= Math.cos((COUPLE_MAX_ANGLE * Math.PI) / 180);
}

// Весь состав: от первого вагона по цепочке к соседним
function collectTrain(first) {
  const train = [first];
  const seen = new Set([first.id]);
  for (let i = 0; i < train.length && train.length < MAX_CARS; i++) {
    const a = train[i];
    let near;
    try { near = a.dimension.getEntities({ location: a.location, maxDistance: COUPLE_DISTANCE }); } catch { near = []; }
    // сначала ближние — так цепочка идёт по порядку вагонов
    near.sort((x, y) => dist2(x.location, a.location) - dist2(y.location, a.location));
    for (const b of near) {
      if (train.length >= MAX_CARS) break;
      if (seen.has(b.id) || !b.isValid || !isTrainCar(b) || !coupled(a, b)) continue;
      seen.add(b.id);
      train.push(b);
    }
  }
  return train;
}

// Звук играет в ближайшем к игроку вагоне (не дальше SEARCH_RADIUS),
// а если WHOLE_TRAIN — ещё и во всех сцепленных с ним вагонах.
// Возвращает, в скольких вагонах включился звук (0 — вагон не найден).
function playInTrain(player, sound) {
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
    const d = dist2(l, at);
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
    return 0;
  }
  const cars = WHOLE_TRAIN ? collectTrain(best) : [best];
  // не повторяем звук там, где он уже играет (несколько сущностей в одном вагоне)
  const spots = [];
  const minD2 = MIN_SOUND_SPACING * MIN_SOUND_SPACING;
  for (const car of cars) {
    const l = car.location;
    if (spots.some((p) => dist2(p, l) < minD2)) continue;
    spots.push(l);
    dim.playSound(sound.id, l, { volume: SOUND_VOLUME });
  }
  return spots.length;
}
