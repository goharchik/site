// =====================================================================
//  MTC Informant: НАСТРОЙКИ / SETTINGS
//  Здесь добавляются разделы и звуки информатора (смотри гайд).
//  Add informant sections and sounds here (see the guide).
// =====================================================================

// Радиус поиска вагона MTC вокруг игрока, в блоках.
// How far from the player to look for an MTC car, in blocks.
export const SEARCH_RADIUS = 15;

// Громкость звука в вагоне (1 = обычная).
// Sound volume in the car (1 = normal).
export const SOUND_VOLUME = 1;

// Как узнать вагон MTC: начало ID сущности (до двоеточия).
// Если информатор пишет «рядом нет вагона», он покажет ID сущностей рядом:
// впиши нужный сюда (например "mtc" для сущностей вида mtc:что-то).
// How to recognise an MTC car: the start of the entity ID (before the colon).
// If the informant says "no car nearby", it lists nearby entity IDs:
// put the right one here (e.g. "mtc" for entities like mtc:something).
export const TRAIN_NAMESPACES = ['mtc'];

// Точные ID сущностей вагонов, если по началу ID не находится.
// Exact car entity IDs, if matching by namespace is not enough.
export const TRAIN_ENTITY_IDS = [];

// ---------------------------------------------------------------------
//  РАЗДЕЛЫ И ЗВУКИ / SECTIONS AND SOUNDS
//
//  id    — короткое имя раздела латиницей, без пробелов (не меняй потом,
//          иначе игрокам придётся выбрать раздел заново)
//  name  — название раздела, его видят игроки
//  icon  — картинка кнопки (можно не трогать)
//  sounds:
//    id   — ID звука из sound_definitions.json, всегда начинается с mtcinformant:
//    name — название звука, его видят игроки
//
//  id    — short Latin section name without spaces (do not change it later)
//  name  — section title shown to players
//  sounds: id — sound ID from sound_definitions.json (starts with mtcinformant:),
//          name — sound title shown to players
// ---------------------------------------------------------------------
export const SECTIONS = [
  {
    id: 'examples',
    name: 'Примеры сигналов',
    icon: 'textures/mtcinformant/ui/section',
    sounds: [
      { id: 'mtcinformant:examples.chime', name: 'Динь-дон (перед объявлением)' },
      { id: 'mtcinformant:examples.doors', name: 'Сигнал «двери закрываются»' },
    ],
  },
  // Новый раздел добавляется так (убери // в начале строк):
  // A new section is added like this (remove // at the start of the lines):
  // {
  //   id: 'line1',
  //   name: 'Линия 1',
  //   icon: 'textures/mtcinformant/ui/section',
  //   sounds: [
  //     { id: 'mtcinformant:line1.station1', name: 'Станция 1' },
  //   ],
  // },
];
